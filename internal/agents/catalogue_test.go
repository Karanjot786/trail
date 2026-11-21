package agents

import "testing"

// claudeAgentUA is the example from Anthropic's Claude-Agent page.
const claudeAgentUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-Agent/1.0) Chrome/154.0.0.0 Safari/537.36"

func TestMatchUA(t *testing.T) {
	for _, c := range []struct{ ua, want string }{
		{claudeAgentUA, "claude-agent"},
		{"Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko; compatible; Google-Agent; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-agent) Chrome/141.0.0.0 Mobile Safari/537.36", "google-agent"},
		{"GoogleAgent-Mariner/1.0", "google-agent"},
		{"mozilla/5.0 (compatible; claude-agent/1.0)", "claude-agent"},
		{"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36", ""},
		{"Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", ""},
		{"Claude-User/1.0", ""},
		{"", ""},
	} {
		a, ok := MatchUA(c.ua)
		if ok != (c.want != "") || a.ID != c.want {
			t.Errorf("MatchUA(%q) = %q %v, want %q", c.ua, a.ID, ok, c.want)
		}
	}
}

func TestCatalogueIDsUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, a := range Catalogue {
		if a.ID == "" || a.Name == "" || a.Provider == "" || seen[a.ID] {
			t.Errorf("bad or duplicate entry %+v", a)
		}
		seen[a.ID] = true
		if got, ok := Lookup(a.ID); !ok || got.ID != a.ID {
			t.Errorf("Lookup(%q) = %+v %v", a.ID, got, ok)
		}
	}
	for _, id := range []string{"claude-agent", "google-agent", "chatgpt-agent"} {
		if !seen[id] {
			t.Errorf("missing %s", id)
		}
	}
	if _, ok := Lookup("nope"); ok {
		t.Error("Lookup(nope) matched")
	}
}

func TestBySignatureAgent(t *testing.T) {
	for _, c := range []struct{ origin, want string }{
		{"https://chatgpt.com", "chatgpt-agent"},
		{"https://chatgpt.com/", "chatgpt-agent"},
		{"https://agent.bot.goog", "google-agent"},
		{"https://chatgpt.com.evil.example", ""},
		{"http://chatgpt.com", ""},
		{"http://169.254.169.254", ""},
		{"", ""},
	} {
		a, ok := BySignatureAgent(c.origin)
		if ok != (c.want != "") || a.ID != c.want {
			t.Errorf("BySignatureAgent(%q) = %q %v, want %q", c.origin, a.ID, ok, c.want)
		}
	}
}
