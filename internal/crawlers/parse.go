package crawlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"time"
)

// Record is one request from an access log. TS is unix ms.
type Record struct {
	TS     int64  `json:"ts"`
	UA     string `json:"ua"`
	Path   string `json:"path"`
	Status int    `json:"status"`
}

const combinedTime = "02/Jan/2006:15:04:05 -0700"

// ParseCombined parses one nginx/Apache "combined" log line:
//
//	ip - user [10/Oct/2026:13:55:36 +0000] "GET /path HTTP/1.1" 200 123 "referer" "user agent"
//
// Quotes inside quoted fields may be backslash-escaped (nginx writes \x22 or \").
func ParseCombined(line string) (Record, bool) {
	var rec Record
	open := strings.IndexByte(line, '[')
	if open < 0 {
		return rec, false
	}
	closeIdx := strings.IndexByte(line[open:], ']')
	if closeIdx < 0 {
		return rec, false
	}
	ts, err := time.Parse(combinedTime, line[open+1:open+closeIdx])
	if err != nil {
		return rec, false
	}
	rest := line[open+closeIdx+1:]
	request, rest, ok := quoted(rest)
	if !ok {
		return rec, false
	}
	statusTok, rest := nextField(rest)
	_, after := nextField(rest) // response size
	status, err := strconv.Atoi(statusTok)
	if err != nil {
		return rec, false
	}
	if _, after, ok = quoted(after); !ok { // referer
		return rec, false
	}
	ua, _, ok := quoted(after)
	if !ok {
		return rec, false
	}
	parts := strings.Fields(request)
	if len(parts) < 2 {
		return rec, false
	}
	return Record{TS: ts.UnixMilli(), UA: ua, Path: parts[1], Status: status}, true
}

// nextField splits the next space-separated token off s.
func nextField(s string) (field, rest string) {
	s = strings.TrimLeft(s, " \t")
	if i := strings.IndexAny(s, " \t"); i >= 0 {
		return s[:i], s[i:]
	}
	return s, ""
}

// quoted reads the next "…" field from s (leading spaces allowed), unescaping \" and \\.
func quoted(s string) (field, rest string, ok bool) {
	s = strings.TrimLeft(s, " \t")
	if !strings.HasPrefix(s, `"`) {
		return "", s, false
	}
	var b strings.Builder
	for i := 1; i < len(s); i++ {
		switch c := s[i]; c {
		case '\\':
			if i+3 < len(s) && s[i+1] == 'x' {
				if n, err := strconv.ParseUint(s[i+2:i+4], 16, 8); err == nil {
					b.WriteByte(byte(n))
					i += 3
					continue
				}
			}
			if i+1 < len(s) {
				i++
				b.WriteByte(s[i])
			}
		case '"':
			return b.String(), s[i+1:], true
		default:
			b.WriteByte(c)
		}
	}
	return "", s, false
}

// caddyLine is the part of a Caddy JSON access log entry we read.
type caddyLine struct {
	TS      json.RawMessage `json:"ts"`
	Status  int             `json:"status"`
	Request struct {
		URI     string              `json:"uri"`
		Headers map[string][]string `json:"headers"`
	} `json:"request"`
}

// ParseCaddyJSON parses one Caddy JSON access log entry. ts may be unix
// seconds (Caddy's default) or an RFC 3339 string.
func ParseCaddyJSON(line []byte) (Record, bool) {
	var l caddyLine
	if err := json.Unmarshal(line, &l); err != nil || l.Request.URI == "" || l.Status == 0 {
		return Record{}, false
	}
	var ts int64
	var secs float64
	var str string
	switch {
	case json.Unmarshal(l.TS, &secs) == nil && secs > 0 && !math.IsInf(secs, 0):
		ts = int64(secs * 1000)
	case json.Unmarshal(l.TS, &str) == nil:
		t, err := time.Parse(time.RFC3339Nano, str)
		if err != nil {
			return Record{}, false
		}
		ts = t.UnixMilli()
	default:
		return Record{}, false
	}
	var ua string
	for k, v := range l.Request.Headers {
		if strings.EqualFold(k, "User-Agent") && len(v) > 0 {
			ua = v[0]
		}
	}
	return Record{TS: ts, UA: ua, Path: l.Request.URI, Status: l.Status}, true
}

// maxLine caps one log line; longer lines are skipped.
const maxLine = 64 << 10

// Scan reads an access log in format ("combined" or "caddy") and calls emit
// with batches of at most batch records that match the catalogue and are newer
// than since (unix ms). It returns the lines read and the records kept.
func Scan(r io.Reader, format string, since int64, batch int, emit func([]Record) error) (lines, kept int, err error) {
	var parse func(string) (Record, bool)
	switch format {
	case "", "combined":
		parse = ParseCombined
	case "caddy":
		parse = func(s string) (Record, bool) { return ParseCaddyJSON([]byte(s)) }
	default:
		return 0, 0, fmt.Errorf("unknown format %q: want combined or caddy", format)
	}
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64<<10), maxLine)
	buf := make([]Record, 0, batch)
	for sc.Scan() {
		lines++
		rec, ok := parse(sc.Text())
		if !ok || rec.TS <= since {
			continue
		}
		if _, _, _, known := Lookup(rec.UA); !known {
			continue
		}
		buf = append(buf, rec)
		if len(buf) == batch {
			if err := emit(buf); err != nil {
				return lines, kept, err
			}
			kept += len(buf)
			buf = buf[:0]
		}
	}
	if err := sc.Err(); err != nil {
		return lines, kept, fmt.Errorf("read log: %w", err)
	}
	if len(buf) > 0 {
		if err := emit(buf); err != nil {
			return lines, kept, err
		}
		kept += len(buf)
	}
	return lines, kept, nil
}
