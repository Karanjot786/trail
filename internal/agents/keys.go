package agents

import (
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/subtle"
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

// Key implements KeySource from the cached key directories. It never fetches
// inline: a miss for an allowlisted origin schedules a background refresh, at
// most once per 10 minutes per origin, and returns false at once.
func (d *Directory) Key(origin, keyid string) (ed25519.PublicKey, bool) {
	l := d.keyList(origin)
	if l == nil || keyid == "" {
		return nil, false
	}
	now := d.o.Now().Unix()
	if st := l.good.Load(); st != nil {
		for _, k := range st.keys {
			idMatch := subtle.ConstantTimeCompare([]byte(k.kid), []byte(keyid)) == 1 ||
				subtle.ConstantTimeCompare([]byte(k.thumb), []byte(keyid)) == 1
			live := (k.nbf == 0 || now >= k.nbf) && (k.exp == 0 || now < k.exp)
			if idMatch && live {
				return k.pub, true
			}
		}
	}
	d.kickKeys(origin)
	return nil, false
}

func (d *Directory) keyList(origin string) *list {
	for _, l := range d.lists {
		if l.spec.format == fmtJWKS && l.spec.origin != "" && l.spec.origin == origin {
			return l
		}
	}
	return nil
}

// kickKeys asks the origin's key directory loop for a refresh, rate limited.
func (d *Directory) kickKeys(origin string) {
	l := d.keyList(origin)
	if l == nil || d.o.Disabled {
		return
	}
	now := d.o.Now()
	d.kickMu.Lock()
	last, seen := d.lastKick[origin]
	if seen && now.Sub(last) < keyKickEvery {
		d.kickMu.Unlock()
		return
	}
	d.lastKick[origin] = now
	d.kickMu.Unlock()
	select {
	case l.kick <- struct{}{}:
	default:
	}
}
