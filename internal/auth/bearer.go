package auth

import (
	"crypto/sha256"
	"crypto/subtle"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Token is one API token from TRAIL_API_TOKENS. Scope is "read" or "write".
type Token struct {
	Name, Scope string
}

const (
	minTokenLen = 24
	rateLimit   = 300 // requests per minute per token
)

// ParseTokens parses "name:token:scope,..." into token→Token. Errors name the
// entry by position and name, never by token value.
func ParseTokens(s string) (map[string]Token, error) {
	toks := map[string]Token{}
	names := map[string]bool{}
	i := 0
	for part := range strings.SplitSeq(s, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		i++
		f := strings.Split(part, ":")
		if len(f) != 3 || strings.TrimSpace(f[0]) == "" {
			return nil, fmt.Errorf("TRAIL_API_TOKENS: entry %d: want name:token:scope", i)
		}
		name, tok, scope := strings.TrimSpace(f[0]), strings.TrimSpace(f[1]), strings.TrimSpace(f[2])
		switch {
		case len(tok) < minTokenLen:
			return nil, fmt.Errorf("TRAIL_API_TOKENS: token %q: must be at least %d chars", name, minTokenLen)
		case scope != "read" && scope != "write":
			return nil, fmt.Errorf("TRAIL_API_TOKENS: token %q: scope must be read or write", name)
		case names[name]:
			return nil, fmt.Errorf("TRAIL_API_TOKENS: duplicate name %q", name)
		}
		if _, dup := toks[tok]; dup {
			return nil, fmt.Errorf("TRAIL_API_TOKENS: token %q reuses another entry's token", name)
		}
		names[name] = true
		toks[tok] = Token{Name: name, Scope: scope}
	}
	return toks, nil
}

type apiToken struct {
	hash [32]byte
	Token
}

type bucket struct {
	left float64
	at   time.Time
}

// bearer holds the configured API tokens and their rate-limit buckets.
type bearer struct {
	mu      sync.Mutex
	tokens  []apiToken
	buckets map[string]*bucket // by token name
}

// SetTokens installs the API tokens accepted by Bearer.
func (a *Auth) SetTokens(toks map[string]Token) {
	a.bearer.mu.Lock()
	defer a.bearer.mu.Unlock()
	a.bearer.tokens = a.bearer.tokens[:0]
	for tok, t := range toks {
		a.bearer.tokens = append(a.bearer.tokens, apiToken{hash: sha256.Sum256([]byte(tok)), Token: t})
	}
	a.bearer.buckets = map[string]*bucket{}
}

// Bearer guards h with "Authorization: Bearer <token>". It answers 401 for a
// missing or unknown token, 403 when scope is "write" and the token is
// read-only, and 429 past 300 requests per minute per token.
func (a *Auth) Bearer(scope string, h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t, ok := a.lookup(r.Header.Get("Authorization"))
		if !ok {
			w.Header().Set("WWW-Authenticate", `Bearer realm="trail"`)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if scope == "write" && t.Scope != "write" {
			http.Error(w, "forbidden: token is read-only", http.StatusForbidden)
			return
		}
		if !a.allow(t.Name) {
			w.Header().Set("Retry-After", "1")
			http.Error(w, "rate limited", http.StatusTooManyRequests)
			return
		}
		h.ServeHTTP(w, r)
	})
}

// lookup finds the token in header. Every configured token is compared by
// SHA-256 in constant time, so timing reveals neither which nor how much matched.
func (a *Auth) lookup(header string) (Token, bool) {
	scheme, tok, ok := strings.Cut(header, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") || tok == "" {
		return Token{}, false
	}
	h := sha256.Sum256([]byte(tok))
	a.bearer.mu.Lock()
	defer a.bearer.mu.Unlock()
	var found Token
	match := 0
	for _, t := range a.bearer.tokens {
		if subtle.ConstantTimeCompare(h[:], t.hash[:]) == 1 {
			found, match = t.Token, 1
		}
	}
	return found, match == 1
}

// allow takes one request from name's token bucket (300 capacity, refilled at
// 5 per second).
func (a *Auth) allow(name string) bool {
	now := a.now()
	a.bearer.mu.Lock()
	defer a.bearer.mu.Unlock()
	b := a.bearer.buckets[name]
	if b == nil {
		b = &bucket{left: rateLimit, at: now}
		a.bearer.buckets[name] = b
	}
	b.left = min(rateLimit, b.left+now.Sub(b.at).Seconds()*rateLimit/60)
	b.at = now
	if b.left < 1 {
		return false
	}
	b.left--
	return true
}
