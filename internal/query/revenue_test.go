package query

import (
	"errors"
	"testing"
	"time"

	"trail/internal/store"
)

func buy(anon, sess string, amount, currency string, ts int64) store.Event {
	return ev(anon, sess, "Purchase", `{"amount":`+amount+`,"currency":"`+currency+`","plan":"pro"}`, ts)
}

func landing(anon, sess, path, ref string, ts int64) store.Event {
	e := pv(anon, sess, path, ts)
	e.RefHost = ref
	return e
}

// thirtyDays is a 30-day window ending at t0+day with the previous 30 days as comparison.
func thirtyDays() Params {
	to := t0 + day
	from := to - 30*day + 1
	return b3Win(from, to, from-30*day, from-1)
}

func TestRevenueFirstTouchBySource(t *testing.T) {
	db := fixture(t,
		landing("A", "a1", "/", "www.google.com", t0-60*day), // first touch, long before the window
		landing("A", "a2", "/blog", "x.com", t0),
		buy("A", "a2", "49", "USD", t0+minute),
		landing("B", "b1", "/", "x.com", t0),
		buy("B", "b1", "19", "USD", t0+minute),
	)
	rows, err := RevenueBreakdown(db, thirtyDays(), "source")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].Key != "Google" || rows[0].RevenueMinor != 4900 || rows[1].Key != "X" || rows[1].RevenueMinor != 1900 {
		t.Fatalf("rows %+v", rows)
	}
	r, err := Revenue(db, thirtyDays())
	if err != nil {
		t.Fatal(err)
	}
	if r.Purchases[0].VisitsBefore != 0 || r.Purchases[1].VisitsBefore != 1 || r.Purchases[1].Person != "A" {
		t.Fatalf("visitsBefore %+v", r.Purchases)
	}
}

func TestRevenueZeroIsNoPurchases(t *testing.T) {
	db := fixture(t, pv("A", "a1", "/", t0))
	from := time.Date(2026, 11, 19, 0, 0, 0, 0, ist).UnixMilli()
	p := b3Win(from, from+day-1, from-day, from-1)
	p.Win.Bucket = "hour"
	p.Now = time.UnixMilli(t0 + 5*minute)
	r, err := Revenue(db, p)
	if err != nil {
		t.Fatal(err)
	}
	if r.Cur.NetMinor != 0 || r.Cur.Purchases != 0 || r.Cur.AovMinor != 0 || r.Currency != "USD" || r.Purchases == nil {
		t.Fatalf("got %+v", r)
	}
	if len(r.Series) != 24 || r.Series[10].V == nil || *r.Series[10].V != 0 || r.Series[11].V != nil {
		t.Fatalf("series %+v", r.Series)
	}
	if r.Prev == nil || r.Prev.NetMinor != 0 {
		t.Fatalf("prev %+v", r.Prev)
	}
}

func TestRevenueBreakdownSumsToNet(t *testing.T) {
	db := fixture(t,
		landing("A", "a1", "/", "google.com", t0), buy("A", "a1", "49", "USD", t0+minute),
		landing("B", "b1", "/docs", "", t0), buy("B", "b1", "19", "USD", t0+minute), buy("B", "b1", "19.99", "USD", t0+2*minute),
		landing("C", "c1", "/", "news.ycombinator.com", t0), buy("C", "c1", "10", "EUR", t0+minute),
	)
	p := thirtyDays()
	r, err := Revenue(db, p)
	if err != nil {
		t.Fatal(err)
	}
	if r.Cur.NetMinor != 8799 || r.Cur.Purchases != 3 || r.Cur.Buyers != 2 || r.Cur.AovMinor != 2933 {
		t.Fatalf("cur %+v", r.Cur)
	}
	for _, dim := range []string{"source", "channel", "campaign", "entry", "country", "device"} {
		rows, err := RevenueBreakdown(db, p, dim)
		if err != nil {
			t.Fatal(err)
		}
		var sum int64
		var share float64
		for _, row := range rows {
			sum += row.RevenueMinor
			share += row.Share
		}
		if sum != r.Cur.NetMinor || share < 0.999 || share > 1.001 {
			t.Fatalf("%s: sum %d share %v rows %+v", dim, sum, share, rows)
		}
	}
	if _, err := RevenueBreakdown(db, p, "path"); !errors.Is(err, ErrBadDim) {
		t.Fatalf("bad dim: %v", err)
	}
}

func TestRevenueMixedCurrency(t *testing.T) {
	db := fixture(t,
		buy("A", "a1", "19", "usd", t0), buy("B", "b1", "49", "", t0), // lower case and missing → USD
		buy("C", "c1", "10", "EUR", t0),
	)
	r, err := Revenue(db, thirtyDays())
	if err != nil {
		t.Fatal(err)
	}
	if r.Currency != "USD" || r.Cur.NetMinor != 6800 || r.Cur.Purchases != 2 || r.OtherCurrencyPurchases != 1 || len(r.Purchases) != 2 {
		t.Fatalf("got %+v", r)
	}
}

func TestRevenueNeedsSite(t *testing.T) {
	p := thirtyDays()
	p.Site = "all"
	if _, err := Revenue(nil, p); !errors.Is(err, ErrNeedSite) {
		t.Fatal(err)
	}
}
