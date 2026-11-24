package query

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"strings"
	"sync"
	"testing"
	"time"
)

// A logging driver: every statement a report prepares is recorded with the args it ran with.
type logged struct {
	q    string
	args []any
}

type logConn struct {
	driver.Conn
	mu  *sync.Mutex
	out *[]logged
}

func (c logConn) Prepare(q string) (driver.Stmt, error) {
	s, err := c.Conn.Prepare(q)
	return logStmt{s, q, c.mu, c.out}, err
}

type logStmt struct {
	driver.Stmt
	q   string
	mu  *sync.Mutex
	out *[]logged
}

func (s logStmt) QueryContext(ctx context.Context, args []driver.NamedValue) (driver.Rows, error) {
	vs := make([]any, len(args))
	for i, a := range args {
		vs[i] = a.Value
	}
	s.mu.Lock()
	*s.out = append(*s.out, logged{s.q, vs})
	s.mu.Unlock()
	return s.Stmt.(driver.StmtQueryContext).QueryContext(ctx, args)
}

type logConnector struct {
	dsn string
	mu  sync.Mutex
	out []logged
}

func (c *logConnector) Connect(context.Context) (driver.Conn, error) {
	d, _ := sql.Open("sqlite", "")
	raw, err := d.Driver().Open(c.dsn)
	return logConn{raw, &c.mu, &c.out}, err
}
func (c *logConnector) Driver() driver.Driver { d, _ := sql.Open("sqlite", ""); return d.Driver() }

// explainAll runs every report against db (through a logging connection) and returns each distinct
// SQL text that touches events with its EXPLAIN QUERY PLAN detail lines.
func explainAll(t *testing.T, db *sql.DB, now time.Time) map[string][]string {
	t.Helper()
	var file string
	if err := db.QueryRow(`SELECT file FROM pragma_database_list WHERE name='main'`).Scan(&file); err != nil {
		t.Fatal(err)
	}
	lc := &logConnector{dsn: "file:" + file + "?mode=ro"}
	ldb := sql.OpenDB(lc)
	defer ldb.Close()
	for _, rk := range []string{"30d", "today", "7d"} {
		w, err := ResolveWindow(rk, "prev", now, ist, 0)
		if err != nil {
			t.Fatal(err)
		}
		allReports(t, ldb, Params{Site: "demo", Env: "production", From: w.From, To: w.To, Win: w, TZ: ist, Now: now, Limit: 100})
	}
	plans := map[string][]string{}
	for _, l := range lc.out {
		if _, done := plans[l.q]; done || !strings.Contains(l.q, "events") {
			continue
		}
		rs, err := db.Query("EXPLAIN QUERY PLAN "+l.q, l.args...)
		if err != nil {
			continue // not a plannable statement (e.g. a pragma)
		}
		lines := []string{}
		for rs.Next() {
			var a, b, c int
			var d string
			if err := rs.Scan(&a, &b, &c, &d); err != nil {
				t.Fatal(err)
			}
			lines = append(lines, d)
		}
		rs.Close()
		plans[l.q] = lines
	}
	return plans
}

func TestPlanGuard(t *testing.T) {
	_, b, now := seedPair(t)
	plans := explainAll(t, b, now)
	if len(plans) < 50 {
		t.Fatalf("captured only %d statements", len(plans))
	}
	named := 0
	for q, lines := range plans {
		plan := strings.Join(lines, "\n")
		for _, l := range lines {
			bare := strings.HasPrefix(l, "SCAN e") && !strings.Contains(l, "USING")
			if bare && !strings.Contains(q, "ORDER BY id") { // ExportEvents reads by id on purpose
				t.Errorf("full scan of events: %q\n%s", l, q)
			}
		}
		for _, old := range []string{"events_site_user_ts", "events_site_type_name_ts"} {
			if strings.Contains(plan, old) {
				t.Errorf("plan uses dropped index %s\n%s", old, q)
			}
		}
		if strings.Contains(plan, "events_site_name_ts") {
			named++
		}
	}
	// The name lookups must keep an index; fewer means the literal
	// name<>'' term was lost from a query and SQLite stopped using the partial index.
	if named < 10 {
		t.Errorf("only %d statements use events_site_name_ts, want at least 10", named)
	}
}
