package query

import (
	"strings"
	"testing"
)

// The event dimension's session subquery must carry name<>'': the partial index events_site_name_ts
// only serves a query whose WHERE implies it.
func TestEvWhereEventDimNamesNonEmpty(t *testing.T) {
	where, _, err := evWhere(Params{Site: "s", Filters: map[string]string{"event": "Signup"}}, false)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(where, "name<>''") {
		t.Errorf("event-dim SQL lacks name<>'': %s", where)
	}
}
