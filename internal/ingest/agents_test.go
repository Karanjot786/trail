package ingest

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"trail/internal/agents"
	"trail/internal/store"
)

// fakeClassifier records every Input and answers from fn.
type fakeClassifier struct {
	mu  sync.Mutex
	ins []agents.Input
	fn  func(agents.Input) agents.Result
}

func (f *fakeClassifier) Classify(in agents.Input) agents.Result {
	f.mu.Lock()
	f.ins = append(f.ins, in)
	f.mu.Unlock()
	return f.fn(in)
}

type agentRow struct {
	agent, via string
	bot        int
}

func storedAgents(t *testing.T, st *store.Store) []agentRow {
	t.Helper()
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	rs, err := st.DB().Query(`SELECT agent, agent_via, is_bot FROM events ORDER BY rowid`)
	if err != nil {
		t.Fatal(err)
	}
	defer rs.Close()
	var out []agentRow
	for rs.Next() {
		var a agentRow
		if err := rs.Scan(&a.agent, &a.via, &a.bot); err != nil {
			t.Fatal(err)
		}
		out = append(out, a)
	}
	return out
}

func TestIngestClassifierInput(t *testing.T) {
	fc := &fakeClassifier{fn: func(in agents.Input) agents.Result {
		if in.Signed.Authority == "example.com" && in.Signed.Signature != "" {
			return agents.Result{ID: "chatgpt-agent", Via: agents.ViaSig}
		}
		return agents.Result{}
	}}
	st, h, tok := edgeSetup(t, WithAgents(fc))
	r := forward(tok, "203.0.113.1", "", "", batch(2, func(int) string { return pageview }))
	r.Header.Set("Signature-Agent", `"https://chatgpt.com"`)
	r.Header.Set("Signature-Input", `sig1=("@authority");created=1;keyid="k";tag="web-bot-auth"`)
	r.Header.Set("Signature", `sig1=:AAAA:`)
	if c := serve(t, h, r); c != http.StatusNoContent {
		t.Fatalf("status %d", c)
	}
	if len(fc.ins) != 1 {
		t.Fatalf("Classify ran %d times for one request with a verified host, want 1", len(fc.ins))
	}
	in := fc.ins[0]
	if in.Site != "s1" || in.IP != "203.0.113.1" || in.UA != iphoneUA || in.Signed.SignatureAgent != `"https://chatgpt.com"` ||
		in.Signed.SignatureInput == "" || in.HostOK == nil || !in.HostOK("example.com") || in.HostOK("evil.example") {
		t.Fatalf("input %+v", in)
	}
	rs := storedAgents(t, st)
	if len(rs) != 2 || rs[0] != (agentRow{"chatgpt-agent", "sig", 1}) || rs[1] != rs[0] {
		t.Fatalf("rows %+v", rs)
	}
}

func TestIngestClassifierRetriesRequestHost(t *testing.T) {
	fc := &fakeClassifier{fn: func(in agents.Input) agents.Result {
		if in.Signed.Authority == "trail.example.net" {
			return agents.Result{ID: "chatgpt-agent", Via: agents.ViaSig}
		}
		return agents.Result{}
	}}
	st, h, tok := edgeSetup(t, WithAgents(fc))
	r := forward(tok, "203.0.113.1", "", "", pageview)
	r.Host = "trail.example.net"
	r.Header.Set("Signature-Agent", `"https://chatgpt.com"`)
	serve(t, h, r)
	if len(fc.ins) != 2 || fc.ins[0].Signed.Authority != "example.com" || fc.ins[1].Signed.Authority != "trail.example.net" {
		t.Fatalf("authorities tried: %+v", fc.ins)
	}
	if rs := storedAgents(t, st); len(rs) != 1 || rs[0].via != "sig" {
		t.Fatalf("rows %+v", rs)
	}
}

func TestIngestClassifierNoProxyUsesRequestHost(t *testing.T) {
	fc := &fakeClassifier{fn: func(agents.Input) agents.Result { return agents.Result{} }}
	st, h, _ := edgeSetup(t, WithAgents(fc))
	r := beacon("203.0.113.5", pageview, map[string]string{"X-Trail-Host": "forged.example"}) // unsigned: ignored
	r.Host = "trail.example.net"
	serve(t, h, r)
	if len(fc.ins) != 1 || fc.ins[0].Signed.Authority != "trail.example.net" || fc.ins[0].IP != "203.0.113.5" {
		t.Fatalf("inputs %+v", fc.ins)
	}
	// A beacon straight to Trail is signed for Trail's own host.
	if ok := fc.ins[0].HostOK; ok == nil || !ok("trail.example.net") || ok("forged.example") {
		t.Fatal("HostOK must accept Trail's own host for a direct beacon, and nothing forged")
	}
	if rs := storedAgents(t, st); len(rs) != 1 || rs[0] != (agentRow{"", "", 0}) {
		t.Fatalf("rows %+v", rs)
	}
}

func TestIngestNilOptions(t *testing.T) {
	st, h := setup(t)
	if w := post(h, pageview); w.Code != http.StatusNoContent {
		t.Fatalf("status %d", w.Code)
	}
	if rs := storedAgents(t, st); len(rs) != 1 || rs[0] != (agentRow{"", "", 0}) {
		t.Fatalf("rows %+v", rs)
	}
	if g := geoRows(t, st); len(g) != 1 || g[0][len(g[0])-1] != '|' {
		t.Fatalf("geo_src set without a resolver: %q", g)
	}
}

// The research's Claude agent user agent.
const claudeAgentUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Claude-Agent/1.0"

const chromeUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

