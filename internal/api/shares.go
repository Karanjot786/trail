package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"trail/internal/meta"
	"trail/internal/query"
	"trail/internal/share"
	"trail/internal/sites"
)

func (s *server) shareRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/shares", s.cookieOnly(s.listShares))
	mux.HandleFunc("POST /api/shares", s.cookieOnly(s.createShare))
	mux.HandleFunc("DELETE /api/shares/{id}", s.cookieOnly(s.revokeShare))
}

func (s *server) listShares(w http.ResponseWriter, r *http.Request) {
	list, err := meta.ListShares(s.db)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, list)
}

// createShare takes {site, label, state, hideRevenue, ttl: "24h"|"7d"|"30d"|"never"}
// and answers the Share with its url, the only time the token is shown.
func (s *server) createShare(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Site        string `json:"site"`
		Label       string `json:"label"`
		State       string `json:"state"`
		HideRevenue bool   `json:"hideRevenue"`
		TTL         string `json:"ttl"`
	}
	if !readJSON(w, r, &in) || !s.siteOK(w, r, in.Site) {
		return
	}
	ttl, ok := meta.ShareTTLs[in.TTL]
	if !ok {
		http.Error(w, "ttl must be 24h, 7d, 30d or never", http.StatusBadRequest)
		return
	}
	sh, _, err := meta.CreateShare(s.db, in.Site, in.Label, in.State, in.HideRevenue, ttl)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeCreated(w, sh)
}

