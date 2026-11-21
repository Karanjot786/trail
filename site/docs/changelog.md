---
title: Changelog
description: What changed in each Trail release, newest first.
---

# Changelog

Subscribe with the [RSS feed](/changelog.xml).

## AI visibility {#ai-visibility}

<time datetime="2026-11-21">2026-11-21</time>

An AI visibility screen with a funnel, Crawlers and Agents tabs. AI browsing agents are recognised from the script's own requests, marked Verified or Claimed, and left out of visitor numbers unless you count them. `npx trail-analytics init` adds crawler capture and a first-party `/t/*` proxy with signed edge location to Next.js and Astro. Location labels its accuracy, Cloudflare location headers are trusted from Cloudflare only, and `TRAIL_AGENT_LISTS=off` turns off the list downloads.

## Trail v2 {#v2}

<time datetime="2026-11-20">2026-11-20</time>

Per-need tracker builds (t.js, t.p.js, t.x.js), batched delivery with retry, privacy modes with consent, named clicks, goals, a token read API and MCP endpoint, a public demo, and this site.

## Trail v1 {#v1}

<time datetime="2026-11-19">2026-11-19</time>

First release: one Go binary with SQLite, an embedded dashboard, visitor journeys and a tracker under 2 KB gzipped.
