package main

import (
	"strings"
	"testing"
	"time"
)

const embedded = "../../internal/enrich/geodata/dbip-country-lite.mmdb"

func TestCheckAcceptsEmbedded(t *testing.T) {
	db, err := check(embedded, time.Now())
	if err != nil && strings.Contains(err.Error(), "not recent") {
		t.Skipf("embedded file is stale; run make geo: %v", err)
	}
	if err != nil {
		t.Fatal(err)
	}
	if len(db) != len("2006-01") {
		t.Errorf("build = %q", db)
	}
}

func TestCheckRejectsWrongType(t *testing.T) {
	if _, err := check("../../internal/enrich/testdata/city-test.mmdb", time.Now()); err == nil {
		t.Error("accepted a non-DB-IP database")
	}
}

func TestCheckRejectsStale(t *testing.T) {
	if _, err := check(embedded, time.Now().AddDate(2, 0, 0)); err == nil {
		t.Error("accepted a two-year-old build")
	}
}
