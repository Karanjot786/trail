package agents

import (
	"crypto/ed25519"
	"encoding/base64"
	"os"
	"testing"
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
