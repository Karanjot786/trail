package query

import "encoding/json"

// Dashboard v3 JSON contract (plan §0.6). Every type mirrors web/src/api/types.ts field for field.
// Optional TS fields (`?`) are omitempty, nullable TS fields are pointers, and lists are never nil.
// Frozen after P0: change only with a contract-change commit, then regenerate the golden TS
// (go test ./internal/query -run Golden -update).
//
// Go type names that would collide with their query function get a Result suffix (as StatsResult does):
// ChangesResult, HeatmapResult, LiveResult, EventDetailResult, GoalDetailResult, FunnelReportResult,
// RevenueResult, CrawlersResult.

// Basis names the period a delta is compared against.
type Basis struct {
	Text   string `json:"text"`
	Short  string `json:"short"`
	Why    string `json:"why"`
	Dates  string `json:"dates"`
	Custom bool   `json:"custom"`
	None   bool   `json:"none"`
}

// Window is a resolved range and its comparison period, in the viewer's time zone.
type Window struct {
	Key        string `json:"key"`
	Label      string `json:"label"`
	From       int64  `json:"from"`
	To         int64  `json:"to"`
	PrevFrom   *int64 `json:"prevFrom"`
	PrevTo     *int64 `json:"prevTo"`
	Bucket     string `json:"bucket"` // hour | day
	TZ         string `json:"tz"`
	Elapsed    bool   `json:"elapsed"`
	LastBucket int    `json:"lastBucket"`
	Clamped    bool   `json:"clamped"`
	Invalid    string `json:"invalid"`
	Basis      Basis  `json:"basis"`
}

// Features says which optional screens a site has data for.
type Features struct {
	Revenue  bool   `json:"revenue"`
	Crawlers bool   `json:"crawlers"`
	Currency string `json:"currency"`
}

// Site is one /api/sites entry.
type Site struct {
	ID          string   `json:"id"`
	Domain      string   `json:"domain"`
	Origins     []string `json:"origins"`
	Created     int64    `json:"created"`
	LastEventAt *int64   `json:"lastEventAt"`
	Events24h   int      `json:"events24h"`
	Features    Features `json:"features"`
}

// SiteStatus is the /api/sites/{id}/status payload.
type SiteStatus struct {
	LastEventAt *int64     `json:"lastEventAt"`
	Events24h   int        `json:"events24h"`
	Rejected24h int        `json:"rejected24h"`
	Geo         *GeoStatus `json:"geo"` // dominant location source over the last 24 h; nil when there are no events
}

// GeoStatus is the location source that answered most events in the last 24 h, with its share (0–1).
type GeoStatus struct {
	Source string  `json:"source"` // db | vercel | cloudflare | netlify
	Share  float64 `json:"share"`
}

// SiteSummary is one row of the All websites screen.
type SiteSummary struct {
	ID           string     `json:"id"`
	Domain       string     `json:"domain"`
	Visitors     int        `json:"visitors"`
	PrevVisitors *int       `json:"prevVisitors"`
	Online       int        `json:"online"`
	Spark        []*float64 `json:"spark"`
}

// Totals is one period's headline numbers. Bounce and ConvRate are 0–1 fractions; money is in minor units.
type Totals struct {
	Visitors     int     `json:"visitors"`
	Pageviews    int     `json:"pageviews"`
	Sessions     int     `json:"sessions"`
	DurationMs   int64   `json:"durationMs"`
	Bounce       float64 `json:"bounce"`
	Conversions  int     `json:"conversions"`
	ConvVisitors int     `json:"convVisitors"`
	ConvRate     float64 `json:"convRate"`
	BaseVisitors int     `json:"baseVisitors"`
	RevenueMinor int64   `json:"revenueMinor"`
	Purchases    int     `json:"purchases"`
	EventPeople  int     `json:"eventPeople"` // people who sent at least one custom or outbound event
}

// ConvRef names the goal behind the conversion columns.
type ConvRef struct {
	GoalID int64  `json:"goalId"`
	Name   string `json:"name"`
}

// StatsResult is the /api/stats payload.
type StatsResult struct {
	Totals
	Window      Window   `json:"window"`
	Prev        *Totals  `json:"prev"`
	Online      int      `json:"online"`
	BotRequests *int     `json:"botRequests"` // nil when crawler ingest is not set up
	Conv        *ConvRef `json:"conv"`
	// AgentSessions counts AI agent sessions in the window, whatever the actor parameter says.
	AgentSessions int `json:"agentSessions"`
}

