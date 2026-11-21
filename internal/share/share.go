// Package share makes read-only share-link tokens and the per-share visitor
// pseudonyms that keep person ids out of shared reports.
package share

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"errors"
	"fmt"
)

// Prefix starts every share token.
const Prefix = "shr_"

// TokenLen is the length of a share token: the prefix and 43 base64url characters.
const TokenLen = len(Prefix) + 43

// ErrBadID is returned by Reveal for an opaque id this share did not make.
var ErrBadID = errors.New("unknown visitor id")

// NewToken returns a fresh share token and its SHA-256 (the only form stored).
func NewToken() (plain string, hash [32]byte, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", hash, fmt.Errorf("share token: %w", err)
	}
	plain = Prefix + base64.RawURLEncoding.EncodeToString(b)
	return plain, sha256.Sum256([]byte(plain)), nil
}

// NewKey returns a fresh per-share pseudonym key.
func NewKey() ([]byte, error) {
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		return nil, fmt.Errorf("share key: %w", err)
	}
	return k, nil
}

// derive splits the share key into independent MAC and encryption keys.
func derive(key []byte, purpose string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(purpose))
	return m.Sum(nil)
}

func synthIV(key []byte, person string) []byte {
	m := hmac.New(sha256.New, derive(key, "trail-share-mac"))
	m.Write([]byte(person))
	return m.Sum(nil)
}

func aead(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(derive(key, "trail-share-enc"))
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// Pseudonym deterministically encrypts person under the share's key (AES-GCM
// with a synthetic IV, HMAC-SHA256(key, person)[:12]). The same person gets
// the same opaque id and label within one share, and unlinkable ones across
// shares. label is "Visitor " plus 4 base32 characters of the HMAC.
func Pseudonym(key []byte, person string) (opaque, label string) {
	mac := synthIV(key, person)
	g, err := aead(key)
	if err != nil { // only on a bad key length, which NewKey never makes
		return "", "Visitor"
	}
	iv := mac[:g.NonceSize()]
	sealed := g.Seal(append([]byte{}, iv...), iv, []byte(person), nil)
	return base64.RawURLEncoding.EncodeToString(sealed), "Visitor " + base32.StdEncoding.EncodeToString(mac)[:4]
}

// Reveal returns the person behind an opaque id made by Pseudonym with key.
func Reveal(key []byte, opaque string) (string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(opaque)
	if err != nil {
		return "", ErrBadID
	}
	g, err := aead(key)
	if err != nil || len(raw) < g.NonceSize()+g.Overhead() {
		return "", ErrBadID
	}
	iv := raw[:g.NonceSize()]
	plain, err := g.Open(nil, iv, raw[g.NonceSize():], nil)
	if err != nil || !hmac.Equal(iv, synthIV(key, string(plain))[:g.NonceSize()]) {
		return "", ErrBadID
	}
	return string(plain), nil
}
