package enrich

import (
	"testing"
)

func TestParseUA(t *testing.T) {
	tests := []struct {
		name, ua            string
		device, browser, os string
		bot                 bool
	}{
		{name: "iphone safari", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
			device: "mobile", browser: "Safari", os: "iOS"},
		{name: "mac chrome", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			device: "desktop", browser: "Chrome", os: "Mac"},
		{name: "googlebot", ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", bot: true},
		{name: "headless", ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36", bot: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d, b, o, bot := ParseUA(tt.ua)
			if bot != tt.bot {
				t.Fatalf("bot = %v, want %v", bot, tt.bot)
			}
			if tt.bot {
				return
			}
			if d != tt.device || b != tt.browser || o != tt.os {
				t.Fatalf("got %s/%s/%s, want %s/%s/%s", d, b, o, tt.device, tt.browser, tt.os)
			}
		})
	}
}

func TestDeriveRoute(t *testing.T) {
	tests := map[string]string{
		"/blog/123": "/blog/:id",
		"/u/550e8400-e29b-41d4-a716-446655440000": "/u/:id",
		"/docs/components":                        "/docs/components",
		"/a/9f86d081884c7d65":                     "/a/:id",
		"/":                                       "/",
	}
	for in, want := range tests {
		if got := DeriveRoute(in); got != want {
			t.Errorf("DeriveRoute(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestDeriveEnv(t *testing.T) {
	tests := []struct{ host, domain, given, want string }{
		{"example.com", "example.com", "preview", "preview"},
		{"example.com", "example.com", "", "production"},
		{"www.example.com", "example.com", "", "production"},
		{"x-git.vercel.app", "example.com", "", "preview"},
		{"localhost:3000", "example.com", "", "development"},
		{"127.0.0.1:8080", "example.com", "", "development"},
		{"blog.example.com", "example.com", "", "production"},
		{"app.eu.example.com", "example.com", "", "production"},
		{"www.blog.example.com", "example.com", "", "production"},
		{"staging.example.com", "example.com", "", "preview"},
		{"pr-12.example.com", "example.com", "", "preview"},
		{"preview-x.example.com", "example.com", "", "preview"},
		{"staging-eu.example.com", "example.com", "", "preview"},
		{"api.dev.example.com", "example.com", "", "preview"},
		{"notexample.com", "example.com", "", "preview"},
		{"example.com.evil.io", "example.com", "", "preview"},
		{"example.com", "", "", "preview"},
		{"blog.example.com", "", "", "preview"},
		{"", "", "", "preview"},
	}
	for _, tt := range tests {
		if got := DeriveEnv(tt.host, tt.domain, tt.given); got != tt.want {
			t.Errorf("DeriveEnv(%q,%q,%q) = %q, want %q", tt.host, tt.domain, tt.given, got, tt.want)
		}
	}
}

func TestParseURL(t *testing.T) {
	host, path, utm := ParseURL("https://Example.com/docs/x?utm_source=google&utm_medium=cpc&utm_campaign=launch&utm_term=go&utm_content=hero&other=1#frag")
	if host != "example.com" || path != "/docs/x" {
		t.Fatalf("got host %q path %q", host, path)
	}
	want := [5]string{"google", "cpc", "launch", "go", "hero"}
	if utm != want {
		t.Fatalf("utm = %v, want %v", utm, want)
	}
	if _, p, _ := ParseURL("https://a.com"); p != "/" {
		t.Errorf("empty path = %q, want /", p)
	}
}

func TestRefHost(t *testing.T) {
	tests := []struct{ ref, self, want string }{
		{"https://www.google.com/search?q=x", "example.com", "google.com"},
		{"https://example.com/a", "example.com", ""},
		{"https://www.example.com/a", "example.com", ""},
		{"", "example.com", ""},
		{"not a url", "example.com", ""},
	}
	for _, tt := range tests {
		if got := RefHost(tt.ref, tt.self); got != tt.want {
			t.Errorf("RefHost(%q,%q) = %q, want %q", tt.ref, tt.self, got, tt.want)
		}
	}
}

func TestNilGeoIsNoop(t *testing.T) {
	var g *Geo
	if c, r, ci := g.Lookup("1.2.3.4"); c != "" || r != "" || ci != "" {
		t.Errorf("nil geo returned %q %q %q", c, r, ci)
	}
	if err := g.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
}
