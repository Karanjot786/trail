package query

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
)

// ExportEvents streams every stored event of site (bots included, every column) as NDJSON,
// one JSON object per line, oldest first. It stops when ctx is cancelled.
func ExportEvents(ctx context.Context, db *sql.DB, site string, w io.Writer) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	rows, err := db.QueryContext(ctx, `SELECT * FROM events WHERE site_id=? ORDER BY id`, site)
	if err != nil {
		return fmt.Errorf("export: %w", err)
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("export columns: %w", err)
	}
	bw := bufio.NewWriter(w)
	enc := json.NewEncoder(bw)
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	for rows.Next() {
		if err := rows.Scan(ptrs...); err != nil {
			return fmt.Errorf("export scan: %w", err)
		}
		obj := make(map[string]any, len(cols))
		for i, c := range cols {
			if b, ok := vals[i].([]byte); ok {
				obj[c] = string(b)
			} else {
				obj[c] = vals[i]
			}
		}
		if err := enc.Encode(obj); err != nil {
			return fmt.Errorf("export write: %w", err)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("export: %w", err)
	}
	return bw.Flush()
}
