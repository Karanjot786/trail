CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  site_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  anon_id TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_term TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  referrer_host TEXT NOT NULL DEFAULT '',
  referrer_url TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  props TEXT NOT NULL DEFAULT '',
  engaged_ms INTEGER NOT NULL DEFAULT 0,
  scroll_pct INTEGER NOT NULL DEFAULT 0,
  dwell_ms INTEGER NOT NULL DEFAULT 0,
  country TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  -- 1 = not a person: bots and AI agents. agent<>'' marks the agents among them.
  -- agent, agent_via, geo_src and retry are added by store.migrate, not here.
  is_bot INTEGER NOT NULL DEFAULT 0,
  env TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS identity_map (
  site_id TEXT NOT NULL,
  anon_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (site_id, anon_id, user_id)
);

CREATE INDEX IF NOT EXISTS events_site_ts ON events(site_id, ts);
CREATE INDEX IF NOT EXISTS events_site_anon_ts ON events(site_id, anon_id, ts);

CREATE TABLE IF NOT EXISTS goals(
  id INTEGER PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('page','event')),
  match TEXT NOT NULL,
  created INTEGER NOT NULL,
  UNIQUE(site_id,name)
);

-- Sites ingest accepts. origins is a comma list of extra hosts or *.suffix patterns.
CREATE TABLE IF NOT EXISTS sites(
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  origins TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);

-- Dashboard v3 additions (plan §0.7). Report indexes, then the small metadata tables.
-- events_site_name_ts (partial, named events only) replaces events_site_type_name_ts and events_site_user_ts: store.migrateVersioned, step 2.
-- events_site_session_ts replaces events_site_session(site_id, session_id); store.migrate drops the old one.
CREATE INDEX IF NOT EXISTS events_site_session_ts ON events(site_id, session_id, ts);

-- Funnels: steps is a JSON array of {kind, match, label}.
CREATE TABLE IF NOT EXISTS funnels(id INTEGER PRIMARY KEY, site_id TEXT NOT NULL, name TEXT NOT NULL,
  window_ms INTEGER NOT NULL, steps TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE(site_id, name));

-- Chart notes (annotations).
CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, site_id TEXT NOT NULL, ts INTEGER NOT NULL, label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other' CHECK(kind IN ('deploy','campaign','press','other')), created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS notes_site_ts ON notes(site_id, ts);

-- Saved views: state is a URL query string; site_id NULL means all sites.
CREATE TABLE IF NOT EXISTS views(id INTEGER PRIMARY KEY, name TEXT NOT NULL, site_id TEXT, state TEXT NOT NULL, created INTEGER NOT NULL);

-- Read-only share links: hash is SHA-256 of the token, pkey the per-share key for opaque visitor ids.
CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY, site_id TEXT NOT NULL, hash BLOB NOT NULL UNIQUE, pkey BLOB NOT NULL,
  label TEXT NOT NULL DEFAULT '', state TEXT NOT NULL, hide_revenue INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
  expires INTEGER, revoked INTEGER, last_used INTEGER);

-- API tokens created in the UI (env tokens are not stored). hash is SHA-256 of the token.
CREATE TABLE IF NOT EXISTS api_tokens(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, hash BLOB NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK(scope IN ('read','notes','write','crawl')), site_id TEXT, created INTEGER NOT NULL,
  last_used INTEGER, revoked INTEGER);

-- AI crawler requests from server logs, aggregated per hour x bot x path x status class x verified.
-- status 0 = unknown (a Next proxy runs before the route). verified = the IP is in the operator's published list.
-- store.migrate rebuilds tables from older versions that lack verified.
CREATE TABLE IF NOT EXISTS crawl_hits(site_id TEXT NOT NULL, hour INTEGER NOT NULL, bot TEXT NOT NULL, path TEXT NOT NULL,
  status INTEGER NOT NULL, verified INTEGER NOT NULL DEFAULT 0, n INTEGER NOT NULL, last_ts INTEGER NOT NULL,
  PRIMARY KEY(site_id, hour, bot, path, status, verified)) WITHOUT ROWID;

-- Server settings generated on first start: the session-signing secret and, when TRAIL_PASSWORD
-- is unset, the SHA-256 of a generated dashboard password. The plaintext password is never stored.
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value BLOB NOT NULL) WITHOUT ROWID;
