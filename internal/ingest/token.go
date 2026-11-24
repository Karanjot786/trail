package ingest

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"strings"
	"time"
)

// visit is the private-mode identity a pageview response hands back to the
// tracker, sealed so page scripts cannot read the day-long anon id.
type visit struct {
	Anon, Session string
	Issued        time.Time
}

const (
	tokenMaxAge    = 24 * time.Hour
	tokenMaxFuture = time.Minute
	maxTokenLen    = 128
)

func visitAEAD(key []byte) (cipher.AEAD, error) {
	b, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(b)
}

// sealVisit returns base64url(nonce12 || GCM(issued u32 || anon 11B || session 8B)), 68 chars.
// It refuses an anon or session that is not hex of the expected length.
func sealVisit(key []byte, site string, v visit) (string, bool) {
	a, err1 := hex.DecodeString(strings.TrimPrefix(v.Anon, "p_"))
	s, err2 := hex.DecodeString(v.Session)
	if !strings.HasPrefix(v.Anon, "p_") || err1 != nil || err2 != nil || len(a) != 11 || len(s) != 8 {
		return "", false
	}
	g, err := visitAEAD(key)
	if err != nil {
		return "", false
	}
	pt := binary.BigEndian.AppendUint32(nil, uint32(v.Issued.Unix()))
	pt = append(append(pt, a...), s...)
	nonce := make([]byte, g.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", false
	}
	return base64.RawURLEncoding.EncodeToString(g.Seal(nonce, nonce, pt, []byte(site))), true
}

// openVisit checks the tag, the site and the token's age.
func openVisit(key []byte, site, tok string, now time.Time) (visit, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(tok)
	g, gerr := visitAEAD(key)
	if err != nil || gerr != nil || len(raw) < g.NonceSize() {
		return visit{}, false
	}
	pt, err := g.Open(nil, raw[:g.NonceSize()], raw[g.NonceSize():], []byte(site))
	if err != nil || len(pt) != 4+11+8 {
		return visit{}, false
	}
	issued := time.Unix(int64(binary.BigEndian.Uint32(pt)), 0)
	if age := now.Sub(issued); age > tokenMaxAge || age < -tokenMaxFuture {
		return visit{}, false
	}
	return visit{Anon: "p_" + hex.EncodeToString(pt[4:15]), Session: hex.EncodeToString(pt[15:]), Issued: issued}, true
}

// Resume maps a valid token to an identity: the anon's live session if it has
// one, else the token's own session when it is at most 30 min old (a restart
// forgot it), else a new session for the same anon.
func (p *Private) Resume(v visit) (anon, sessionID string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	t := p.now()
	p.sweep(t)
	cur := p.sess[v.Anon]
	if !p.live(cur, t) {
		if cur == nil && len(p.sess) >= p.max {
			return v.Anon, fallbackSession(v.Anon, t)
		}
		cur = &session{id: randomID(), start: t}
		if t.Sub(v.Issued) <= sessIdle {
			cur = &session{id: v.Session, start: v.Issued}
		}
		p.sess[v.Anon] = cur
	}
	cur.last = t
	return v.Anon, cur.id
}
