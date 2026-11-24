package query

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"regexp"
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
		p := Params{Site: "demo", Env: "production", From: w.From, To: w.To, Win: w, TZ: ist, Now: now, Limit: 100}
		allReports(t, ldb, p)
		if rk == "30d" { // the outbound filter, a session subquery allReports does not issue
			p.Filters = map[string]string{"event": outboundKey}
			if _, err := Stats(ldb, p); err != nil {
				t.Fatal(err)
			}
		}
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

// typeOnlyShapes are the (site, type) lookups with no name term: the event catalogue, the outbound
// count, the outbound filter (Stats event=outbound) and the event breakdown. Only the partial
// events_site_type_ts can seek them, because events_site_name_ts requires name<>”.
var typeOnlyShapes = []string{
	"type<>'pageview' AND type='event' GROUP BY name",
	"FROM ev WHERE type<>'pageview' AND type='outbound'",
	"type<>'pageview' AND type='outbound' AND ts BETWEEN",
	"type<>'pageview' AND type IN ('outbound','event')",
}

func TestPlanGuard(t *testing.T) {
	_, b, now := seedPair(t)
	plans := explainAll(t, b, now)
	if len(plans) < 50 {
		t.Fatalf("captured only %d statements", len(plans))
	}
	named, lookback := 0, 0
	typeOnly := map[string]int{}
	for q, lines := range plans {
		plan := strings.Join(lines, "\n")
		// The fold lookback reads ev from a two-part subquery aliased e: its "SCAN e" walks that
		// subquery's rows, and each part must plan on an index.
		if strings.Contains(q, "INDEXED BY events_site_end") {
			lookback++
			if !strings.Contains(plan, "SEARCH events USING INDEX events_site_ts (site_id=? AND ts>? AND ts<?)") ||
				!strings.Contains(plan, "SEARCH events USING INDEX events_site_end (site_id=? AND <expr>>?") {
				t.Errorf("lookback source is not two index searches\n%s\n%s", plan, q)
			}
		}
		for _, l := range lines {
			bare := strings.HasPrefix(l, "SCAN e") && !strings.Contains(l, "USING") && !strings.Contains(q, "INDEXED BY events_site_end")
			if bare && !strings.Contains(q, "ORDER BY id") { // ExportEvents reads by id on purpose
				t.Errorf("full scan of events: %q\n%s", l, q)
			}
		}
		for _, old := range []string{"events_site_user_ts", "events_site_type_name_ts"} {
			if strings.Contains(plan, old) {
				t.Errorf("plan uses dropped index %s\n%s", old, q)
			}
		}
		if nameLookup.MatchString(q) && !nameLookupExempt(q, plan) && !strings.Contains(plan, "events_site_name_ts") {
			t.Errorf("name lookup does not use events_site_name_ts (name<>'' term lost?)\n%s\n%s", plan, q)
		}
		for _, m := range typeOnlyShapes {
			if strings.Contains(q, m) {
				typeOnly[m]++
				if !strings.Contains(plan, "events_site_type_ts") {
					t.Errorf("type-only lookup does not use events_site_type_ts (type<>'pageview' term lost?)\n%s\n%s", plan, q)
				}
			}
		}
		if nameLookup.MatchString(q) && strings.Contains(plan, "events_site_name_ts") {
			named++
		}
	}
	for _, m := range typeOnlyShapes {
		if typeOnly[m] == 0 {
			t.Errorf("no captured statement has the type-only shape %q", m)
		}
	}
	if lookback < 3 {
		t.Errorf("only %d lookback statements were checked (Live and activeNow)", lookback)
	}
	if named < 10 {
		t.Errorf("only %d name lookups were checked, the classifier lost its statements", named)
	}
}

// nameLookup matches a WHERE that looks an event up by name: purchaseWhere, eventWhere, goalWhere's
// event branch and the ev CTE filters built from them.
var nameLookup = regexp.MustCompile(`WHERE [^\n]*?type='event'( AND name<>'')? AND (ev\.)?name( IN \(|=\?)`)

// nameLookupExempt lists the shapes that legitimately plan on another index: a session_id IN (...) list
// (events_site_session_ts), a goal OR-chain (several goals in one scan), and the Purchase list read
// newest first (events_site_ts gives the order).
func nameLookupExempt(q, plan string) bool {
	return strings.Contains(plan, "events_site_session_ts") || strings.Contains(q, ") OR (") ||
		strings.Contains(q, "json_valid(props) ORDER BY ts DESC")
}
