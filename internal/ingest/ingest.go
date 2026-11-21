// Package ingest accepts tracker events (POST /_t/e) and serves the tracker script.
package ingest

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"trail/internal/enrich"
	"trail/internal/netx"
	"trail/internal/sites"
	"trail/internal/store"
)

// Files holds the built tracker files: t.js (full), t.p.js (private only)
// and t.x.js (opt-in extras).
//
//go:embed t.js t.p.js t.x.js
var Files embed.FS

// JS is the full tracker, served at /_t/t.js.
var JS = mustRead("t.js")

// trackerFiles maps each servable file name to its contents. Nothing outside
// this fixed set is ever served.
var trackerFiles = map[string][]byte{
	"t.js":   JS,
	"t.p.js": mustRead("t.p.js"),
	"t.x.js": mustRead("t.x.js"),
}

// trackerHandlers is built once at init, so each file is gzipped once.
var trackerHandlers = func() map[string]http.Handler {
	m := map[string]http.Handler{}
	for name, js := range trackerFiles {
		m[name] = TrackerHandler(js)
	}
	return m
}()

func mustRead(name string) []byte {
	b, err := Files.ReadFile(name)
	if err != nil {
		panic(err)
	}
	return b
}

const (
	maxBody  = 64 << 10
	maxBatch = 50
	maxProps = 20
	maxRetry = 1000
	maxEngMs = 24 * 60 * 60 * 1000
)

var (
	validTypes = map[string]bool{
		"pageview": true, "engage": true, "event": true, "identify": true,
		"error": true, "outbound": true, "form": true, "vital": true,
	}
	// Anon ids go into Set-Cookie, so keep them to a cookie-safe charset.
	reID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
)

// payload is the wire format sent by the tracker.
type payload struct {
	S   string                     `json:"s"`
	T   string                     `json:"t"`
	A   string                     `json:"a"`
	SS  string                     `json:"ss"`
	UID string                     `json:"uid"`
	U   string                     `json:"u"`
	R   string                     `json:"r"`
	RT  string                     `json:"rt"`
	N   string                     `json:"n"`
	D   map[string]json.RawMessage `json:"d"`
	E   float64                    `json:"e"`
	SC  float64                    `json:"sc"`
	Env string                     `json:"env"`
	W   int                        `json:"w"`
	RC  float64                    `json:"rc"`
	M   string                     `json:"m"` // "f" full (default), "p" private
}

type handler struct {
	st    *store.Store
	geo   *enrich.Geo
	sites *sites.Registry
	now   func() time.Time
	priv  *Private
	limit *limiter // nil: no rate limit
	ips   *netx.Resolver
}

// Option configures the ingest handler.
type Option func(*handler)

// WithPrivate sets the identity source for private-mode events.
func WithPrivate(p *Private) Option {
	return func(h *handler) { h.priv = p }
}

// WithProxies sets which proxies' forwarding headers are believed when
// deriving the client IP. The default is netx.Default().
func WithProxies(r *netx.Resolver) Option {
	return func(h *handler) { h.ips = r }
}

// WithRateLimit limits each client IP to rps requests per second with the
// given burst. Over the limit is 429.
func WithRateLimit(rps float64, burst int) Option {
	return func(h *handler) { h.limit = newLimiter(rps, burst, time.Now) }
}