// Point is one series bucket: start time (unix ms) and value; V is nil for buckets that have not happened yet.
type Point struct {
	T int64    `json:"t"`
	V *float64 `json:"v"`
}

// TopSource is one source inside a chart bucket.
type TopSource struct {
	Key      string `json:"key"`
	Visitors int    `json:"visitors"`
}

// BucketExtra carries the chart card's per-bucket detail.
type BucketExtra struct {
	T            int64       `json:"t"`
	TopSources   []TopSource `json:"topSources"`
	Conversions  int         `json:"conversions"`
	RevenueMinor int64       `json:"revenueMinor"`
}

// SeriesResult is the /api/series payload.
type SeriesResult struct {
	Window Window        `json:"window"`
	Metric string        `json:"metric"`
	Bucket string        `json:"bucket"`
	Points []Point       `json:"points"`
	Prev   []Point       `json:"prev"`
	Extras []BucketExtra `json:"extras,omitempty"`
}

// Row is one breakdown row. Total is filled only for dim=event. Optional columns are set per dim.
type Row struct {
	Key          string   `json:"key"`
	Visitors     int      `json:"visitors"`
	Pageviews    int      `json:"pageviews"`
	Total        int      `json:"total"`
	Sessions     *int     `json:"sessions,omitempty"`
	Bounce       *float64 `json:"bounce,omitempty"`
	ConvRate     *float64 `json:"convRate,omitempty"`
	RevenueMinor *int64   `json:"revenueMinor,omitempty"`
	Entries      *int     `json:"entries,omitempty"`
	Exits        *int     `json:"exits,omitempty"`
	Views        *int     `json:"views,omitempty"`
	ExitRate     *float64 `json:"exitRate,omitempty"`
	Country      string   `json:"country,omitempty"`
	Region       string   `json:"region,omitempty"`
	Top          string   `json:"top,omitempty"`
}

// ChangeItem is one What changed item. Kind is day | source | rate; MarshalJSON emits only that kind's fields.
type ChangeItem struct {
	Kind   string  `json:"kind"`
	Day    string  `json:"day,omitempty"` // ISO YYYY-MM-DD in the site zone; the UI builds the label
	Key    string  `json:"key,omitempty"`
	Metric string  `json:"metric,omitempty"` // bounce | conversion
	Cur    float64 `json:"cur"`
	Prev   float64 `json:"prev"`
	Added  float64 `json:"added,omitempty"`
	N      int     `json:"n,omitempty"`
	Source *string `json:"source,omitempty"`
	Basis  string  `json:"basis"`
}

// MarshalJSON writes the TS union member for c.Kind, so every member's required keys are present.
func (c ChangeItem) MarshalJSON() ([]byte, error) {
	switch c.Kind {
	case "day":
		return json.Marshal(struct {
			Kind   string  `json:"kind"`
			Day    string  `json:"day"`
			Cur    float64 `json:"cur"`
			Prev   float64 `json:"prev"`
			Added  float64 `json:"added"`
			Source *string `json:"source"`
			Basis  string  `json:"basis"`
		}{c.Kind, c.Day, c.Cur, c.Prev, c.Added, c.Source, c.Basis})
	case "source":
		return json.Marshal(struct {
			Kind  string  `json:"kind"`
			Key   string  `json:"key"`
			Cur   float64 `json:"cur"`
			Prev  float64 `json:"prev"`
			Basis string  `json:"basis"`
		}{c.Kind, c.Key, c.Cur, c.Prev, c.Basis})
	case "rate":
		return json.Marshal(struct {
			Kind   string  `json:"kind"`
			Metric string  `json:"metric"`
			Cur    float64 `json:"cur"`
			Prev   float64 `json:"prev"`
			N      int     `json:"n"`
			Basis  string  `json:"basis"`
		}{c.Kind, c.Metric, c.Cur, c.Prev, c.N, c.Basis})
	}
	type plain ChangeItem
	return json.Marshal(plain(c))
}

// ChangesResult is the /api/changes payload (TS Changes).
type ChangesResult struct {
	Items []ChangeItem `json:"items"`
}

// HeatPeak is the busiest heatmap cell.
type HeatPeak struct {
	Dow   int `json:"dow"`
	Hour  int `json:"hour"`
	Value int `json:"value"`
}

// HeatBusiest is the plain-language busiest window.
type HeatBusiest struct {
	Label    string `json:"label"`
	FromHour int    `json:"fromHour"`
	ToHour   int    `json:"toHour"`
	Dows     []int  `json:"dows"`
}