func TestIngestMarksClaudeAgent(t *testing.T) {
	dir := agents.NewDirectory(agents.DirOptions{Disabled: true})
	st, h, _ := edgeSetup(t, WithAgents(dir))
	serve(t, h, beacon("203.0.113.5", pageview, map[string]string{"User-Agent": claudeAgentUA}))
	if rs := storedAgents(t, st); len(rs) != 1 || rs[0] != (agentRow{"claude-agent", "ua", 1}) {
		t.Fatalf("rows %+v", rs)
	}
}

func TestIngestHumanUnchanged(t *testing.T) {
	dir := agents.NewDirectory(agents.DirOptions{Disabled: true})
	full := func(st *store.Store) string {
		t.Helper()
		if err := st.Flush(); err != nil {
			t.Fatal(err)
		}
		var s string
		err := st.DB().QueryRow(`SELECT site_id||type||anon_id||session_id||host||path||route||referrer_host||utm_source||country||region||city||
			device||browser||os||env||is_bot||agent||agent_via||geo_src FROM events`).Scan(&s)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	stA, reg := newRegistry(t, map[string]string{"s1": "example.com"})
	hA := New(stA, cityGeo(t), reg) // today's handler: no resolver, no classifier
	stB, hB, _ := edgeSetup(t, WithAgents(dir))
	for _, h := range []http.Handler{hA, hB} {
		serve(t, h, beacon("203.0.113.5", pageview, map[string]string{"User-Agent": chromeUA}))
	}
	if a, b := full(stA), full(stB); a != b {
		t.Fatalf("a plain Chrome beacon changed:\n%s\n%s", a, b)
	}
}

// keyServer serves one Ed25519 key as a Web Bot Auth key directory and
// returns a directory whose openai-keys list points at it, already fetched.
func keyServer(t *testing.T, pub ed25519.PublicKey) (*agents.Directory, string) {
	t.Helper()
	x := base64.RawURLEncoding.EncodeToString(pub)
	sum := sha256.Sum256([]byte(`{"crv":"Ed25519","kty":"OKP","x":"` + x + `"}`))
	kid := base64.RawURLEncoding.EncodeToString(sum[:])
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/http-message-signatures-directory+json")
		_, _ = w.Write([]byte(`{"keys":[{"kty":"OKP","crv":"Ed25519","x":"` + x + `"}]}`))
	}))
	t.Cleanup(srv.Close)
	dir := agents.NewDirectory(agents.DirOptions{Client: srv.Client(), URLs: map[string]string{"openai-keys": srv.URL + "/keys"}})
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	dir.Start(ctx)
	deadline := time.Now().Add(5 * time.Second)
	for {
		for _, s := range dir.Status() {
			if s.Name == "openai-keys" && s.OK {
				return dir, kid
			}
		}
		if time.Now().After(deadline) {
			t.Fatal("key directory never fetched")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// signAgent signs like ChatGPT agent (Web Bot Auth) for authority.
func signAgent(priv ed25519.PrivateKey, kid, authority string) map[string]string {
	sa := `"https://chatgpt.com"`
	params := fmt.Sprintf(`("@authority" "signature-agent");created=%d;expires=%d;keyid="%s";nonce="bm9uY2U";tag="web-bot-auth"`,
		time.Now().Unix()-5, time.Now().Unix()+60, kid)
	base := `"@authority": ` + authority + "\n" + `"signature-agent": ` + sa + "\n" + `"@signature-params": ` + params
	sig := ed25519.Sign(priv, []byte(base))
	return map[string]string{
		"Signature-Agent": sa,
		"Signature-Input": "sig1=" + params,
		"Signature":       "sig1=:" + base64.StdEncoding.EncodeToString(sig) + ":",
		"User-Agent":      chromeUA,
	}
}

func TestIngestSignedBeacon(t *testing.T) {
	priv := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{9}, 32))
	dir, kid := keyServer(t, priv.Public().(ed25519.PublicKey))
	st, h, _ := edgeSetup(t, WithAgents(dir))
	r := beacon("203.0.113.5", pageview, signAgent(priv, kid, "trail.example.net"))
	r.Host = "trail.example.net"
	serve(t, h, r)
	// A signature for another authority is not this request's.
	r = beacon("203.0.113.5", pageview, signAgent(priv, kid, "elsewhere.example"))
	r.Host = "trail.example.net"
	serve(t, h, r)
	rs := storedAgents(t, st)
	if len(rs) != 2 || rs[0] != (agentRow{"chatgpt-agent", "sig", 1}) || rs[1].via == "sig" {
		t.Fatalf("rows %+v", rs)
	}
}

func TestIngestSignedViaProxy(t *testing.T) {
	priv := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{9}, 32))
	dir, kid := keyServer(t, priv.Public().(ed25519.PublicKey))
	st, h, tok := edgeSetup(t, WithAgents(dir))
	// The agent signed its request to the site (example.com); the proxy
	// forwards it to Trail with X-Trail-Host: example.com.
	r := forward(tok, "203.0.113.1", "", "", pageview)
	r.Host = "trail.example.net"
	for k, v := range signAgent(priv, kid, "example.com") {
		r.Header.Set(k, v)
	}
	serve(t, h, r)
	// The same signed headers without a valid proxy HMAC: the forged host is ignored.
	r = forward(tok, "203.0.113.1", "", "", pageview)
	r.Host = "trail.example.net"
	r.Header.Set("X-Trail-Proxy", "v1;bad")
	for k, v := range signAgent(priv, kid, "example.com") {
		r.Header.Set(k, v)
	}
	serve(t, h, r)
	rs := storedAgents(t, st)
	if len(rs) != 2 || rs[0] != (agentRow{"chatgpt-agent", "sig", 1}) || rs[1].via == "sig" {
		t.Fatalf("rows %+v", rs)
	}
}
