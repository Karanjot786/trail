package api

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"

	"trail/internal/agents"
	"trail/internal/auth"
	"trail/internal/crawlers"
)

const (
	maxCrawlBody  = 1 << 20 // 1 MiB of NDJSON per request
	maxCrawlLines = 10_000
	maxCrawlField = 4 << 10 // ip, host, sa, si and sig, each
	// maxRelaysPerRequest bounds the signed lines one request may verify, so a
	// single token cannot flood the shared relay cache.
	maxRelaysPerRequest = 100
)

// postCrawls takes NDJSON request records from a crawl-scoped token bound to
// a site, and answers 202 {accepted, kept}. A line is {ts, ua, path, status}
// plus the optional v2 fields ip, host, sa, si and sig (status 0 = unknown).
// A line with signature fields is a signed agent navigation seen by the server
// hook: it goes to the agent relay (never to crawl_hits). Crawler IPs are
// checked against the operators' published lists. The owner (cookie) or an
// all-sites write token names the site with ?site=.
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
	hostOK := func(h string) bool { return s.sites.Allowed(site, hostOnly(h)) }
	crawls := recs[:0:0]
	relays := 0
	for _, rec := range recs {
		_, _, _, crawler := crawlers.Lookup(rec.UA)
		if rec.SA != "" && !crawler && relays < maxRelaysPerRequest {
			relays++
			sig := agents.Signed{Authority: rec.Host, SignatureAgent: rec.SA, SignatureInput: rec.SI, Signature: rec.Sig}
			if res := s.agents.RelaySigned(site, rec.IP, rec.UA, sig, hostOK); res.ID != "" {
				continue
			}
		}
		crawls = append(crawls, rec)
	}
	kept, err := crawlers.Ingest(s.db, site, crawls, s.agents.VerifyCrawler)
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

// hostOnly drops a port from host ("example.com:443" → "example.com").
func hostOnly(h string) string {
	if host, _, err := net.SplitHostPort(h); err == nil {
		return host
	}
	return h
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
			return nil, fmt.Errorf("line %d: bad JSON or unknown field; want ts, ua, path, status and optional ip, host, sa, si, sig", n)
		}
		for _, f := range []string{rec.IP, rec.Host, rec.SA, rec.SI, rec.Sig} {
			if len(f) > maxCrawlField {
				return nil, fmt.Errorf("line %d: field too long", n)
			}
		}
		recs = append(recs, rec)
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("bad body: %w", err)
	}
	return recs, nil
}
