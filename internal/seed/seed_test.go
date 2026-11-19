package seed

import (
	"math/rand/v2"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"trail/internal/store"
)

func TestSeedShape(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "seed.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	now := time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)
	if err := Seed(st, []string{"demo", "docs"}, 30, 200, now, rand.New(rand.NewPCG(1, 2))); err != nil {
		t.Fatal(err)
	}

	db := st.DB()
	q := func(sql string) float64 {
		t.Helper()
		var v float64
		if err := db.QueryRow(sql).Scan(&v); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
		return v
	}
	checks := []struct {
		name string
		sql  string
		min  float64
	}{
		{"bot rows", "SELECT count(*) FROM events WHERE is_bot=1", 1},
		{"identify rows", "SELECT count(*) FROM events WHERE type='identify'", 1},
		{"identity_map rows", "SELECT count(*) FROM identity_map", 1},
		{"multi-day anons", "SELECT count(*) FROM (SELECT anon_id FROM events GROUP BY anon_id HAVING count(DISTINCT ts/86400000) >= 2)", 1},
		{"error rows", "SELECT count(*) FROM events WHERE type='error'", 1},
		{"outbound rows", "SELECT count(*) FROM events WHERE type='outbound'", 1},
		{"IN share > 0.4", "SELECT avg(country='IN') FROM events", 0.4000001},
		{"both sites", "SELECT count(DISTINCT site_id) FROM events", 2},
	}
	for _, c := range checks {
		if got := q(c.sql); got < c.min {
			t.Errorf("%s = %v, want >= %v", c.name, got, c.min)
		}
	}
	if q("SELECT count(*) FROM events WHERE ts > "+strconv.FormatInt(now.UnixMilli(), 10)) != 0 {
		t.Error("events in the future")
	}
}
