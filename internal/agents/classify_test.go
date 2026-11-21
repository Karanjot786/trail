package agents

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"net/http"
	"testing"
	"time"
)

const chromeUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"

// classifyDir is a directory with Google's agent list (192.0.2.0/24) and
// OpenAI's key directory (the test key) loaded, on a fixed clock.
func classifyDir(t *testing.T, now *time.Time) *Directory {
	t.Helper()
	x := base64.RawURLEncoding.EncodeToString(testPriv.Public().(ed25519.PublicKey))
	srv, _ := listServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/keys" {
			_, _ = w.Write([]byte(`{"keys":[{"kty":"OKP","crv":"Ed25519","x":"` + x + `","kid":"` + testKeyID + `"}]}`))
			return
		}
		_, _ = w.Write([]byte(prefixDoc))
	})
	d := testDir(srv, map[string]string{"google-agents": srv.URL + "/g", "openai-keys": srv.URL + "/keys"}, func() time.Time { return *now })
	for _, l := range d.lists {
		if err := d.refresh(context.Background(), l); err != nil {
			t.Fatal(err)
		}
	}
	return d
}

func TestClassifyOrder(t *testing.T) {
	now := testNow
	d := classifyDir(t, &now)
	sig := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "shop.example"})
	const listIP, otherIP = "192.0.2.5", "198.51.100.5"
	relayUA := chromeUA + " relay"
	if r := d.RelaySigned("s", listIP, relayUA, sig, func(h string) bool { return h == "shop.example" }); r.ID != "chatgpt-agent" {
		t.Fatalf("relay = %+v", r)
	}
	googleUA := "compatible; Google-Agent"
	for _, c := range []struct {
		name string
		in   Input
		want Result
	}{
		{"sig beats all", Input{Site: "s", UA: googleUA, IP: listIP, Signed: sig}, Result{"chatgpt-agent", ViaSig}},
		{"relay beats ip and ua", Input{Site: "s", UA: relayUA, IP: listIP}, Result{"chatgpt-agent", ViaRelay}},
		{"ip beats ua", Input{Site: "s", UA: claudeAgentUA, IP: listIP}, Result{"google-agent", ViaIP}},
		{"ua", Input{Site: "s", UA: googleUA, IP: otherIP}, Result{"google-agent", ViaUA}},
		{"bad sig falls back", Input{Site: "s", UA: googleUA, IP: otherIP, Signed: Signed{Authority: "x", SignatureAgent: `"https://chatgpt.com"`, SignatureInput: "((", Signature: "x"}}, Result{"google-agent", ViaUA}},
		{"relay is per site", Input{Site: "other", UA: relayUA, IP: otherIP}, Result{}},
	} {
		if got := d.Classify(c.in); got != c.want {
			t.Errorf("%s: %+v, want %+v", c.name, got, c.want)
		}
	}
}

func TestClassifyIPWithoutUAToken(t *testing.T) {
	now := testNow
	d := classifyDir(t, &now)
	if r := d.Classify(Input{Site: "s", UA: chromeUA, IP: "192.0.2.77"}); r != (Result{"google-agent", ViaIP}) {
		t.Errorf("%+v", r)
	}
	if r := d.Classify(Input{Site: "s", UA: chromeUA, IP: "::ffff:192.0.2.77"}); r != (Result{"google-agent", ViaIP}) {
		t.Errorf("mapped: %+v", r)
	}
}

func TestClassifyUAOnlyIsClaimed(t *testing.T) {
	d := NewDirectory(DirOptions{Disabled: true})
	r := d.Classify(Input{Site: "s", UA: claudeAgentUA, IP: "203.0.113.1"})
	if r != (Result{"claude-agent", ViaUA}) || r.Via.Verified() {
		t.Errorf("%+v", r)
	}
}

func TestClassifyHumanIsEmpty(t *testing.T) {
	now := testNow
	d := classifyDir(t, &now)
	for _, in := range []Input{
		{Site: "s", UA: chromeUA, IP: "203.0.113.1"},
		{Site: "s", UA: "", IP: ""},
		{Site: "s", UA: "ClaudeBot/1.0", IP: "not-an-ip"},
	} {
		if r := d.Classify(in); r != (Result{}) {
			t.Errorf("%+v → %+v", in, r)
		}
	}
}

func TestRelayExpiresAfter30m(t *testing.T) {
	now := testNow
	d := classifyDir(t, &now)
	sig := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "shop.example"})
	d.RelaySigned("s", "203.0.113.9", chromeUA, sig, func(string) bool { return true })
	in := Input{Site: "s", UA: chromeUA, IP: "203.0.113.9"}
	now = now.Add(29 * time.Minute)
	if r := d.Classify(in); r.Via != ViaRelay {
		t.Fatalf("at 29 min: %+v", r)
	}
	now = now.Add(2 * time.Minute)
	if r := d.Classify(in); r != (Result{}) {
		t.Errorf("at 31 min: %+v", r)
	}
}

func TestRelayEvictsOldest(t *testing.T) {
	now := testNow
	c := newRelayCache(func() time.Time { return now })
	c.max = 3
	for _, ua := range []string{"a", "b", "c", "d"} {
		c.put("s", "203.0.113.1", ua, "chatgpt-agent")
		now = now.Add(time.Second)
	}
	if _, ok := c.get("s", "203.0.113.1", "a"); ok {
		t.Error("oldest kept")
	}
	for _, ua := range []string{"b", "c", "d"} {
		if _, ok := c.get("s", "203.0.113.1", ua); !ok {
			t.Errorf("%s evicted", ua)
		}
	}
	if c.len() != 3 {
		t.Errorf("len %d", c.len())
	}
}

func TestRelayRejectsForeignHost(t *testing.T) {
	now := testNow
	d := classifyDir(t, &now)
	sig := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "evil.example"})
	if r := d.RelaySigned("s", "203.0.113.9", chromeUA, sig, func(h string) bool { return h == "shop.example" }); r != (Result{}) {
		t.Errorf("foreign host relayed: %+v", r)
	}
	if r := d.RelaySigned("s", "203.0.113.9", chromeUA, sig, nil); r != (Result{}) {
		t.Errorf("nil hostOK relayed: %+v", r)
	}
	bad := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "shop.example"})
	bad.Signature = "sig1=:AAAA:"
	if r := d.RelaySigned("s", "203.0.113.9", chromeUA, bad, func(string) bool { return true }); r != (Result{}) {
		t.Errorf("bad signature relayed: %+v", r)
	}
	if d.relay.len() != 0 {
		t.Errorf("cache holds %d entries", d.relay.len())
	}
}