// New returns the ingest handler for POST /_t/e (and its CORS preflight).
// reg says which site ids exist and which origins may send for each.
//
// Events must come from a browser on an allowed origin: the Origin header, or
// the Referer host when Origin is absent. A request with neither is refused;
// server-side senders will authenticate with a per-site secret key instead.
func New(st *store.Store, geo *enrich.Geo, reg *sites.Registry, opts ...Option) http.Handler {
	h := &handler{st: st, geo: geo, sites: reg, now: time.Now}
	for _, o := range opts {
		o(h)
	}
	if h.priv == nil {
		h.priv = NewPrivate(time.UTC, time.Now)
	}
	if h.ips == nil {
		h.ips = netx.Default()
	}
	return h
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Echo the origin rather than "*". Refused requests get it too, so the
	// tracker can read the 4xx and drop the events instead of retrying them.
	origin := r.Header.Get("Origin")
	w.Header().Set("Vary", "Origin")
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	} else {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	}
	switch r.Method {
	case http.MethodOptions:
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Max-Age", "86400")
		w.WriteHeader(http.StatusNoContent)
		return
	case http.MethodPost:
	default:
		w.Header().Set("Allow", "POST, OPTIONS")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.limit != nil && !h.limit.allow(h.ips.ClientIP(r)) {
		w.Header().Set("Retry-After", "1")
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			http.Error(w, "body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}
	ps, msg := decode(body)
	if msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	// Whole-batch failures: mixed sites and unknown site.
	for i := range ps {
		if ps[i].S != ps[0].S {
			http.Error(w, "mixed sites in batch", http.StatusBadRequest)
			return
		}
	}
	site, ok := h.sites.Get(ps[0].S)
	if !ok {
		http.Error(w, "unknown site", http.StatusBadRequest)
		return
	}
	if !h.sites.Allowed(site.ID, sourceHost(r)) {
		h.sites.Reject(site.ID)
		w.WriteHeader(http.StatusForbidden) // no detail: don't help probe the list
		return
	}
	domain := site.Domain
	// Invalid events inside a batch are skipped; the rest are stored.
	evs := make([]store.Event, 0, len(ps))
	valid := make([]payload, 0, len(ps))
	var firstErr string
	for i := range ps {
		p := &ps[i]
		msg := validate(p, true)
		var props string
		if msg == "" {
			var err error
			if props, err = flatProps(p.D); err != nil {
				msg = err.Error()
			}
		}
		if msg != "" {
			if firstErr == "" {
				firstErr = msg
			}
			continue
		}
		valid = append(valid, *p)
		evs = append(evs, h.event(r, p, domain, props))
	}
	if len(evs) == 0 {
		http.Error(w, firstErr, http.StatusBadRequest)
		return
	}
	rejected := len(ps) - len(evs)
	ps = valid

	// Private events get a server-side identity. One request has one IP and
	// UA, so Identify runs once; the IP is used only for this hash.
	var anon, sess, cookie string
	for i := range evs {
		if ps[i].M == "p" {
			if anon == "" {
				anon, sess = h.priv.Identify(ps[i].S, h.ips.ClientIP(r), r.UserAgent())
			}
			evs[i].AnonID, evs[i].SessionID, evs[i].UserID = anon, sess, ""
		} else if cookie == "" {
			cookie = ps[i].A
		}
	}

	for _, e := range evs {
		h.st.Enqueue(e)
	}
	if cookie != "" {
		http.SetCookie(w, &http.Cookie{
			Name: "_t_id", Value: cookie, Path: "/", MaxAge: 31536000, SameSite: http.SameSiteLaxMode,
		})
	}
	w.Header().Set("X-Trail-Accepted", strconv.Itoa(len(evs)))
	w.Header().Set("X-Trail-Rejected", strconv.Itoa(rejected))
	w.WriteHeader(http.StatusNoContent)
}

// sourceHost is the host of the page that sent r: the Origin header, else the
// Referer. Browsers send Origin on every cross-origin POST and on same-origin
// ones too, which covers a /_t/* rewrite on the site's own domain.
func sourceHost(r *http.Request) string {
	src := r.Header.Get("Origin")
	if src == "" {
		src = r.Header.Get("Referer")
	}
	u, err := url.Parse(src)
	if err != nil {
		return ""
	}
	return u.Hostname()
}

// decode parses a single event object or an array of 1 to 50 of them.
func decode(body []byte) ([]payload, string) {
	if t := bytes.TrimSpace(body); len(t) > 0 && t[0] == '[' {
		var ps []payload
		if err := json.Unmarshal(t, &ps); err != nil {
			return nil, "malformed json"
		}
		switch {
		case len(ps) == 0:
			return nil, "empty batch"
		case len(ps) > maxBatch:
			return nil, "batch too large"
		}
		return ps, ""
	}
	var p payload
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, "malformed json"
	}
	return []payload{p}, ""
}

func validate(p *payload, knownSite bool) string {
	switch {
	case !knownSite:
		return "unknown site"
	case !validTypes[p.T]:
		return "unknown type"
	case p.M == "p":
		// Private mode: the server derives a and ss, so the client's are ignored.
		if p.T == "identify" {
			return "identify not allowed in private mode"
		}
		return ""
	case p.M != "" && p.M != "f":
		return "unknown mode"
	case !reID.MatchString(p.A):
		return "bad anon id"
	case p.SS != "" && !reID.MatchString(p.SS):
		return "bad session id"
	case p.T == "identify" && p.UID == "":
		return "identify needs uid"
	}
	return ""
}

// flatProps re-encodes d, rejecting more than 20 keys or non-scalar values.
func flatProps(d map[string]json.RawMessage) (string, error) {
	if len(d) == 0 {
		return "", nil
	}
	if len(d) > maxProps {
		return "", errors.New("too many props")
	}
	for _, v := range d {
		v = bytes.TrimSpace(v)
		if len(v) > 0 && (v[0] == '{' || v[0] == '[') {
			return "", errors.New("props must be flat")
		}
	}
	b, err := json.Marshal(d)
	if err != nil {
		return "", errors.New("bad props")
	}
	return string(b), nil
}

func (h *handler) event(r *http.Request, p *payload, domain, props string) store.Event {
	host, path, utm := enrich.ParseURL(p.U)
	device, browser, os, bot := enrich.ParseUA(r.UserAgent())
	// The client IP is used only for this lookup and never stored.
	country, region, city := h.geo.Lookup(h.ips.ClientIP(r))
	if p.M == "p" {
		// Private and consent-denied visitors: country only.
		region, city = "", ""
	}
	route := p.RT
	if route == "" && path != "" {
		route = enrich.DeriveRoute(path)
	}
	return store.Event{
		SiteID: p.S, Type: p.T, AnonID: p.A, SessionID: p.SS, UserID: p.UID,
		Host: host, Path: path, Route: route,
		UTMSource: utm[0], UTMMedium: utm[1], UTMCampaign: utm[2], UTMTerm: utm[3], UTMContent: utm[4],
		RefHost: enrich.RefHost(p.R, host), RefURL: p.R,
		Name: p.N, Props: props,
		Country: country, Region: region, City: city,
		Device: device, Browser: browser, OS: os,
		Env:       enrich.DeriveEnv(host, domain, p.Env),
		TS:        h.now().UnixMilli(),
		EngagedMs: clamp(p.E, maxEngMs),
		ScrollPct: clamp(p.SC, 100),
		IsBot:     bot || p.W == 1,
		Retry:     clamp(p.RC, maxRetry),
	}
}

func clamp(v float64, hi int) int {
	switch {
	case v < 0 || v != v: // negative or NaN
		return 0
	case v > float64(hi):
		return hi
	}
	return int(v)
}

// TrackerHandler serves the tracker script with a one-hour public cache. The
// gzip copy (BestCompression) and the ETag are computed once, here, so a
// request costs no compression; gzip goes to clients that accept it.
func TrackerHandler(js []byte) http.Handler {
	var gz bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&gz, gzip.BestCompression)
	_, _ = zw.Write(js)
	_ = zw.Close()
	sum := sha256.Sum256(js)
	etag := `"` + hex.EncodeToString(sum[:8]) + `"`
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h := w.Header()
		h.Set("Content-Type", "application/javascript; charset=utf-8")
		h.Set("Cache-Control", "public, max-age=3600")
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Vary", "Accept-Encoding")
		h.Set("ETag", etag) // ponytail: one ETag for both encodings, as the raw bytes decide it
		if inm := r.Header.Get("If-None-Match"); inm == "*" || strings.Contains(inm, etag) {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		body := js
		if acceptsGzip(r.Header.Get("Accept-Encoding")) {
			h.Set("Content-Encoding", "gzip")
			body = gz.Bytes()
		}
		h.Set("Content-Length", strconv.Itoa(len(body)))
		if r.Method == http.MethodGet {
			_, _ = w.Write(body)
		}
	})
}

// acceptsGzip reports whether an Accept-Encoding header lists gzip without q=0.
func acceptsGzip(ae string) bool {
	for _, part := range strings.Split(ae, ",") {
		name, params, _ := strings.Cut(part, ";")
		if strings.EqualFold(strings.TrimSpace(name), "gzip") {
			q, err := strconv.ParseFloat(strings.TrimPrefix(strings.TrimSpace(params), "q="), 64)
			return err != nil || q > 0 // no (or a malformed) q means q=1
		}
	}
	return false
}

// TrackerFiles serves GET /_t/{t.js,t.p.js,t.x.js} with a one-hour public
// cache, and 404 for any other path.
func TrackerFiles() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h, ok := trackerHandlers[strings.TrimPrefix(r.URL.Path, "/_t/")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		h.ServeHTTP(w, r)
	})
}
