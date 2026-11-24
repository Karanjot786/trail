package query

import (
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"
)

// maxCustomDays bounds a custom range (c:A~B) so one request cannot ask for decades of buckets.
const maxCustomDays = 3660

// rangeLabels are the human names of the preset ranges.
var rangeLabels = map[string]string{
	"today": "Today", "yesterday": "Yesterday", "wtd": "This week", "mtd": "This month",
	"lastmonth": "Last month", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "12mo": "Last 12 months",
}

// DayLabel formats a day as "Nov 12".
func DayLabel(t time.Time) string { return t.Format("Jan 2") }

// RangeLabel formats a day range as "Sep 22 – Oct 21", or one day as "Sep 22".
func RangeLabel(from, to time.Time) string {
	if sameDay(from, to) {
		return DayLabel(from)
	}
	return DayLabel(from) + " – " + DayLabel(to)
}

func weekdayLabel(t time.Time) string { return t.Format("Mon") + ", " + DayLabel(t) }

func sameDay(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}

// day returns local midnight of t's calendar day shifted by n days (DST safe).
func dayAt(t time.Time, n int) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day()+n, 0, 0, 0, 0, t.Location())
}

// clockOn returns day d at the wall-clock time of c.
func clockOn(d, c time.Time) time.Time {
	return time.Date(d.Year(), d.Month(), d.Day(), c.Hour(), c.Minute(), c.Second(), c.Nanosecond(), d.Location())
}

func monthStart(t time.Time, n int) time.Time {
	return time.Date(t.Year(), t.Month()+time.Month(n), 1, 0, 0, 0, 0, t.Location())
}

func monthLen(t time.Time) int { return monthStart(t, 1).AddDate(0, 0, -1).Day() }

// daysBetween counts calendar days from a to b inclusive (both local midnights).
func daysBetween(a, b time.Time) int {
	n := 0
	for d := a; !d.After(b); d = dayAt(d, 1) {
		n++
	}
	return n
}

func parseDay(s string, loc *time.Location) (time.Time, bool) {
	t, err := time.ParseInLocation("2006-01-02", s, loc)
	return t, err == nil
}

// endMs is the last millisecond of day d.
func endMs(d time.Time) int64 { return dayAt(d, 1).UnixMilli() - 1 }

