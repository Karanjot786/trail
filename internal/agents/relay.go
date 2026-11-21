package agents

import (
	lru "container/list"
	"crypto/sha256"
	"sync"
	"time"
)

const (
	relayTTL = 30 * time.Minute
	relayMax = 10_000
)

// relayCache remembers, for 30 minutes, that a verified signed request for
// site+IP+UA came through the server hook. It keeps only sha256(site|ip|ua)
// and the agent id, never the IP, and evicts the oldest entry when full.
type relayCache struct {
	now   func() time.Time
	max   int
	mu    sync.Mutex
	items map[[32]byte]*lru.Element
	order *lru.List // front = oldest
}

type relayEntry struct {
	key [32]byte
	id  string
	exp time.Time
}

func newRelayCache(now func() time.Time) *relayCache {
	return &relayCache{now: now, max: relayMax, items: map[[32]byte]*lru.Element{}, order: lru.New()}
}

func relayKey(site, ip, ua string) [32]byte {
	return sha256.Sum256([]byte(site + "|" + ip + "|" + ua))
}

func (c *relayCache) put(site, ip, ua, id string) {
	k := relayKey(site, ip, ua)
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[k]; ok {
		c.order.Remove(el)
		delete(c.items, k)
	}
	for c.order.Len() >= c.max {
		oldest := c.order.Front()
		delete(c.items, oldest.Value.(*relayEntry).key)
		c.order.Remove(oldest)
	}
	c.items[k] = c.order.PushBack(&relayEntry{key: k, id: id, exp: c.now().Add(relayTTL)})
}

func (c *relayCache) get(site, ip, ua string) (string, bool) {
	k := relayKey(site, ip, ua)
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.items[k]
	if !ok {
		return "", false
	}
	e := el.Value.(*relayEntry)
	if !c.now().Before(e.exp) {
		c.order.Remove(el)
		delete(c.items, k)
		return "", false
	}
	return e.id, true
}

func (c *relayCache) len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.order.Len()
}

// RelaySigned verifies a signed request that the server hook saw (a crawl
// line with signature fields). s.Authority must be one of the site's hosts
// (hostOK). On success it remembers sha256(site|ip|ua) → agent for 30
// minutes, so the beacons that browser sends next are classified "relay".
func (d *Directory) RelaySigned(site, ip, ua string, s Signed, hostOK func(string) bool) Result {
	if hostOK == nil || site == "" || ip == "" || ua == "" || !hostOK(s.Authority) {
		return Result{}
	}
	a, err := Verify(s, s.Authority, d, d.o.Now())
	if err != nil {
		return Result{}
	}
	d.relay.put(site, ip, ua, a.ID)
	return Result{ID: a.ID, Via: ViaSig}
}
