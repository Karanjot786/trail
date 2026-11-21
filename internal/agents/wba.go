package agents

import (
	"crypto/ed25519"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Web Bot Auth (RFC 9421 HTTP message signatures with Ed25519). Only
// allowlisted Signature-Agent origins are ever looked up, so a request can
// never make Trail fetch a URL of its choosing.

// KeySource returns the public key an allowlisted origin publishes as keyid.
type KeySource interface {
	Key(origin, keyid string) (ed25519.PublicKey, bool)
}

// Verification errors. None of them carries a header value.
var (
	ErrUnlistedAgent        = errors.New("signature agent is not on the allowlist")
	ErrUnsupportedComponent = errors.New("signature covers an unsupported component")
	ErrBadSignature         = errors.New("signature does not verify")
	ErrUnknownKey           = errors.New("unknown signing key")
	errNoSignature          = errors.New("no web-bot-auth signature")
	errSigParams            = errors.New("bad signature parameters")
)

const (
	clockSkew       = 60 * time.Second
	defaultLifetime = 5 * time.Minute
	maxLifetime     = 24 * time.Hour
	wbaTag          = "web-bot-auth"
)

// parseSignatureInput parses Signature-Input: a dictionary of inner lists.
func parseSignatureInput(s string) ([]sfMember, error) {
	ms, err := parseDictionary(s)
	if err != nil {
		return nil, err
	}
	for _, m := range ms {
		if !m.inner {
			return nil, errSFV
		}
	}
	return ms, nil
}

// signatureAgent is a parsed Signature-Agent header: one string (OpenAI's
// form) or a dictionary of strings (Google's g="…" form).
type signatureAgent struct {
	raw     string
	single  string
	members map[string]string
}

func parseSignatureAgent(s string) (signatureAgent, error) {
	sa := signatureAgent{raw: strings.Trim(s, " \t")}
	if it, ps, err := parseItem(s); err == nil {
		if it.kind != sfString || len(ps) > 0 {
			return sa, errSFV
		}
		sa.single = it.s
		return sa, nil
	}
	ms, err := parseDictionary(s)
	if err != nil {
		return sa, err
	}
	sa.members = map[string]string{}
	for _, m := range ms {
		if !m.inner && m.item.kind == sfString {
			sa.members[m.key] = m.item.s
		}
	}
	return sa, nil
}

// Verify checks a Web Bot Auth signature for a request to authority and
// returns the agent it proves. Rules:
//  1. Signature-Agent names an allowlisted origin (BySignatureAgent), else
//     ErrUnlistedAgent with no key lookup.
//  2. Signature-Input has tag="web-bot-auth", alg absent or "ed25519", a
//     keyid, created ≤ now+60 s, expires (default created+5 min) > now−60 s,
//     and a lifetime of at most 24 h.
//  3. Only "@authority" and "signature-agent" (optionally ;key=) may be covered.
//  4. The Signature member with the same label verifies with the key.
func Verify(s Signed, authority string, keys KeySource, now time.Time) (Agent, error) {
	for _, h := range []string{s.SignatureAgent, s.SignatureInput, s.Signature, authority} {
		if len(h) > maxHeader {
			return Agent{}, errTooLong
		}
	}
	if s.SignatureAgent == "" || s.SignatureInput == "" || s.Signature == "" {
		return Agent{}, errNoSignature
	}
	sa, err := parseSignatureAgent(s.SignatureAgent)
	if err != nil {
		return Agent{}, fmt.Errorf("signature-agent: %w", err)
	}
	inputs, err := parseSignatureInput(s.SignatureInput)
	if err != nil {
		return Agent{}, fmt.Errorf("signature-input: %w", err)
	}
	sigs, err := parseDictionary(s.Signature)
	if err != nil {
		return Agent{}, fmt.Errorf("signature: %w", err)
	}
	lastErr := errNoSignature
	for _, m := range inputs {
		if tag, _ := m.param("tag"); tag.kind != sfString || tag.s != wbaTag {
			continue
		}
		a, err := verifyMember(m, sa, sigs, authority, keys, now)
		if err == nil {
			return a, nil
		}
		lastErr = err
	}
	return Agent{}, lastErr
}

func verifyMember(m sfMember, sa signatureAgent, sigs []sfMember, authority string, keys KeySource, now time.Time) (Agent, error) {
	// Which origin does this signature claim? The covered signature-agent
	// component names it; otherwise the member with the same label, or the
	// single string.
	origin := sa.single
	if sa.members != nil {
		origin = sa.members[m.key]
	}
	for _, c := range m.list {
		if c.item.kind == sfString && c.item.s == "signature-agent" {
			if k, ok := findParam(c.params, "key"); ok && k.kind == sfString && sa.members != nil {
				origin = sa.members[k.s]
			}
		}
	}
	agent, ok := BySignatureAgent(origin)
	if !ok {
		return Agent{}, ErrUnlistedAgent
	}

	keyid, err := checkParams(m.params, now)
	if err != nil {
		return Agent{}, err
	}

	authority = strings.ToLower(strings.TrimSpace(authority))
	if authority == "" {
		return Agent{}, ErrBadSignature
	}
	values := make([]string, 0, len(m.list))
	for _, c := range m.list {
		v, err := componentValue(c, authority, sa)
		if err != nil {
			return Agent{}, err
		}
		values = append(values, v)
	}

	var sig []byte
	for _, sm := range sigs {
		if sm.key == m.key && !sm.inner && sm.item.kind == sfBytes {
			sig = sm.item.b
		}
	}
	if len(sig) != ed25519.SignatureSize {
		return Agent{}, ErrBadSignature
	}
	pub, ok := keys.Key(agent.SignatureAgent, keyid)
	if !ok {
		return Agent{}, ErrUnknownKey
	}
	base := signatureBase(m.list, values, serializeInnerList(m.list, m.params))
	if !ed25519.Verify(pub, []byte(base), sig) {
		return Agent{}, ErrBadSignature
	}
	return agent, nil
}

// checkParams validates the signature parameters and returns the keyid.
func checkParams(ps []sfParam, now time.Time) (string, error) {
	if alg, ok := findParam(ps, "alg"); ok && (alg.kind != sfString || alg.s != "ed25519") {
		return "", errSigParams
	}
	keyid, ok := findParam(ps, "keyid")
	if !ok || keyid.kind != sfString || keyid.s == "" {
		return "", errSigParams
	}
	created, ok := findParam(ps, "created")
	if !ok || created.kind != sfInt {
		return "", errSigParams
	}
	expires := created.i + int64(defaultLifetime/time.Second)
	if e, ok := findParam(ps, "expires"); ok {
		if e.kind != sfInt {
			return "", errSigParams
		}
		expires = e.i
	}
	skew := int64(clockSkew / time.Second)
	nowS := now.Unix()
	switch {
	case created.i > nowS+skew:
		return "", fmt.Errorf("%w: created in the future", errSigParams)
	case expires <= nowS-skew:
		return "", fmt.Errorf("%w: expired", errSigParams)
	case expires-created.i > int64(maxLifetime/time.Second) || expires < created.i:
		return "", fmt.Errorf("%w: lifetime", errSigParams)
	}
	return keyid.s, nil
}

// componentValue returns the value of one covered component.
func componentValue(c sfInner, authority string, sa signatureAgent) (string, error) {
	if c.item.kind != sfString {
		return "", ErrUnsupportedComponent
	}
	switch c.item.s {
	case "@authority":
		if len(c.params) > 0 {
			return "", ErrUnsupportedComponent
		}
		return authority, nil
	case "signature-agent":
		switch {
		case len(c.params) == 0:
			return sa.raw, nil
		case len(c.params) == 1 && c.params[0].key == "key" && c.params[0].val.kind == sfString:
			v, ok := sa.members[c.params[0].val.s]
			if !ok {
				return "", ErrBadSignature
			}
			var b strings.Builder
			sfItem{kind: sfString, s: v}.serialize(&b)
			return b.String(), nil
		}
	}
	return "", ErrUnsupportedComponent
}

// signatureBase builds the RFC 9421 §2.5 signature base.
func signatureBase(components []sfInner, values []string, sigParams string) string {
	var b strings.Builder
	for i, c := range components {
		c.item.serialize(&b)
		serializeParams(&b, c.params)
		b.WriteString(": ")
		b.WriteString(values[i])
		b.WriteByte('\n')
	}
	b.WriteString(`"@signature-params": `)
	b.WriteString(sigParams)
	return b.String()
}