// ResolveWindow turns a range key and a comparison key into a Window in loc (plan §0.3).
// Single days compare with the day before (the same hours of it while the day is running);
// calendar presets compare one calendar step back; rolling windows compare with the
// window of the same length just before; cmp=c:YYYY-MM-DD picks the comparison start.
// dataStart (unix ms, 0 = unknown) is the site's first event: windows are clamped to it.
func ResolveWindow(rangeKey, cmp string, now time.Time, loc *time.Location, dataStart int64) (Window, error) {
	if loc == nil {
		loc = time.UTC
	}
	now = now.In(loc)
	today := dayAt(now, 0)
	w := Window{Key: rangeKey, TZ: loc.String(), Bucket: "day"}

	var from, to time.Time // local midnights of the first and last day
	var pf, pt time.Time   // comparison days, when a calendar rule sets them
	why, clip := "", false // clip: the comparison ends at now's wall clock (running calendar windows)
	switch {
	case rangeKey == "today":
		from, to = today, today
	case rangeKey == "yesterday":
		from, to = dayAt(today, -1), dayAt(today, -1)
	case rangeKey == "wtd":
		from, to = dayAt(today, -((int(today.Weekday())+6)%7)), today
		pf, pt, why, clip = dayAt(from, -7), dayAt(to, -7), "same days last week", true
	case rangeKey == "mtd":
		from, to = monthStart(today, 0), today
		pf = monthStart(today, -1)
		pt, why, clip = dayAt(pf, min(today.Day(), monthLen(pf))-1), "same days last month", true
	case rangeKey == "lastmonth":
		from, to = monthStart(today, -1), dayAt(monthStart(today, 0), -1)
		pf, pt, why = monthStart(today, -2), dayAt(from, -1), "the month before"
	case rangeKey == "7d", rangeKey == "30d", rangeKey == "90d":
		var n int
		fmt.Sscanf(rangeKey, "%dd", &n)
		from, to = dayAt(today, -(n-1)), today
	case rangeKey == "12mo":
		from, to = dayAt(today, -364), today
	case strings.HasPrefix(rangeKey, "d:"):
		if d, ok := parseDay(rangeKey[2:], loc); ok && !d.After(today) {
			from, to = d, d
			w.Label = weekdayLabel(d)
		}
	case strings.HasPrefix(rangeKey, "c:"):
		a, b, ok := strings.Cut(rangeKey[2:], "~")
		da, okA := parseDay(a, loc)
		db, okB := parseDay(b, loc)
		if ok && okA && okB {
			if db.Before(da) {
				da, db = db, da
			}
			if db.After(today) {
				db = today
			}
			if !da.After(db) && daysBetween(da, db) <= maxCustomDays {
				from, to = da, db
				w.Label = RangeLabel(da, db)
				if sameDay(da, db) {
					w.Label = weekdayLabel(da)
				}
			}
		}
	}
	if from.IsZero() {
		if rangeKey != "" {
			w.Invalid = rangeKey
		}
		w.Key, from, to = "30d", dayAt(today, -29), today
	}
	if w.Label == "" {
		w.Label = rangeLabels[w.Key]
	}
	if dataStart > 0 {
		if ds := dayAt(time.UnixMilli(dataStart).In(loc), 0); from.Before(ds) && !ds.After(to) {
			w.Clamped, from = true, ds
			if !pf.IsZero() { // a calendar comparison is no longer "the same days"
				pf, pt = time.Time{}, time.Time{}
			}
		}
	}
	single := sameDay(from, to)
	running := sameDay(to, today)
	if single {
		w.Bucket = "hour"
	}
	w.Elapsed = running // the window is still running: its last bucket ends at now
	sameHours := single && running
	w.From = from.UnixMilli()
	w.To = endMs(to)
	if running {
		w.To = now.UnixMilli()
	}
	n := daysBetween(from, to)
	if pf.IsZero() {
		pf, pt = dayAt(from, -n), dayAt(from, -1)
		switch {
		case sameHours:
			why, clip = "same hours yesterday", true
		case single:
			why = "the day before"
		default:
			why = fmt.Sprintf("the previous %d days", n)
		}
	}

	custom := false
	if c, ok := strings.CutPrefix(cmp, "c:"); ok {
		if d, ok := parseDay(c, loc); ok {
			if latest := dayAt(today, -(n - 1)); d.After(latest) {
				d = latest
			}
			if dataStart > 0 {
				if ds := dayAt(time.UnixMilli(dataStart).In(loc), 0); d.Before(ds) {
					d = ds
				}
			}
			if !sameDay(d, pf) {
				custom, pf, pt, why, clip = true, d, dayAt(d, n-1), "the period you chose", false
			}
		}
	}
	w.Basis.Custom = custom
	w.LastBucket = lastBucket(w, now, loc)

	if cmp == "none" {
		w.Basis = Basis{Text: "no comparison", Short: "no comparison", None: true}
		return w, nil
	}
	prevTo := endMs(pt)
	if clip {
		prevTo = clockOn(pt, now).UnixMilli()
	}
	if dataStart > 0 && prevTo < dayAt(time.UnixMilli(dataStart).In(loc), 0).UnixMilli() {
		ds := DayLabel(time.UnixMilli(dataStart).In(loc))
		w.Basis = Basis{Text: "no data before " + ds + " to compare with", Short: "no earlier data", Dates: "before " + ds, None: true, Custom: custom}
		return w, nil
	}
	pfMs := pf.UnixMilli()
	w.PrevFrom, w.PrevTo = &pfMs, &prevTo
	w.Basis.Dates = RangeLabel(pf, pt)
	w.Basis.Why = why
	if single {
		w.Basis.Text = "vs " + weekdayLabel(pf)
		if clip {
			w.Basis.Text += " up to " + now.Format("15:04")
		}
	} else {
		w.Basis.Text = "vs " + w.Basis.Dates
	}
	w.Basis.Text += " (" + why + ")"
	switch {
	case custom:
		w.Basis.Short = w.Basis.Dates
	case single && clip:
		w.Basis.Short = "same hours yesterday"
	case single:
		w.Basis.Short = "day before"
	case w.Key == "wtd" || w.Key == "mtd":
		w.Basis.Short = why
	case w.Key == "lastmonth":
		w.Basis.Short = pf.Format("January")
	default:
		w.Basis.Short = fmt.Sprintf("prev. %d days", n)
	}
	return w, nil
}

// DataStart is the site's first event (unix ms), 0 when it has none. min(ts) on the
// events_site_ts prefix is O(log n).
func DataStart(db *sql.DB, site string) (int64, error) {
	var ts sql.NullInt64
	if err := db.QueryRow(`SELECT min(ts) FROM events WHERE site_id=?`, site).Scan(&ts); err != nil {
		return 0, err
	}
	return ts.Int64, nil
}

// exactHourSpan is the longest exact window bucketed by hour (the legacyBuckets threshold).
const exactHourSpan = 48 * time.Hour

