package agents

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"net/http"
	"os"
	"testing"
	"time"
)

func TestJWKThumbprint(t *testing.T) {
	// RFC 7638 §3.1.
	rsa := map[string]string{
		"kty": "RSA",
		"e":   "AQAB",
		"n":   "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
	}
	if got := thumbprint(rsa); got != "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs" {
		t.Errorf("RSA thumbprint %s", got)
	}
	pub := ed25519.NewKeyFromSeed(make([]byte, 32)).Public().(ed25519.PublicKey)
	okp := map[string]string{"kty": "OKP", "crv": "Ed25519", "x": base64.RawURLEncoding.EncodeToString(pub)}
	if got := thumbprint(okp); got != "9ZP03Nu8GrXPAUkbKNxHOKBzxPX83SShgFkRNK-f2lw" {
		t.Errorf("OKP thumbprint %s", got)
	}
}

func TestParseJWKS(t *testing.T) {
	keys, err := parseJWKS([]byte(`{"keys":[
		{"kty":"OKP","crv":"Ed25519","x":"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo","kid":"a"},
		{"kty":"RSA","n":"x","e":"AQAB"},
		{"kty":"OKP","crv":"Ed25519","x":"short"},
		{"kty":"OKP","crv":"X25519","x":"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"}]}`))
	if err != nil || len(keys) != 1 || keys[0].kid != "a" || len(keys[0].pub) != ed25519.PublicKeySize || keys[0].thumb == "" {
		t.Fatalf("%+v %v", keys, err)
	}
	for _, bad := range []string{`{"keys":[]}`, `[]`, `x`} {
		if _, err := parseJWKS([]byte(bad)); err == nil {
			t.Errorf("%s: no error", bad)
		}
	}
}

// The live OpenAI directory uses RFC 7638 thumbprints as kid; Google uses short opaque ids.
func TestParseJWKSLiveCopies(t *testing.T) {
	for _, name := range []string{"openai-keys.json", "google-keys.json"} {
		b, err := os.ReadFile("testdata/live/" + name)
		if err != nil {
			t.Skip("no live copy: ", err)
		}
		keys, err := parseJWKS(b)
		if err != nil || len(keys) == 0 {
			t.Fatalf("%s: %v", name, err)
		}
		if name == "openai-keys.json" && keys[0].kid != keys[0].thumb {
			t.Errorf("openai kid %s is not its thumbprint %s", keys[0].kid, keys[0].thumb)
		}
	}
}

func TestDirectoryKeySource(t *testing.T) {
	pub := testPriv.Public().(ed25519.PublicKey)
	x := base64.RawURLEncoding.EncodeToString(pub)
	jwks := `{"keys":[{"kty":"OKP","crv":"Ed25519","x":"` + x + `","kid":"short"},` +
		`{"kty":"OKP","crv":"Ed25519","x":"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo","kid":"old","exp":1000}]}`
	srv, n := listServer(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(jwks)) })
	clock := testNow
	d := testDir(srv, map[string]string{"openai-keys": srv.URL}, func() time.Time { return clock })
	l := d.byName["openai-keys"]
	if _, ok := d.Key("https://chatgpt.com", "short"); ok {
		t.Fatal("key before any fetch")
	}
	if len(l.kick) != 1 {
		t.Fatal("a miss did not schedule a refresh")
	}
	<-l.kick
	if err := d.refresh(context.Background(), l); err != nil {
		t.Fatal(err)
	}
	thumb := thumbprint(map[string]string{"kty": "OKP", "crv": "Ed25519", "x": x})
	for _, id := range []string{"short", thumb} {
		if k, ok := d.Key("https://chatgpt.com", id); !ok || !k.Equal(pub) {
			t.Errorf("Key(%s) missing", id)
		}
	}
	if _, ok := d.Key("https://chatgpt.com", "old"); ok {
		t.Error("expired key returned")
	}
	// Misses kick at most once per 10 minutes per origin.
	d.Key("https://chatgpt.com", "nope")
	d.Key("https://chatgpt.com", "nope2")
	if len(l.kick) != 0 {
		t.Error("kicked again within 10 minutes")
	}
	clock = clock.Add(11 * time.Minute)
	d.Key("https://chatgpt.com", "nope")
	if len(l.kick) != 1 {
		t.Error("no kick after 10 minutes")
	}
	if _, ok := d.Key("https://evil.example", "short"); ok {
		t.Error("unlisted origin returned a key")
	}
	if n.Load() != 1 {
		t.Errorf("%d fetches, want 1 (Key never fetches inline)", n.Load())
	}
	// End to end: a signature made with this key verifies through the directory.
	s := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "shop.example", keyid: thumb})
	if a, err := Verify(s, "shop.example", d, testNow); err != nil || a.ID != "chatgpt-agent" {
		t.Errorf("Verify through directory: %q %v", a.ID, err)
	}
}

func TestThumbprintIgnoresPadding(t *testing.T) {
	x := "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"
	a, _ := parseJWKS([]byte(`{"keys":[{"kty":"OKP","crv":"Ed25519","x":"` + x + `"}]}`))
	b, _ := parseJWKS([]byte(`{"keys":[{"kty":"OKP","crv":"Ed25519","x":"` + x + `="}]}`))
	if len(a) != 1 || len(b) != 1 || a[0].thumb != b[0].thumb {
		t.Errorf("padded x changes the thumbprint: %v %v", a, b)
	}
}
