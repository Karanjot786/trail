package query

import (
	"testing"
	"time"
)

var winNow = time.Date(2026, 11, 20, 10, 5, 0, 0, ist)

func at(y int, m time.Month, d, h, mi int) int64 {
	return time.Date(y, m, d, h, mi, 0, 0, ist).UnixMilli()
}

func endOf(y int, m time.Month, d int) int64 { return at(y, m, d+1, 0, 0) - 1 }

func mustWin(t *testing.T, rk, cmp string, dataStart int64) Window {
	t.Helper()
	w, err := ResolveWindow(rk, cmp, winNow, ist, dataStart)
	if err != nil {
		t.Fatal(err)
	}
	return w
}

func TestResolveWindow(t *testing.T) {
	nowMs := winNow.UnixMilli()
	cases := []struct {
		rk, cmp          string
		from, to, pf, pt int64
		bucket, text     string
		elapsed, noPrev  bool
	}{
		{"today", "prev", at(2026, 11, 20, 0, 0), nowMs, at(2026, 11, 19, 0, 0), at(2026, 11, 19, 10, 5), "hour",
			"vs Thu, Nov 19 up to 10:05 (same hours yesterday)", true, false},
		{"yesterday", "prev", at(2026, 11, 19, 0, 0), endOf(2026, 11, 19), at(2026, 11, 18, 0, 0), endOf(2026, 11, 18), "hour",
			"vs Wed, Nov 18 (the day before)", false, false},
		{"d:2026-11-12", "prev", at(2026, 11, 12, 0, 0), endOf(2026, 11, 12), at(2026, 11, 11, 0, 0), endOf(2026, 11, 11), "hour",
			"vs Wed, Nov 11 (the day before)", false, false},
		{"wtd", "prev", at(2026, 11, 16, 0, 0), nowMs, at(2026, 11, 9, 0, 0), at(2026, 11, 13, 10, 5), "day",
			"vs Nov 9 – Nov 13 (same days last week)", true, false},
		{"mtd", "prev", at(2026, 11, 1, 0, 0), nowMs, at(2026, 10, 1, 0, 0), at(2026, 10, 20, 10, 5), "day",
			"vs Oct 1 – Oct 20 (same days last month)", true, false},
		{"lastmonth", "prev", at(2026, 10, 1, 0, 0), endOf(2026, 10, 31), at(2026, 9, 1, 0, 0), endOf(2026, 9, 30), "day",
			"vs Sep 1 – Sep 30 (the month before)", false, false},
		{"30d", "prev", at(2026, 10, 22, 0, 0), nowMs, at(2026, 9, 22, 0, 0), endOf(2026, 10, 21), "day",
			"vs Sep 22 – Oct 21 (the previous 30 days)", true, false},
		{"7d", "", at(2026, 11, 14, 0, 0), nowMs, at(2026, 11, 7, 0, 0), endOf(2026, 11, 13), "day",
			"vs Nov 7 – Nov 13 (the previous 7 days)", true, false},
		{"30d", "c:2026-07-01", at(2026, 10, 22, 0, 0), nowMs, at(2026, 7, 1, 0, 0), endOf(2026, 7, 30), "day",
			"vs Jul 1 – Jul 30 (the period you chose)", true, false},
		{"30d", "none", at(2026, 10, 22, 0, 0), nowMs, 0, 0, "day", "no comparison", true, true},
		{"c:2026-11-02~2026-11-08", "prev", at(2026, 11, 2, 0, 0), endOf(2026, 11, 8), at(2026, 10, 26, 0, 0), endOf(2026, 11, 1), "day",
			"vs Oct 26 – Nov 1 (the previous 7 days)", false, false},
	}
	for _, c := range cases {
		t.Run(c.rk+"/"+c.cmp, func(t *testing.T) {
			w := mustWin(t, c.rk, c.cmp, 0)
			if w.From != c.from || w.To != c.to {
				t.Errorf("from/to = %v – %v, want %v – %v", time.UnixMilli(w.From).In(ist), time.UnixMilli(w.To).In(ist),
					time.UnixMilli(c.from).In(ist), time.UnixMilli(c.to).In(ist))
			}
			if c.noPrev {
				if w.PrevFrom != nil || w.PrevTo != nil || !w.Basis.None {
					t.Errorf("want no prev, got %+v", w)
				}
			} else if w.PrevFrom == nil || *w.PrevFrom != c.pf || *w.PrevTo != c.pt {
				t.Errorf("prev = %v, want %v – %v", w, time.UnixMilli(c.pf).In(ist), time.UnixMilli(c.pt).In(ist))
			}
			if w.Bucket != c.bucket || w.Basis.Text != c.text || w.Elapsed != c.elapsed {
				t.Errorf("bucket %q text %q elapsed %v; want %q %q %v", w.Bucket, w.Basis.Text, w.Elapsed, c.bucket, c.text, c.elapsed)
			}
			if w.TZ != "Asia/Kolkata" || w.Label == "" {
				t.Errorf("tz %q label %q", w.TZ, w.Label)
			}
		})
	}
}

