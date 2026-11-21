package agents

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Fetch limits. Every list and key URL is a fixed constant (never a value from
// a request), https only, with a capped body and same-host redirects.
const (
	fetchTimeout   = 10 * time.Second
	maxListBody    = 2 << 20
	maxRedirects   = 3
	defaultRefresh = 24 * time.Hour
	retryAfterFail = 15 * time.Minute
	keyKickEvery   = 10 * time.Minute
)

// List formats.
const (
	fmtPrefixJSON = "json"
	fmtSAIL       = "sail"
	fmtJWKS       = "jwks"
)

type listSpec struct {
	name, url, format string
	origin            string // Signature-Agent origin, for key directories
}

// defaultLists is §0.11 of the plan. Perplexity redirects www.perplexity.com
// to www.perplexity.ai (another host), so the .ai URLs are used directly.
var defaultLists = []listSpec{
	{name: "anthropic-sail", url: "https://claude.com/.well-known/sail", format: fmtSAIL},
	{name: "google-agents", url: "https://developers.google.com/static/crawling/ipranges/user-triggered-agents.json", format: fmtPrefixJSON},
	{name: "openai-gptbot", url: "https://openai.com/gptbot.json", format: fmtPrefixJSON},
	{name: "openai-searchbot", url: "https://openai.com/searchbot.json", format: fmtPrefixJSON},
	{name: "openai-chatgpt-user", url: "https://openai.com/chatgpt-user.json", format: fmtPrefixJSON},
	{name: "openai-adsbot", url: "https://openai.com/adsbot.json", format: fmtPrefixJSON},
	{name: "perplexity-bot", url: "https://www.perplexity.ai/perplexitybot.json", format: fmtPrefixJSON},
	{name: "perplexity-user", url: "https://www.perplexity.ai/perplexity-user.json", format: fmtPrefixJSON},
	{
		name: "openai-keys", format: fmtJWKS, origin: "https://chatgpt.com",
		url: "https://chatgpt.com/.well-known/http-message-signatures-directory",
	},
	{
		name: "google-keys", format: fmtJWKS, origin: "https://agent.bot.goog",
		url: "https://agent.bot.goog/.well-known/http-message-signatures-directory",
	},
}

// crawlerLists maps a crawler catalogue name to the list that verifies it.
var crawlerLists = map[string]string{
	"GPTBot":          "openai-gptbot",
	"OAI-SearchBot":   "openai-searchbot",
	"ChatGPT-User":    "openai-chatgpt-user",
	"OAI-AdsBot":      "openai-adsbot",
	"PerplexityBot":   "perplexity-bot",
	"Perplexity-User": "perplexity-user",
}

// DirOptions configures a Directory.
type DirOptions struct {
	Client *http.Client     // nil = a client with a 10 s timeout
	Now    func() time.Time // nil = time.Now
	// URLs replaces the built-in list table: list or key name → URL. Names
	// ending in "-keys" are key directories, "anthropic-sail" is SAIL, the
	// rest are prefix JSON. Tests point these at httptest servers.
	URLs     map[string]string
	Disabled bool          // never fetch (TRAIL_AGENT_LISTS=off): UA-only detection
	Refresh  time.Duration // default 24 h, ±1/24 jitter
}

// listState is one good copy of a list, swapped in whole.
type listState struct {
	sets      map[string]PrefixSet // SAIL: per service; prefix JSON: ""
	keys      []jwk
	fetchedAt int64
	entries   int
}

type list struct {
	spec listSpec
	good atomic.Pointer[listState]
	kick chan struct{} // an on-demand refresh (unknown keyid)
}

// Directory holds the published agent and crawler IP lists and the Web Bot
// Auth key directories in memory. Reads never block on the network.
type Directory struct {
	o       DirOptions
	client  *http.Client
	lists   []*list
	byName  map[string]*list
	started atomic.Bool

	kickMu   sync.Mutex
	lastKick map[string]time.Time
}

// NewDirectory returns a Directory. Nothing is fetched until Start.
func NewDirectory(o DirOptions) *Directory {
	if o.Now == nil {
		o.Now = time.Now
	}
	if o.Refresh <= 0 {
		o.Refresh = defaultRefresh
	}
	base := o.Client
	if base == nil {
		base = &http.Client{}
	}
	c := *base
	if c.Timeout == 0 {
		c.Timeout = fetchTimeout
	}
	c.CheckRedirect = sameHostRedirect
	d := &Directory{o: o, client: &c, byName: map[string]*list{}, lastKick: map[string]time.Time{}}
	specs := defaultLists
	if o.URLs != nil {
		specs = specsFor(o.URLs)
	}
	for _, s := range specs {
		l := &list{spec: s, kick: make(chan struct{}, 1)}
		d.lists = append(d.lists, l)
		d.byName[s.name] = l
	}
	return d
}

// specsFor builds list specs from a name → URL map, keeping the default order.
func specsFor(urls map[string]string) []listSpec {
	out := []listSpec{}
	seen := map[string]bool{}
	for _, s := range defaultLists {
		if u, ok := urls[s.name]; ok {
			s.url = u
			out = append(out, s)
			seen[s.name] = true
		}
	}
	for name, u := range urls {
		if seen[name] {
			continue
		}
		s := listSpec{name: name, url: u, format: fmtPrefixJSON}
		switch {
		case strings.HasSuffix(name, "-keys"):
			s.format = fmtJWKS
		case strings.HasSuffix(name, "-sail"):
			s.format = fmtSAIL
		}
		out = append(out, s)
	}
	return out
}

func sameHostRedirect(req *http.Request, via []*http.Request) error {
	if len(via) > maxRedirects {
		return errors.New("too many redirects")
	}
	if req.URL.Scheme != "https" || req.URL.Host != via[0].URL.Host {
		return errors.New("redirect to another host or scheme refused")
	}
	return nil
}

// Start fetches every list in the background: at once, then every Refresh
// (±1/24 jitter), retrying 15 minutes after a failure. It returns at once and
// does nothing when the directory is disabled. Cancel ctx to stop.
func (d *Directory) Start(ctx context.Context) {
	if d.o.Disabled || !d.started.CompareAndSwap(false, true) {
		return
	}
	for _, l := range d.lists {
		go d.loop(ctx, l)
	}
}

func (d *Directory) loop(ctx context.Context, l *list) {
	for {
		wait := d.o.Refresh
		if jitter := int64(d.o.Refresh / 24); jitter > 0 {
			wait += time.Duration(rand.Int64N(2*jitter+1) - jitter)
		}
		if err := d.refresh(ctx, l); err != nil {
			wait = min(retryAfterFail, d.o.Refresh)
		}
		t := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			t.Stop()
			return
		case <-t.C:
		case <-l.kick:
			t.Stop()
		}
	}
}