// ExactWindow builds the window of an exact {from,to} range (and the MCP/API "24h"): the
// times are kept as given, never rounded to days or clamped to dataStart. The comparison is
// the span just before from (same formula as prevParams), or cmp=c:YYYY-MM-DD, which starts
// that day at from's wall clock and must end before from. Windows up to 48 h bucket by hour.
func ExactWindow(from, to int64, cmp string, now time.Time, loc *time.Location, dataStart int64) Window {
	if loc == nil {
		loc = time.UTC
	}
	now = now.In(loc)
	f, t := time.UnixMilli(from).In(loc), time.UnixMilli(to).In(loc)
	fd, td := dayAt(f, 0), dayAt(t, 0)
	w := Window{
		Key: "c:" + fd.Format(time.DateOnly) + "~" + td.Format(time.DateOnly), Label: RangeLabel(fd, td),
		TZ: loc.String(), From: from, To: to, Bucket: "day", Elapsed: to >= now.UnixMilli(),
	}
	span := to - from
	hours := span <= exactHourSpan.Milliseconds()
	if hours {
		w.Bucket = "hour"
	}
	w.LastBucket = lastBucket(w, now, loc)
	if cmp == "none" {
		w.Basis = Basis{Text: "no comparison", Short: "no comparison", None: true}
		return w
	}
	pf, pt, custom := from-span, from-1, false
	if c, ok := strings.CutPrefix(cmp, "c:"); ok {
		if d, ok := parseDay(c, loc); ok {
			cf := clockOn(d, f).UnixMilli()
			if cf+span-1 < from {
				pf, pt, custom = cf, cf+span-1, true
			}
		}
	}
	if dataStart > 0 && pt < dataStart {
		ds := DayLabel(time.UnixMilli(dataStart).In(loc))
		w.Basis = Basis{Text: "no data before " + ds + " to compare with", Short: "no earlier data", Dates: "before " + ds, None: true, Custom: custom}
		return w
	}
	w.PrevFrom, w.PrevTo = &pf, &pt
	pfd, ptd := dayAt(time.UnixMilli(pf).In(loc), 0), dayAt(time.UnixMilli(pt).In(loc), 0)
	w.Basis.Dates, w.Basis.Custom = RangeLabel(pfd, ptd), custom
	var n int
	var unit string
	if hours {
		n, unit = int(math.Round(float64(span)/float64(time.Hour/time.Millisecond))), "hours"
	} else {
		n, unit = int(math.Round(float64(span)/float64(24*time.Hour/time.Millisecond))), "days"
	}
	w.Basis.Why = fmt.Sprintf("the previous %d %s", n, unit)
	w.Basis.Short = fmt.Sprintf("prev. %d %s", n, unit)
	if custom {
		w.Basis.Why, w.Basis.Short = "the period you chose", w.Basis.Dates
	}
	w.Basis.Text = "vs " + w.Basis.Dates + " (" + w.Basis.Why + ")"
	return w
}

// lastBucket is the index of the bucket holding now (or the last bucket of a past window).
func lastBucket(w Window, now time.Time, loc *time.Location) int {
	starts := BucketStarts(w, loc)
	nowMs := now.UnixMilli()
	for i := len(starts) - 1; i >= 0; i-- {
		if starts[i] <= nowMs {
			return i
		}
	}
	return 0
}

// BucketStarts lists the start (unix ms) of every bucket of w in loc: each hour of a
// one-day window (23 or 25 on DST days) or each calendar day. Never fixed 24 h steps.
func BucketStarts(w Window, loc *time.Location) []int64 {
	return bucketStarts(w.From, w.To, w.Bucket, loc)
}

func bucketStarts(fromMs, toMs int64, bucket string, loc *time.Location) []int64 {
	if loc == nil {
		loc = time.UTC
	}
	from := dayAt(time.UnixMilli(fromMs).In(loc), 0)
	last := dayAt(time.UnixMilli(toMs).In(loc), 0)
	out := []int64{}
	if bucket == "hour" {
		// Start on the local hour holding from (an exact window need not begin at midnight).
		f := time.UnixMilli(fromMs).In(loc)
		from = time.Date(f.Year(), f.Month(), f.Day(), f.Hour(), 0, 0, 0, loc)
		end := dayAt(last, 1).UnixMilli()
		for t := from.UnixMilli(); t < end; t += int64(time.Hour / time.Millisecond) {
			out = append(out, t)
		}
		return out
	}
	for d := from; !d.After(last); d = dayAt(d, 1) {
		out = append(out, d.UnixMilli())
	}
	return out
}
