// Command agentprobe is the AI-agent signature spike (plan task D-0). It
// serves two origins: A (a page that sends the tracker's request shapes) and B
// (a cross-origin beacon target), and logs, per request, whether it carried
// Web Bot Auth signature headers and whether they verify against the live,
// allowlisted key directories. It never logs signature bytes or client IPs.
//
//	go run ./scripts/agentprobe -b-url https://<B tunnel host>
package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"trail/internal/agents"
)

//go:embed page.html
var pageHTML string

var page = template.Must(template.New("page").Parse(pageHTML))

// entry is one logged request.
type entry struct {
	TS             string `json:"ts"`
	Origin         string `json:"origin"` // A or B
	Method         string `json:"method"`
	Path           string `json:"path"`
	Authority      string `json:"authority"`
	UA             string `json:"ua"`
	BodyUA         string `json:"bodyUA,omitempty"` // navigator.userAgent as the page saw it
	Webdriver      *bool  `json:"webdriver,omitempty"`
	Kind           string `json:"kind,omitempty"`
	Round          int    `json:"round,omitempty"`
	HasSig         bool   `json:"hasSig"`
	HasSigInput    bool   `json:"hasSigInput"`
	SigAgent       string `json:"sigAgent,omitempty"`
	SigInputParams string `json:"sigInputParams,omitempty"` // covered components and parameters, no signature bytes
	XFFPresent     bool   `json:"xffPresent"`
	Verified       string `json:"verified,omitempty"` // agent id when the signature verifies
	VerifyErr      string `json:"verifyErr,omitempty"`
}

type probe struct {
	mu  sync.Mutex
	out io.Writer
	dir *agents.Directory
}

func (p *probe) record(origin string, r *http.Request, body []byte) {
	e := entry{
		TS:          time.Now().UTC().Format(time.RFC3339),
		Origin:      origin,
		Method:      r.Method,
		Path:        r.URL.Path,
		Authority:   r.Host,
		UA:          cap512(r.UserAgent()),
		HasSig:      r.Header.Get("Signature") != "",
		HasSigInput: r.Header.Get("Signature-Input") != "",
		SigAgent:    cap512(r.Header.Get("Signature-Agent")),
		XFFPresent:  r.Header.Get("X-Forwarded-For") != "",
	}
	e.SigInputParams = cap512(r.Header.Get("Signature-Input"))
	var b struct {
		Kind      string `json:"kind"`
		Round     int    `json:"round"`
		UA        string `json:"ua"`
		Webdriver *bool  `json:"webdriver"`
	}
	if json.Unmarshal(body, &b) == nil {
		e.Kind, e.Round, e.BodyUA, e.Webdriver = b.Kind, b.Round, cap512(b.UA), b.Webdriver
	}
	if e.HasSig && p.dir != nil {
		s := agents.Signed{
			Authority:      r.Host,
			SignatureAgent: r.Header.Get("Signature-Agent"),
			SignatureInput: r.Header.Get("Signature-Input"),
			Signature:      r.Header.Get("Signature"),
		}
		a, err := agents.Verify(s, r.Host, p.dir, time.Now())
		if errors.Is(err, agents.ErrUnknownKey) { // keys still loading: wait once
			time.Sleep(3 * time.Second)
			a, err = agents.Verify(s, r.Host, p.dir, time.Now())
		}
		if err != nil {
			e.VerifyErr = err.Error()
		} else {
			e.Verified = a.ID
		}
	}
	line, _ := json.Marshal(e)
	p.mu.Lock()
	defer p.mu.Unlock()
	_, _ = p.out.Write(append(line, '\n'))
	fmt.Fprintf(os.Stderr, "%s %s %-8s sig=%v agent=%q verified=%q %s\n", origin, r.Method, r.URL.Path, e.HasSig, e.SigAgent, e.Verified, e.VerifyErr)
}

func cap512(s string) string {
	if len(s) > 512 {
		return s[:512]
	}
	return s
}

func readBody(r *http.Request) []byte {
	b, _ := io.ReadAll(io.LimitReader(r.Body, 4<<10))
	return b
}

func main() {
	addrA := flag.String("a", "127.0.0.1:8331", "listen address of origin A (the page)")
	addrB := flag.String("b", "127.0.0.1:8332", "listen address of origin B (cross-origin target)")
	bURL := flag.String("b-url", "", "public https URL of origin B (its tunnel)")
	logPath := flag.String("log", ".probe/log.ndjson", "NDJSON log file (appended)")
	verify := flag.Bool("verify", true, "verify signatures against the live chatgpt.com and agent.bot.goog key directories")
	flag.Parse()
	if *bURL == "" {
		*bURL = "http://" + *addrB
	}
	if u, err := url.Parse(*bURL); err != nil || u.Host == "" {
		log.Fatalf("-b-url: want https://host")
	}
	if err := os.MkdirAll(filepath.Dir(*logPath), 0o755); err != nil {
		log.Fatal(err)
	}
	f, err := os.OpenFile(*logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	p := &probe{out: f}
	if *verify {
		p.dir = agents.NewDirectory(agents.DirOptions{URLs: map[string]string{
			"openai-keys": "https://chatgpt.com/.well-known/http-message-signatures-directory",
			"google-keys": "https://agent.bot.goog/.well-known/http-message-signatures-directory",
		}})
		p.dir.Start(ctx)
	}

	b := http.NewServeMux()
	b.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "POST")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		p.record("B", r, readBody(r))
		w.WriteHeader(http.StatusNoContent)
	})

	target, _ := url.Parse("http://" + *addrB)
	rp := httputil.NewSingleHostReverseProxy(target)
	rewrite := rp.Director
	rp.Director = func(r *http.Request) {
		rewrite(r)
		r.URL.Path = "/rewrite"
	}
	a := http.NewServeMux()
	a.HandleFunc("/_t/e", func(w http.ResponseWriter, r *http.Request) {
		body := readBody(r)
		p.record("A", r, body)
		r.Body = io.NopCloser(strings.NewReader(string(body)))
		r.ContentLength = int64(len(body))
		rp.ServeHTTP(w, r)
	})
	a.HandleFunc("/same", func(w http.ResponseWriter, r *http.Request) {
		p.record("A", r, readBody(r))
		w.WriteHeader(http.StatusNoContent)
	})
	a.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })
	a.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		p.record("A", r, nil) // the navigation
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_ = page.Execute(w, struct{ B string }{strings.TrimRight(*bURL, "/")})
	})

	servers := []*http.Server{
		{Addr: *addrA, Handler: a, ReadHeaderTimeout: 10 * time.Second},
		{Addr: *addrB, Handler: b, ReadHeaderTimeout: 10 * time.Second},
	}
	for _, s := range servers {
		go func() {
			if err := s.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				log.Fatal(err)
			}
		}()
	}
	fmt.Fprintf(os.Stderr, "agentprobe: A on %s, B on %s (page posts to %s), log %s\n", *addrA, *addrB, *bURL, *logPath)
	<-ctx.Done()
	for _, s := range servers {
		sctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = s.Shutdown(sctx)
		cancel()
	}
}