func TestWindowInvalidKey(t *testing.T) {
	for _, k := range []string{"bogus", "d:2027-01-01", "c:2026-12-01~2026-12-03", "d:x"} {
		w := mustWin(t, k, "prev", 0)
		if w.Key != "30d" || w.Invalid != k {
			t.Errorf("%s: key %q invalid %q", k, w.Key, w.Invalid)
		}
	}
	if w := mustWin(t, "", "", 0); w.Key != "30d" || w.Invalid != "" {
		t.Errorf("empty key: %+v", w)
	}
}

func TestWindowClamped(t *testing.T) {
	w := mustWin(t, "90d", "prev", at(2026, 11, 1, 9, 30))
	if !w.Clamped || w.From != at(2026, 11, 1, 0, 0) {
		t.Fatalf("clamped %v from %v", w.Clamped, time.UnixMilli(w.From).In(ist))
	}
	if w.PrevFrom != nil || !w.Basis.None || w.Basis.Text != "no data before Nov 1 to compare with" {
		t.Fatalf("prev before data start: %+v", w.Basis)
	}
}

func TestWindowCustomCmpClamped(t *testing.T) {
	w := mustWin(t, "7d", "c:2020-01-01", at(2026, 9, 3, 12, 0))
	if !w.Basis.Custom || w.PrevFrom == nil || *w.PrevFrom != at(2026, 9, 3, 0, 0) || *w.PrevTo != endOf(2026, 9, 9) {
		t.Fatalf("custom cmp: %+v", w)
	}
	if w.Basis.Text != "vs Sep 3 – Sep 9 (the period you chose)" {
		t.Fatalf("text %q", w.Basis.Text)
	}
}

func TestWindowLastBucket(t *testing.T) {
	if w := mustWin(t, "today", "prev", 0); w.LastBucket != 10 {
		t.Fatalf("today last bucket = %d", w.LastBucket)
	}
	if w := mustWin(t, "yesterday", "prev", 0); w.LastBucket != 23 {
		t.Fatalf("yesterday last bucket = %d", w.LastBucket)
	}
	if w := mustWin(t, "30d", "prev", 0); w.LastBucket != 29 {
		t.Fatalf("30d last bucket = %d", w.LastBucket)
	}
}

func TestWindowDSTDayBuckets(t *testing.T) {
	ny, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip("no tzdata")
	}
	now := time.Date(2026, 11, 20, 10, 5, 0, 0, ny)
	w, err := ResolveWindow("c:2026-10-30~2026-11-03", "prev", now, ny, 0)
	if err != nil {
		t.Fatal(err)
	}
	b := BucketStarts(w, ny)
	if len(b) != 5 {
		t.Fatalf("%d buckets, want 5", len(b))
	}
	if got := time.Duration(b[3]-b[2]) * time.Millisecond; got != 25*time.Hour {
		t.Fatalf("Nov 1 bucket is %v, want 25h", got)
	}
	for i, s := range b {
		if tt := time.UnixMilli(s).In(ny); tt.Hour() != 0 || tt.Day() != 30+i && tt.Day() != i-1 {
			t.Errorf("bucket %d starts %v", i, tt)
		}
	}
	// A 25-hour day viewed by the hour has 25 buckets.
	d, _ := ResolveWindow("d:2026-11-01", "prev", now, ny, 0)
	if n := len(BucketStarts(d, ny)); n != 25 {
		t.Fatalf("Nov 1 hours = %d, want 25", n)
	}
}

