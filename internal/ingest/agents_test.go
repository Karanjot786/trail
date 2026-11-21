package ingest

import (
	"net/http"
	"sync"
	"testing"

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