// HeatmapResult is the /api/heatmap payload (TS Heatmap). Cells is [7 dow, Mon=0][24 hour].
type HeatmapResult struct {
	From      int64        `json:"from"`
	To        int64        `json:"to"`
	Weeks     int          `json:"weeks"` // always 4
	Cells     [][]int      `json:"cells"`
	Max       int          `json:"max"`
	Total     int          `json:"total"`
	Status    string       `json:"status"`    // ok | sparse
	Threshold int          `json:"threshold"` // always 150
	Peak      *HeatPeak    `json:"peak"`
	Clear     bool         `json:"clear"`
	Busiest   *HeatBusiest `json:"busiest"`
}

// LiveEvent is one event in the Live stream.
type LiveEvent struct {
	TS        int64  `json:"ts"`
	Person    string `json:"person"`
	Label     string `json:"label"`
	SessionID string `json:"sessionId"`
	Type      string `json:"type"`
	Path      string `json:"path"`
	Name      string `json:"name"`
	Country   string `json:"country"`
	City      string `json:"city"`
	Source    string `json:"source"`
}

// KeyCount is a key with a count (Live tallies).
type KeyCount struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

// LiveResult is the /api/live payload (TS Live).
type LiveResult struct {
	AsOf        int64       `json:"asOf"`
	Active      int         `json:"active"`
	Events5m    int         `json:"events5m"`
	Countries   []KeyCount  `json:"countries"`
	Sources     []KeyCount  `json:"sources"`
	Pages       []KeyCount  `json:"pages"`
	Stream      []LiveEvent `json:"stream"`
	StreamTotal int         `json:"streamTotal"`
}

// Person is one person in the visitors list.
type Person struct {
	Person     string `json:"person"`
	Label      string `json:"label"`
	Identified bool   `json:"identified"`
	FirstSeen  int64  `json:"firstSeen"`
	LastSeen   int64  `json:"lastSeen"`
	Visits     int    `json:"visits"`      // sessions in the range
	VisitsAll  int    `json:"visitsTotal"` // every session ever, as many as the journey lists
	Pages      int    `json:"pages"`
	DurationMs int64  `json:"durationMs"`
	Country    string `json:"country"`
	Region     string `json:"region"`
	City       string `json:"city"`
	Device     string `json:"device"`
	Browser    string `json:"browser"`
	OS         string `json:"os"`
	Source     string `json:"source"`
}

// Visitor is the v2 name of Person.
type Visitor = Person

// SessionRow is one row of the sessions list.
type SessionRow struct {
	SessionID    string  `json:"sessionId"`
	Person       string  `json:"person"`
	Label        string  `json:"label"`
	Start        int64   `json:"start"`
	DurationMs   int64   `json:"durationMs"`
	Pages        int     `json:"pages"`
	Entry        string  `json:"entry"`
	Exit         string  `json:"exit"`
	Source       string  `json:"source"`
	Country      string  `json:"country"`
	City         string  `json:"city"`
	Device       string  `json:"device"`
	Browser      string  `json:"browser"`
	OS           string  `json:"os"`
	Goals        []int64 `json:"goals"`
	RevenueMinor int64   `json:"revenueMinor"`
	Agent        string  `json:"agent"` // AI agent id, "" for people
}

// GoalHit is a goal reached inside a journey session.
type GoalHit struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	TS   int64  `json:"ts"`
}

// JourneySession is one session of a person's journey.
type JourneySession struct {
	SessionID  string    `json:"sessionId"`
	Start      int64     `json:"start"`
	Source     string    `json:"source"`
	Steps      []Step    `json:"steps"`
	Visit      int       `json:"visit"`
	DurationMs int64     `json:"durationMs"`
	Country    string    `json:"country"`
	City       string    `json:"city"`
	Device     string    `json:"device"`
	Goals      []GoalHit `json:"goals"`
	Agent      string    `json:"agent"` // AI agent id, "" for people
}

// Session is the v2 name of JourneySession.
type Session = JourneySession

// Campaign is one UTM campaign row.
type Campaign struct {
	Source       string   `json:"source"`
	Medium       string   `json:"medium"`
	Campaign     string   `json:"campaign"`
	Term         string   `json:"term"`
	Content      string   `json:"content"`
	Visitors     int      `json:"visitors"`
	Sessions     int      `json:"sessions"`
	Bounce       float64  `json:"bounce"`
	ConvRate     *float64 `json:"convRate"`
	RevenueMinor int64    `json:"revenueMinor"`
}