// refresh fetches one list and swaps it in. On any error the last good copy stays.
func (d *Directory) refresh(ctx context.Context, l *list) error {
	if d.o.Disabled {
		return errors.New("agent lists are disabled")
	}
	u, err := url.Parse(l.spec.url)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return fmt.Errorf("list %s: https URL required", l.spec.name)
	}
	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return fmt.Errorf("list %s: %w", l.spec.name, err)
	}
	req.Header.Set("User-Agent", "Trail (self-hosted analytics; agent list refresh)")
	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("list %s: %w", l.spec.name, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("list %s: %s", l.spec.name, resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxListBody+1))
	if err != nil {
		return fmt.Errorf("list %s: %w", l.spec.name, err)
	}
	if len(body) > maxListBody {
		return fmt.Errorf("list %s: body over 2 MiB", l.spec.name)
	}
	st, err := parseList(l.spec, body)
	if err != nil {
		return fmt.Errorf("list %s: %w", l.spec.name, err)
	}
	st.fetchedAt = d.o.Now().UnixMilli()
	l.good.Store(st)
	return nil
}

func parseList(s listSpec, body []byte) (*listState, error) {
	switch s.format {
	case fmtSAIL:
		sets, err := ParseSAIL(bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		n := 0
		for _, set := range sets {
			n += set.Len()
		}
		return &listState{sets: sets, entries: n}, nil
	case fmtJWKS:
		keys, err := parseJWKS(body)
		if err != nil {
			return nil, err
		}
		return &listState{keys: keys, entries: len(keys)}, nil
	default:
		set, err := ParsePrefixJSON(bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		return &listState{sets: map[string]PrefixSet{"": set}, entries: set.Len()}, nil
	}
}

// Status reports every list for the setup card, in table order.
func (d *Directory) Status() []ListStatus {
	out := make([]ListStatus, 0, len(d.lists))
	for _, l := range d.lists {
		s := ListStatus{Name: l.spec.name, Kind: "ip"}
		if l.spec.format == fmtJWKS {
			s.Kind = "keys"
		}
		if st := l.good.Load(); st != nil && !d.o.Disabled {
			s.FetchedAt, s.Entries, s.OK = st.fetchedAt, st.entries, true
		}
		out = append(out, s)
	}
	return out
}

// InList reports whether ip is in any prefix of the named list.
func (d *Directory) InList(name, ip string) bool {
	return d.inSet(name, "", true, ip)
}

// inSet checks one service of a list (any service when all is set).
func (d *Directory) inSet(name, service string, all bool, ip string) bool {
	l := d.byName[name]
	if l == nil {
		return false
	}
	st := l.good.Load()
	if st == nil {
		return false
	}
	a, err := netip.ParseAddr(ip)
	if err != nil {
		return false
	}
	for k, set := range st.sets {
		if (all || strings.EqualFold(k, service)) && set.Contains(a) {
			return true
		}
	}
	return false
}

// inAgentList checks the agent's own list: for a SAIL list, only the service
// named by the agent's first UA token (Claude-Agent, not ClaudeBot).
func (d *Directory) inAgentList(a Agent, ip string) bool {
	if a.IPList == "" {
		return false
	}
	l := d.byName[a.IPList]
	if l != nil && l.spec.format == fmtSAIL && len(a.UATokens) > 0 {
		return d.inSet(a.IPList, a.UATokens[0], false, ip)
	}
	return d.InList(a.IPList, ip)
}

// VerifyCrawler reports whether ip is in the published list of crawler bot
// (a crawler catalogue name). It is false when the bot publishes no list.
// A SAIL service with the bot's name (for example ClaudeBot) also counts.
func (d *Directory) VerifyCrawler(bot, ip string) bool {
	if name, ok := crawlerLists[bot]; ok {
		return d.InList(name, ip)
	}
	for _, l := range d.lists {
		if l.spec.format == fmtSAIL && d.inSet(l.spec.name, bot, false, ip) {
			return true
		}
	}
	return false
}
