package meta

import (
	"database/sql"
	"fmt"
)

// ProxyKeys returns the stored SHA-256 hash of every live crawl token of site
// whose listed prefix is prefix. A first-party proxy signs its forwards with
// HMAC-SHA256 keyed by exactly this hash, so the token itself never travels.
// The prefix is compared for equality (never LIKE), and it must be the full
// listed length, so a short or wildcard prefix matches nothing.
func ProxyKeys(db *sql.DB, site, prefix string) ([][]byte, error) {
	if len(prefix) != tokenShownLen {
		return nil, nil
	}
	rows, err := db.Query(`SELECT hash FROM api_tokens
		WHERE prefix=? AND site_id=? AND scope=? AND revoked IS NULL`, prefix, site, ScopeCrawl)
	if err != nil {
		return nil, fmt.Errorf("proxy keys: %w", err)
	}
	defer rows.Close()
	var out [][]byte
	for rows.Next() {
		var h []byte
		if err := rows.Scan(&h); err != nil {
			return nil, fmt.Errorf("proxy keys: %w", err)
		}
		out = append(out, h)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("proxy keys: %w", err)
	}
	return out, nil
}