func TestLabels(t *testing.T) {
	a := time.Date(2026, 9, 22, 0, 0, 0, 0, ist)
	if DayLabel(a) != "Sep 22" || RangeLabel(a, a.AddDate(0, 0, 29)) != "Sep 22 – Oct 21" || RangeLabel(a, a) != "Sep 22" {
		t.Fatal(DayLabel(a), RangeLabel(a, a.AddDate(0, 0, 29)))
	}
}

func exactIST() (from, to int64) {
	return winNow.Add(-24 * time.Hour).UnixMilli(), winNow.UnixMilli()
}

func TestExactWindow24h(t *testing.T) {
	from, to := exactIST()
	w := ExactWindow(from, to, "prev", winNow, ist, 0)
	if w.Bucket != "hour" || w.From != from || w.To != to || !w.Elapsed {
		t.Fatalf("%+v", w)
	}
	if w.PrevTo == nil || *w.PrevTo != from-1 || *w.PrevFrom != from-(to-from) {
		t.Fatalf("prev %v %v", w.PrevFrom, w.PrevTo)
	}
	if w.Basis.Short != "prev. 24 hours" || w.Basis.None {
		t.Fatalf("%+v", w.Basis)
	}
}

func TestExactWindowKolkataHourBuckets(t *testing.T) {
	from, to := exactIST()
	w := ExactWindow(from, to, "prev", winNow, ist, 0)
	bs := BucketStarts(w, ist)
	want := time.Date(2026, 11, 19, 10, 0, 0, 0, ist).UnixMilli()
	if bs[0] != want {
		t.Fatalf("first bucket %v, want %v", time.UnixMilli(bs[0]).In(ist), time.UnixMilli(want).In(ist))
	}
	for _, b := range bs {
		if tm := time.UnixMilli(b).In(ist); tm.Minute() != 0 || tm.Second() != 0 {
			t.Fatalf("bucket off the hour: %v", tm)
		}
	}
	if lb := bs[w.LastBucket]; lb > to || to-lb >= 3600_000 {
		t.Fatalf("lastBucket %d (%v) does not hold now", w.LastBucket, time.UnixMilli(lb).In(ist))
	}
}

func TestExactWindowLong(t *testing.T) {
	to := winNow.UnixMilli()
	w := ExactWindow(to-10*24*3600_000, to, "prev", winNow, ist, 0)
	if w.Bucket != "day" || w.Basis.Short != "prev. 10 days" {
		t.Fatalf("%+v", w)
	}
}

func TestExactWindowNoEarlierData(t *testing.T) {
	from, to := exactIST()
	w := ExactWindow(from, to, "prev", winNow, ist, from+3600_000)
	if !w.Basis.None || w.PrevFrom != nil || w.PrevTo != nil {
		t.Fatalf("%+v", w)
	}
	if w.From != from {
		t.Fatalf("from was clamped: %d", w.From)
	}
	n := ExactWindow(from, to, "none", winNow, ist, 0)
	if !n.Basis.None || n.PrevFrom != nil {
		t.Fatalf("%+v", n)
	}
}

func TestExactWindowCustomComparison(t *testing.T) {
	from, to := exactIST()
	w := ExactWindow(from, to, "c:2026-11-15", winNow, ist, 0)
	wantFrom := time.Date(2026, 11, 15, 10, 5, 0, 0, ist).UnixMilli()
	if w.PrevFrom == nil || *w.PrevFrom != wantFrom || *w.PrevTo != wantFrom+(to-from)-1 || !w.Basis.Custom {
		t.Fatalf("%v %v %+v", w.PrevFrom, w.PrevTo, w.Basis)
	}
	o := ExactWindow(from, to, "c:2026-11-19", winNow, ist, 0) // overlaps the window: ignored
	if *o.PrevTo != from-1 || o.Basis.Custom {
		t.Fatalf("overlap not ignored: %v %+v", o.PrevTo, o.Basis)
	}
}
