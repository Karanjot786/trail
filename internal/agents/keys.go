package agents

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
)

// jwk is one Ed25519 key from a Web Bot Auth key directory.
type jwk struct {
	kid, thumb string // the published kid and the RFC 7638 SHA-256 thumbprint
	pub        ed25519.PublicKey
	nbf, exp   int64 // unix seconds, 0 = unset
}

// parseJWKS reads a JWKS ({"keys":[…]}) and keeps the Ed25519 OKP keys.
func parseJWKS(body []byte) ([]jwk, error) {
	var doc struct {
		Keys []map[string]any `json:"keys"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("key directory: %w", err)
	}
	out := []jwk{}
	for _, k := range doc.Keys {
		str := func(name string) string { s, _ := k[name].(string); return s }
		num := func(name string) int64 { f, _ := k[name].(float64); return int64(f) }
		if str("kty") != "OKP" || str("crv") != "Ed25519" {
			continue
		}
		raw, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(str("x"), "="))
		if err != nil || len(raw) != ed25519.PublicKeySize {
			continue
		}
		out = append(out, jwk{
			kid:   str("kid"),
			thumb: thumbprint(map[string]string{"kty": "OKP", "crv": "Ed25519", "x": str("x")}),
			pub:   ed25519.PublicKey(raw),
			nbf:   num("nbf"),
			exp:   num("exp"),
		})
	}
	if len(out) == 0 {
		return nil, errors.New("key directory: no Ed25519 keys")
	}
	return out, nil
}

// thumbprintMembers are the required JWK members per key type (RFC 7638 §3.2).
var thumbprintMembers = map[string][]string{
	"OKP": {"crv", "kty", "x"},
	"RSA": {"e", "kty", "n"},
	"EC":  {"crv", "kty", "x", "y"},
}

// thumbprint is the RFC 7638 SHA-256 JWK thumbprint, base64url without padding.
func thumbprint(k map[string]string) string {
	members := slices.Clone(thumbprintMembers[k["kty"]])
	if members == nil {
		return ""
	}
	slices.Sort(members)
	var b strings.Builder
	b.WriteByte('{')
	for i, m := range members {
		if i > 0 {
			b.WriteByte(',')
		}
		name, _ := json.Marshal(m)
		val, _ := json.Marshal(k[m])
		b.Write(name)
		b.WriteByte(':')
		b.Write(val)
	}
	b.WriteByte('}')
	sum := sha256.Sum256([]byte(b.String()))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
