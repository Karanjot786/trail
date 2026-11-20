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
  country TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
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
CREATE INDEX IF NOT EXISTS events_site_user_ts ON events(site_id, user_id, ts);
CREATE INDEX IF NOT EXISTS events_site_session ON events(site_id, session_id);

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
