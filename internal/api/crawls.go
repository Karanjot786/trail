package api

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"

	"trail/internal/auth"
	"trail/internal/crawlers"
)

const (
	maxCrawlBody  = 1 << 20 // 1 MiB of NDJSON per request
	maxCrawlLines = 10_000
)

// postCrawls takes NDJSON request records ({ts, ua, path, status} per line)
// from a crawl-scoped token bound to a site, and answers 202 {accepted, kept}.
// The owner (cookie) or an all-sites write token names the site with ?site=.
func (s *server) postCrawls(w http.ResponseWriter, r *http.Request) {
	site := r.URL.Query().Get("site")
	if t, ok := auth.TokenFrom(r.Context()); ok && t.Site != "" {
		if site != "" && site != t.Site {
			http.Error(w, "token is limited to site "+t.Site, http.StatusForbidden)
			return
		}
		site = t.Site
		if !s.known(site) {
			http.Error(w, "the token's site no longer exists", http.StatusForbidden)
			return
		}
	} else if !s.known(site) {
		http.Error(w, "unknown site", http.StatusBadRequest)
		return
	}
	// Only JSON types: a cross-site form cannot send them without a preflight.
	if mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil ||
		(mt != "application/x-ndjson" && mt != "application/json") {
		http.Error(w, "Content-Type must be application/x-ndjson", http.StatusUnsupportedMediaType)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxCrawlBody))
	var tooBig *http.MaxBytesError
	if errors.As(err, &tooBig) {
		http.Error(w, "body over 1 MiB", http.StatusRequestEntityTooLarge)
		return
	}
	if err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	recs, err := parseNDJSON(body)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, errTooManyLines) {
			status = http.StatusRequestEntityTooLarge
		}
		http.Error(w, err.Error(), status)
		return
	}
	kept, err := crawlers.Ingest(s.db, site, recs)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	writeJSON(w, struct {
		Accepted int `json:"accepted"`
		Kept     int `json:"kept"`
	}{len(recs), kept})
}

var errTooManyLines = fmt.Errorf("at most %d lines per request", maxCrawlLines)

func parseNDJSON(body []byte) ([]crawlers.Record, error) {
	recs := []crawlers.Record{}
	sc := bufio.NewScanner(bytes.NewReader(body))
	sc.Buffer(make([]byte, 0, 64<<10), maxCrawlBody)
	n := 0
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 {
			continue
		}
		if n++; n > maxCrawlLines {
			return nil, errTooManyLines
		}
		var rec crawlers.Record
		dec := json.NewDecoder(bytes.NewReader(line))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&rec); err != nil {
			return nil, fmt.Errorf("line %d: want {ts, ua, path, status}", n)
		}
		recs = append(recs, rec)
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("bad body: %w", err)
	}
	return recs, nil
}
