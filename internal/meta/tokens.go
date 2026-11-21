package meta

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"trail/internal/auth"
)

const (
	tokenPrefix    = "trl_"
	tokenBodyLen   = 32 // base62 characters after the prefix
	tokenShownLen  = 12 // characters kept as the listed prefix
	lastUsedPeriod = time.Minute
	base62         = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
)

var tokenScopes = map[string]bool{ScopeRead: true, ScopeNotes: true, ScopeWrite: true, ScopeCrawl: true}

// randomString returns n characters drawn uniformly from alphabet with crypto/rand.
func randomString(alphabet string, n int) (string, error) {
	b := make([]byte, n)
	max := big.NewInt(int64(len(alphabet)))
	for i := range b {
		k, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", fmt.Errorf("random: %w", err)
		}
		b[i] = alphabet[k.Int64()]
	}
	return string(b), nil
}

func randomID(prefix string) (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("random: %w", err)
	}
	return prefix + hex.EncodeToString(b), nil
}

// CreateToken makes a new API token. The plaintext is returned once, in
// NewToken.Token; only its SHA-256 is stored. site "" means every site; a
// crawl token must name a site.
func CreateToken(db *sql.DB, name, scope, site string) (NewToken, error) {
	name = strings.TrimSpace(name)
	var out NewToken
	switch l := utf8.RuneCountInString(name); {
	case l < 1 || l > maxNameRunes:
		return out, fmt.Errorf("%w: name must be 1-%d characters", ErrInvalid, maxNameRunes)
	case !tokenScopes[scope]:
		return out, fmt.Errorf("%w: scope must be read, notes, write or crawl", ErrInvalid)
	case scope == ScopeCrawl && site == "":
		return out, fmt.Errorf("%w: a crawl token must be limited to one site", ErrInvalid)
	}
	body, err := randomString(base62, tokenBodyLen)
	if err != nil {
		return out, err
	}
	plain := tokenPrefix + body
	id, err := randomID("tok_")
	if err != nil {
		return out, err
	}
	hash := sha256.Sum256([]byte(plain))
	out.APIToken = APIToken{ID: id, Name: name, Prefix: plain[:tokenShownLen], Scope: scope, Created: time.Now().UnixMilli()}
	var siteArg any
	if site != "" {
		out.Site, siteArg = &site, site
	}
	_, err = db.Exec(`INSERT INTO api_tokens(id, name, prefix, hash, scope, site_id, created) VALUES(?,?,?,?,?,?,?)`,
		id, name, out.Prefix, hash[:], scope, siteArg, out.Created)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			return out, fmt.Errorf("%w: a token named %q", ErrExists, name)
		}
		return out, fmt.Errorf("create token: %w", err)
	}
	out.Token = plain
	return out, nil
}

// ListTokens returns the stored tokens that are not revoked, oldest first. Never nil.
func ListTokens(db *sql.DB) ([]APIToken, error) {
	rows, err := db.Query(`SELECT id, name, prefix, scope, site_id, created, last_used FROM api_tokens
		WHERE revoked IS NULL ORDER BY created, id`)
	if err != nil {
		return nil, fmt.Errorf("list tokens: %w", err)
	}
	defer rows.Close()
	out := []APIToken{}
	for rows.Next() {
		var t APIToken
		var site sql.NullString
		var used sql.NullInt64
		if err := rows.Scan(&t.ID, &t.Name, &t.Prefix, &t.Scope, &site, &t.Created, &used); err != nil {
			return nil, fmt.Errorf("list tokens: %w", err)
		}
		if site.Valid {
			t.Site = &site.String
		}
		if used.Valid {
			t.LastUsed = &used.Int64
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list tokens: %w", err)
	}
	return out, nil
}

// RevokeToken revokes a stored token; it stops working at once.
func RevokeToken(db *sql.DB, id string) error {
	return deleteOne(db, `UPDATE api_tokens SET revoked=? WHERE id=? AND revoked IS NULL`, time.Now().UnixMilli(), id)
}

// lastTouch remembers when each token's last_used was written, so a busy
// token costs at most one write a minute.
var lastTouch sync.Map // id → time.Time

// LookupToken finds a live stored token by the SHA-256 of plain. It never
// logs or stores the plaintext.
func LookupToken(db *sql.DB, plain string) (auth.Token, bool) {
	if !strings.HasPrefix(plain, tokenPrefix) || len(plain) != len(tokenPrefix)+tokenBodyLen {
		return auth.Token{}, false
	}
	hash := sha256.Sum256([]byte(plain))
	var t auth.Token
	var site sql.NullString
	err := db.QueryRow(`SELECT id, name, scope, site_id FROM api_tokens WHERE hash=? AND revoked IS NULL`, hash[:]).
		Scan(&t.ID, &t.Name, &t.Scope, &site)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			log.Printf("token lookup: %v", err) // names neither the token nor its hash
		}
		return auth.Token{}, false
	}
	t.Site = site.String
	now := time.Now()
	if prev, ok := lastTouch.Load(t.ID); !ok || now.Sub(prev.(time.Time)) >= lastUsedPeriod {
		lastTouch.Store(t.ID, now)
		_, _ = db.Exec(`UPDATE api_tokens SET last_used=? WHERE id=?`, now.UnixMilli(), t.ID)
	}
	return t, true
}