// AIReferral is one AI assistant that sent visitors.
type AIReferral struct {
	Key          string   `json:"key"`
	Visitors     int      `json:"visitors"`
	Sessions     int      `json:"sessions"`
	TopEntry     string   `json:"topEntry"`
	ConvRate     *float64 `json:"convRate"`
	RevenueMinor int64    `json:"revenueMinor"`
}

// EventProp summarises one property key of an event.
type EventProp struct {
	Key      string   `json:"key"`
	Distinct int      `json:"distinct"`
	Top      []string `json:"top"`
}

// EventRow is one row of the event catalogue.
type EventRow struct {
	Name     string      `json:"name"`
	Kind     string      `json:"kind"` // custom | outbound
	Count    int         `json:"count"`
	People   int         `json:"people"`
	LastSeen int64       `json:"lastSeen"`
	Props    []EventProp `json:"props"`
}

// EventCounts is an event's totals for one period.
type EventCounts struct {
	Count  int `json:"count"`
	People int `json:"people"`
}

// EventPropValue is one value of a property.
type EventPropValue struct {
	Value  string `json:"value"`
	Count  int    `json:"count"`
	People int    `json:"people"`
}

// EventPropRows lists a property's values.
type EventPropRows struct {
	Key  string           `json:"key"`
	Rows []EventPropValue `json:"rows"`
}

// EventLatest is one recent occurrence of an event.
type EventLatest struct {
	TS        int64          `json:"ts"`
	Person    string         `json:"person"`
	Label     string         `json:"label"`
	SessionID string         `json:"sessionId"`
	Props     map[string]any `json:"props"`
}

// EventDetailResult is the /api/events/detail payload (TS EventDetail).
type EventDetailResult struct {
	Name       string          `json:"name"`
	Count      int             `json:"count"`
	People     int             `json:"people"`
	Prev       *EventCounts    `json:"prev"`
	Series     []Point         `json:"series"`
	PrevSeries []Point         `json:"prevSeries"`
	Props      []EventPropRows `json:"props"`
	Latest     []EventLatest   `json:"latest"`
}

// GoalStats is a goal's numbers for one period (TS GoalStats).
type GoalStats = GoalPrev

// FirstTouchRow credits conversions to the first-touch source or landing page.
type FirstTouchRow struct {
	Key          string  `json:"key"`
	Converted    int     `json:"converted"`
	Share        float64 `json:"share"`
	Visitors     int     `json:"visitors"`
	Rate         float64 `json:"rate"`
	LowBase      bool    `json:"lowBase"`
	RevenueMinor int64   `json:"revenueMinor"`
}

// VisitSplit counts conversions by the visit they happened on.
type VisitSplit struct {
	First  int `json:"first"`
	Second int `json:"second"`
	Later  int `json:"later"`
}

// GoalDetailResult is the /api/goals/{id}/detail payload (TS GoalDetail).
type GoalDetailResult struct {
	Goal       Goal            `json:"goal"`
	Cur        GoalStats       `json:"cur"`
	Prev       *GoalStats      `json:"prev"`
	Series     []Point         `json:"series"`
	PrevSeries []Point         `json:"prevSeries"`
	Sources    []FirstTouchRow `json:"sources"`
	Landings   []FirstTouchRow `json:"landings"`
	ByVisit    VisitSplit      `json:"byVisit"`
}

// PathRow is one common path to a goal.
type PathRow struct {
	Steps  []string `json:"steps"`
	People int      `json:"people"`
	Share  float64  `json:"share"`
}

// PathsReport is the /api/paths payload.
type PathsReport struct {
	Goal       Goal      `json:"goal"`
	Converters int       `json:"converters"`
	Rows       []PathRow `json:"rows"`
}

// FunnelStep is one funnel step definition.
type FunnelStep struct {
	Kind  string `json:"kind"` // page | event
	Match string `json:"match"`
	Label string `json:"label"`
}

// Funnel is a stored funnel definition.
type Funnel struct {
	ID       int64        `json:"id"`
	Name     string       `json:"name"`
	WindowMs int64        `json:"windowMs"`
	Steps    []FunnelStep `json:"steps"`
	Created  int64        `json:"created"`
}

// FunnelStepResult is one step's numbers in a funnel report.
type FunnelStepResult struct {
	Label            string  `json:"label"`
	Reached          int     `json:"reached"`
	LeftAfter        int     `json:"leftAfter"`
	FromStart        float64 `json:"fromStart"`
	FromPrev         float64 `json:"fromPrev"`
	MedianMsFromPrev *int64  `json:"medianMsFromPrev"`
}

