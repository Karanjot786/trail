package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"trail/internal/crawlers"
	"trail/internal/sites"
	"trail/internal/store"
)

// Remote batches stay under the endpoint's 1 MiB and 10,000-line limits.
const (
	remoteBatchBytes = 900 << 10
	remoteBatchLines = 5000
)

// runCrawlers runs `trail crawlers import`: it reads an access log, keeps the
// AI crawler requests and stores them in TRAIL_DB, or ships them to a remote
// Trail with --url and --token.
func runCrawlers(args []string, stdin io.Reader, out io.Writer) error {
	if len(args) == 0 || args[0] != "import" {
		return errors.New("usage: trail crawlers import --site ID [--format combined|caddy] [--since auto|RFC3339] [--url URL --token T] FILE|-")
	}
	fs := flag.NewFlagSet("crawlers import", flag.ContinueOnError)
	site := fs.String("site", "", "site id")
	format := fs.String("format", "combined", "log format: combined (nginx/Apache) or caddy (JSON)")
	sinceFlag := fs.String("since", "auto", "skip records at or before this time: auto (newest stored record) or RFC 3339")
	remote := fs.String("url", "", "base URL of a remote Trail (ships over HTTPS instead of writing TRAIL_DB)")
	token := fs.String("token", "", "crawl-scoped API token for --url (or TRAIL_TOKEN)")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if *site == "" || fs.NArg() != 1 {
		return errors.New("crawlers import: need --site and one FILE (or - for stdin)")
	}
	in := stdin
	if name := fs.Arg(0); name != "-" {
		f, err := os.Open(name)
		if err != nil {
			return fmt.Errorf("crawlers import: %w", err)
		}
		defer f.Close()
		in = f
	}

	var since int64
	if *sinceFlag != "auto" {
		t, err := time.Parse(time.RFC3339, *sinceFlag)
		if err != nil {
			return fmt.Errorf("--since: want auto or RFC 3339: %w", err)
		}
		since = t.UnixMilli()
	}

	var emit func([]crawlers.Record) error
	var finish func() error
	if *remote != "" {
		if *sinceFlag == "auto" {
			return errors.New("--since auto reads the local database; with --url pass --since RFC3339")
		}
		tok := *token
		if tok == "" {
			tok = os.Getenv("TRAIL_TOKEN")
		}
		if tok == "" {
			return errors.New("--url needs --token (or TRAIL_TOKEN)")
		}
		sh, err := newShipper(*remote, *site, tok)
		if err != nil {
			return err
		}
		emit, finish = sh.add, sh.flush
	} else {
		st, err := store.Open(env("TRAIL_DB", "trail.db"))
		if err != nil {
			return err
		}
		defer st.Close()
		reg, err := sites.Open(st.DB())
		if err != nil {
			return err
		}
		if _, ok := reg.Get(*site); !ok {
			return fmt.Errorf("unknown site %q", *site)
		}
		if *sinceFlag == "auto" {
			if since, err = crawlers.LastTS(st.DB(), *site); err != nil {
				return err
			}
		}
		emit = func(recs []crawlers.Record) error {
			_, err := crawlers.Ingest(st.DB(), *site, recs)
			return err
		}
		finish = func() error { return nil }
	}
	lines, kept, err := crawlers.Scan(in, *format, since, 1000, emit)
	if err == nil {
		err = finish()
	}
	if err != nil {
		return err
	}
	fmt.Fprintf(out, "read %d lines, kept %d AI crawler requests for %s\n", lines, kept, *site)
	return nil
}

// shipper posts records to a remote /api/v1/crawls as NDJSON batches.
type shipper struct {
	endpoint, token string
	client          *http.Client
	buf             bytes.Buffer
	lines           int
}

func newShipper(base, site, token string) (*shipper, error) {
	u, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return nil, fmt.Errorf("--url: want https://host")
	}
	q := url.Values{"site": {site}}
	return &shipper{
		endpoint: u.String() + "/api/v1/crawls?" + q.Encode(),
		token:    token,
		client:   &http.Client{Timeout: 30 * time.Second},
	}, nil
}

func (s *shipper) add(recs []crawlers.Record) error {
	for _, r := range recs {
		b, err := json.Marshal(r)
		if err != nil {
			return err
		}
		if s.buf.Len()+len(b)+1 > remoteBatchBytes || s.lines == remoteBatchLines {
			if err := s.flush(); err != nil {
				return err
			}
		}
		s.buf.Write(b)
		s.buf.WriteByte('\n')
		s.lines++
	}
	return nil
}

func (s *shipper) flush() error {
	if s.lines == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(s.buf.Bytes()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-ndjson")
	req.Header.Set("Authorization", "Bearer "+s.token)
	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("ship crawls: %w", err)
	}
	defer resp.Body.Close()
	msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	if resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("ship crawls: %s: %s", resp.Status, strings.TrimSpace(string(msg)))
	}
	s.buf.Reset()
	s.lines = 0
	return nil
}