func (s *server) revokeShare(w http.ResponseWriter, r *http.Request) {
	if err := meta.RevokeShare(s.db, r.PathValue("id")); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

const (
	sharePrefix    = "/api/share/"
	shareRateLimit = 300 // requests per minute per share link
)

// shareReads are the read routes a share link may call (besides meta and sites).
var shareReads = map[string]bool{}

var shareIDRoute = regexp.MustCompile(`^(goals/[0-9]+/detail|funnels/[0-9]+/(report|dropoff))$`)

func init() {
	for _, r := range strings.Fields(`stats series breakdown changes heatmap live visitors sessions journey
		campaigns ai-referrals events events/detail goals goals/report paths funnels revenue revenue/breakdown
		crawlers notes`) {
		shareReads[r] = true
	}
}

// revenueKeys are zeroed in every response of a hide-revenue link.
var revenueKeys = []string{"revenueMinor", "netMinor", "aovMinor", "amountMinor"}

type shareHandler struct {
	s     *server
	inner http.Handler

	mu      sync.Mutex
	buckets map[string]*rateBucket
}

type rateBucket struct {
	left float64
	at   time.Time
}

// ShareHandler serves /api/share/{token}/{route} without cookie auth. The
// link's site and filters are forced, writes are refused, every person id is
// replaced by a per-link pseudonym (and identify() names dropped), and a
// hide-revenue link zeroes revenue and has no revenue routes. Expired or
// revoked links answer 410.
func ShareHandler(db *sql.DB, reg *sites.Registry, tz *time.Location, opts ...Option) http.Handler {
	s := newServer(db, reg, tz, opts...)
	return &shareHandler{s: s, inner: s.routes(), buckets: map[string]*rateBucket{}}
}

func (h *shareHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	tok, route, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, sharePrefix), "/")
	sh, key, err := meta.LookupShare(h.s.db, tok, h.s.now())
	switch {
	case errors.Is(err, meta.ErrGone):
		http.Error(w, "This link has expired or was revoked", http.StatusGone)
		return
	case errors.Is(err, meta.ErrNotFound):
		http.NotFound(w, r)
		return
	case err != nil:
		log.Printf("share: %v", err) // the error never carries the token
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "share links are read-only", http.StatusMethodNotAllowed)
		return
	}
	if !h.allow(sh.ID) {
		w.Header().Set("Retry-After", "1")
		http.Error(w, "rate limited", http.StatusTooManyRequests)
		return
	}
	site, ok := h.s.sites.Get(sh.Site)
	if !ok {
		http.Error(w, "This link has expired or was revoked", http.StatusGone)
		return
	}
	switch route {
	case "meta", "sites":
		info, err := h.s.siteInfo(site)
		if err != nil {
			h.s.fail(w, r, err)
			return
		}
		if sh.HideRevenue {
			info.Features.Revenue = false
		}
		if route == "sites" {
			writeJSON(w, []query.Site{info})
			return
		}
		writeJSON(w, meta.ShareMeta{Site: info, State: sh.State, HideRevenue: sh.HideRevenue, Expires: sh.Expires})
		return
	}
	q := r.URL.Query()
	if !shareReads[route] && !shareIDRoute.MatchString(route) ||
		sh.HideRevenue && (strings.HasPrefix(route, "revenue") || q.Get("metric") == "revenue") {
		http.NotFound(w, r)
		return
	}
	if !h.rewriteQuery(q, sh, key) {
		http.NotFound(w, r)
		return
	}
	r2 := r.Clone(r.Context())
	r2.URL.Path, r2.URL.RawPath, r2.URL.RawQuery = "/api/"+route, "", q.Encode()
	r2.Header.Del("Authorization")
	r2.Header.Del("Cookie")
	buf := &bufferedWriter{header: http.Header{}, status: http.StatusOK}
	h.inner.ServeHTTP(buf, r2)
	if buf.status != http.StatusOK {
		http.Error(w, strings.TrimSpace(buf.body.String()), buf.status)
		return
	}
	out, err := scrubJSON(buf.body.Bytes(), key, sh.HideRevenue)
	if err != nil {
		log.Printf("share %s: %v", route, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if n := buf.header.Get("X-Total-Count"); n != "" {
		w.Header().Set("X-Total-Count", n)
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(out)
}

// rewriteQuery forces the link's site and filters, drops what a share may not
// use (search by id, exports), and turns opaque visitor ids back into person
// ids. false means an id this link did not make.
func (h *shareHandler) rewriteQuery(q url.Values, sh meta.Share, key []byte) bool {
	for _, k := range []string{"f", "q", "format", "site"} {
		q.Del(k)
	}
	q.Set("site", sh.Site)
	if state, err := url.ParseQuery(sh.State); err == nil {
		for _, f := range state["f"] {
			q.Add("f", f)
		}
	}
	if opaque := q.Get("person"); opaque != "" {
		person, err := share.Reveal(key, opaque)
		if err != nil {
			return false
		}
		q.Set("person", person)
	}
	return true
}

func (h *shareHandler) allow(id string) bool {
	now := h.s.now()
	h.mu.Lock()
	defer h.mu.Unlock()
	b := h.buckets[id]
	if b == nil {
		b = &rateBucket{left: shareRateLimit, at: now}
		h.buckets[id] = b
	}
	b.left = min(shareRateLimit, b.left+now.Sub(b.at).Seconds()*shareRateLimit/60)
	b.at = now
	if b.left < 1 {
		return false
	}
	b.left--
	return true
}

// scrubJSON pseudonymises every person in a report and, for hide-revenue
// links, zeroes revenue.
func scrubJSON(body []byte, key []byte, hideRevenue bool) ([]byte, error) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	scrub(v, key, hideRevenue)
	return json.Marshal(v)
}

func scrub(v any, key []byte, hideRevenue bool) {
	switch x := v.(type) {
	case []any:
		for _, e := range x {
			scrub(e, key, hideRevenue)
		}
	case map[string]any:
		if p, ok := x["person"].(string); ok && p != "" {
			opaque, label := share.Pseudonym(key, p)
			x["person"] = opaque
			if _, ok := x["label"]; ok {
				x["label"] = label
			}
			if _, ok := x["identified"]; ok {
				x["identified"] = false
			}
		}
		if t, _ := x["type"].(string); t == "identify" { // identify() steps carry the user id
			x["name"], x["props"] = "", map[string]any{}
		}
		if hideRevenue {
			for _, k := range revenueKeys {
				if _, ok := x[k]; ok {
					x[k] = json.Number("0")
				}
			}
			if f, ok := x["features"].(map[string]any); ok {
				f["revenue"] = false
			}
		}
		for _, e := range x {
			scrub(e, key, hideRevenue)
		}
	}
}

// bufferedWriter captures the inner handler's response for scrubbing.
type bufferedWriter struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (b *bufferedWriter) Header() http.Header         { return b.header }
func (b *bufferedWriter) Write(p []byte) (int, error) { return b.body.Write(p) }
func (b *bufferedWriter) WriteHeader(code int)        { b.status = code }