// FunnelDrop is the step after which most people left.
type FunnelDrop struct {
	After  int `json:"after"`
	People int `json:"people"`
}

// FunnelReportResult is the /api/funnels/{id}/report payload (TS FunnelReport).
type FunnelReportResult struct {
	Funnel      Funnel             `json:"funnel"`
	Window      Window             `json:"window"`
	Started     int                `json:"started"`
	Steps       []FunnelStepResult `json:"steps"`
	BiggestDrop *FunnelDrop        `json:"biggestDrop"`
}

// DropoffPerson is one person who left a funnel after a step.
type DropoffPerson struct {
	Person    string `json:"person"`
	Label     string `json:"label"`
	LastVisit int64  `json:"lastVisit"`
	ExitPage  string `json:"exitPage"`
	Source    string `json:"source"`
}

// Money is one period's revenue numbers, in minor units.
type Money struct {
	NetMinor  int64 `json:"netMinor"`
	Purchases int   `json:"purchases"`
	Buyers    int   `json:"buyers"`
	AovMinor  int64 `json:"aovMinor"`
}

// Purchase is one Purchase event.
type Purchase struct {
	TS           int64  `json:"ts"`
	Person       string `json:"person"`
	Label        string `json:"label"`
	SessionID    string `json:"sessionId"`
	AmountMinor  int64  `json:"amountMinor"`
	Plan         string `json:"plan"`
	VisitsBefore int    `json:"visitsBefore"`
}

// RevenueResult is the /api/revenue payload (TS Revenue).
type RevenueResult struct {
	Currency               string     `json:"currency"`
	OtherCurrencyPurchases int        `json:"otherCurrencyPurchases"`
	Cur                    Money      `json:"cur"`
	Prev                   *Money     `json:"prev"`
	Series                 []Point    `json:"series"`
	PrevSeries             []Point    `json:"prevSeries"`
	Purchases              []Purchase `json:"purchases"`
}

// RevenueRow is one first-touch revenue breakdown row.
type RevenueRow struct {
	Key          string  `json:"key"`
	RevenueMinor int64   `json:"revenueMinor"`
	Purchases    int     `json:"purchases"`
	Buyers       int     `json:"buyers"`
	Share        float64 `json:"share"`
}

// CrawlCategoryRow is one crawler category's requests.
type CrawlCategoryRow struct {
	Key      string `json:"key"` // training | indexing | fetch | general
	Requests int    `json:"requests"`
	Prev     *int   `json:"prev"`
}

// CrawlerRow is one crawler of a provider.
type CrawlerRow struct {
	Name     string `json:"name"`
	Category string `json:"category"`
	Requests int    `json:"requests"`
	Prev     *int   `json:"prev"`
}

// CrawlProvider groups crawlers by company.
type CrawlProvider struct {
	Provider string       `json:"provider"`
	Crawlers []CrawlerRow `json:"crawlers"`
}

// CrawlPoint is one bucket of crawler requests by category.
type CrawlPoint struct {
	T        int64 `json:"t"`
	Training int   `json:"training"`
	Indexing int   `json:"indexing"`
	Fetch    int   `json:"fetch"`
	General  int   `json:"general"`
}

// CrawlPage is one page crawlers requested.
type CrawlPage struct {
	Path     string  `json:"path"`
	Provider string  `json:"provider"`
	Crawler  string  `json:"crawler"`
	Category string  `json:"category"`
	Requests int     `json:"requests"`
	LastSeen int64   `json:"lastSeen"`
	Share    float64 `json:"share"`
}

// CrawlersResult is the /api/crawlers payload (TS Crawlers).
type CrawlersResult struct {
	Configured bool               `json:"configured"`
	Window     Window             `json:"window"`
	Total      int                `json:"total"`
	PrevTotal  *int               `json:"prevTotal"`
	Categories []CrawlCategoryRow `json:"categories"`
	Providers  []CrawlProvider    `json:"providers"`
	Series     []CrawlPoint       `json:"series"`
	Pages      []CrawlPage        `json:"pages"`
}

// ---- AI visibility, agents and setup (AI agents plan §0.3, §0.4). ----

