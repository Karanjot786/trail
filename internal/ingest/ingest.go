// Package ingest accepts tracker events (POST /_t/e) and serves the tracker script.
package ingest

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"trail/internal/enrich"
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

func mustRead(name string) []byte {
	b, err := Files.ReadFile(name)
	if err != nil {
		panic(err)
	}
	return b
}

const (
	maxBody  = 32 << 10
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
}

type handler struct {
	st    *store.Store
	geo   *enrich.Geo
	sites map[string]string
	now   func() time.Time
}

// Option configures the ingest handler.
type Option func(*handler)

// New returns the ingest handler for POST /_t/e (and its CORS preflight).
// sites maps site id to its production domain.
func New(st *store.Store, geo *enrich.Geo, sites map[string]string, opts ...Option) http.Handler {
	h := &handler{st: st, geo: geo, sites: sites, now: time.Now}
	for _, o := range opts {
		o(h)
	}
	return h
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
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
	// Validate the whole batch before enqueuing anything.
	evs := make([]store.Event, 0, len(ps))
	for i := range ps {
		p := &ps[i]
		if p.S != ps[0].S {
			http.Error(w, "mixed sites in batch", http.StatusBadRequest)
			return
		}
		domain, ok := h.sites[p.S]
		if msg := validate(p, ok); msg != "" {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
		props, err := flatProps(p.D)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		evs = append(evs, h.event(r, p, domain, props))
	}

	for _, e := range evs {
		h.st.Enqueue(e)
	}
	http.SetCookie(w, &http.Cookie{
		Name: "_t_id", Value: ps[0].A, Path: "/", MaxAge: 31536000, SameSite: http.SameSiteLaxMode,
	})
	w.Header().Set("X-Trail-Accepted", strconv.Itoa(len(evs)))
	w.WriteHeader(http.StatusNoContent)
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
	country, region, city := h.geo.Lookup(enrich.ClientIP(r))
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

// TrackerHandler serves the tracker script with a one-hour public cache.
func TrackerHandler(js []byte) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		_, _ = w.Write(js)
	})
}

// TrackerFiles serves GET /_t/{t.js,t.p.js,t.x.js} with a one-hour public
// cache, and 404 for any other path.
func TrackerFiles() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		js, ok := trackerFiles[strings.TrimPrefix(r.URL.Path, "/_t/")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		TrackerHandler(js).ServeHTTP(w, r)
	})
}