// AIFunnelStep is one step of the AI visibility funnel. Each step keeps its own unit.
type AIFunnelStep struct {
	Key    string `json:"key"`    // crawled | fetched | cited | visited | converted
	Unit   string `json:"unit"`   // requests | sessions | people
	Value  *int   `json:"value"`  // nil when the step has no data source
	Prev   *int   `json:"prev"`   // nil without a comparison window or a value
	Status string `json:"status"` // ok | not_set_up | no_source | no_goal
}

// AIProviderRow is one AI provider across the funnel steps.
type AIProviderRow struct {
	Provider  string `json:"provider"`
	Crawled   int    `json:"crawled"`
	Fetched   int    `json:"fetched"`
	Visited   int    `json:"visited"`
	Converted *int   `json:"converted"` // nil when the site has no goal
}

// AIPageRow is one path that AI systems requested or sent visits to.
type AIPageRow struct {
	Path        string `json:"path"`
	Crawled     int    `json:"crawled"`
	Fetched     int    `json:"fetched"`
	Visits      int    `json:"visits"`
	Conversions *int   `json:"conversions"` // nil when the site has no goal
	LastCrawled *int64 `json:"lastCrawled"` // unix ms; nil when never crawled
}

// AIVisibilityResult is GET /api/ai-visibility.
type AIVisibilityResult struct {
	Window        Window          `json:"window"`
	Steps         []AIFunnelStep  `json:"steps"`
	Providers     []AIProviderRow `json:"providers"`
	Pages         []AIPageRow     `json:"pages"`
	Conv          *ConvRef        `json:"conv"`
	VerifiedShare *float64        `json:"verifiedShare"` // among crawlers that publish IP lists; nil when none
}

// AgentRow is one AI agent in the Agents report.
type AgentRow struct {
	Agent     string `json:"agent"`
	Name      string `json:"name"`
	Provider  string `json:"provider"`
	Sessions  int    `json:"sessions"`
	Prev      *int   `json:"prev"`
	Pageviews int    `json:"pageviews"`
	Verified  int    `json:"verified"` // sessions recognised by ip, relay or sig
	LastSeen  int64  `json:"lastSeen"`
}

// AgentPoint is one bucket of agent sessions.
type AgentPoint struct {
	T        int64 `json:"t"`
	Verified int   `json:"verified"`
	Claimed  int   `json:"claimed"`
}

// AgentPage is one path that agents viewed.
type AgentPage struct {
	Path      string `json:"path"`
	Pageviews int    `json:"pageviews"`
	Sessions  int    `json:"sessions"`
	TopAgent  string `json:"topAgent"`
}

// AgentSession is one recent agent session.
type AgentSession struct {
	SessionID  string `json:"sessionId"`
	Person     string `json:"person"`
	Agent      string `json:"agent"`
	Name       string `json:"name"`
	Provider   string `json:"provider"`
	Via        string `json:"via"` // ua | ip | relay | sig: the best in the session
	Start      int64  `json:"start"`
	DurationMs int64  `json:"durationMs"`
	Pages      int    `json:"pages"`
	Entry      string `json:"entry"`
	Goals      int    `json:"goals"`
}

// AgentsResult is GET /api/agents.
type AgentsResult struct {
	Window           Window         `json:"window"`
	Sessions         int            `json:"sessions"`
	PrevSessions     *int           `json:"prevSessions"`
	Pageviews        int            `json:"pageviews"`
	VerifiedSessions int            `json:"verifiedSessions"`
	Conversions      int            `json:"conversions"`
	Conv             *ConvRef       `json:"conv"`
	Series           []AgentPoint   `json:"series"`
	Agents           []AgentRow     `json:"agents"`
	Pages            []AgentPage    `json:"pages"`
	Latest           []AgentSession `json:"latest"`
}

// AIList is one fetched IP list or key directory, for the setup card.
type AIList struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`      // ip | keys
	FetchedAt *int64 `json:"fetchedAt"` // unix ms; nil = never
	Entries   int    `json:"entries"`
	OK        bool   `json:"ok"`
}

// AISetupCrawls says whether the server hook or log import is sending crawler requests.
type AISetupCrawls struct {
	State   string `json:"state"` // none | receiving | quiet
	LastAt  *int64 `json:"lastAt"`
	Last24h int    `json:"last24h"`
}

// AISetupAgents summarises recent agent sessions.
type AISetupAgents struct {
	LastAt  *int64 `json:"lastAt"`
	Last24h int    `json:"last24h"`
}

// AISetup is GET /api/ai-setup.
type AISetup struct {
	Crawls AISetupCrawls `json:"crawls"`
	Agents AISetupAgents `json:"agents"`
	Lists  []AIList      `json:"lists"`
}
