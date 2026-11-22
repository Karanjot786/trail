---
title: Settings
description: Websites, install code, AI assistants, API tokens, share links, exports and config, all under Settings.
---

# Settings

Settings has a section list on the left: **Websites**, **Install**, **AI assistants**, **API tokens**, **Sharing**, **Data**, and **Config and appearance**. The section is in the address (`/settings/tokens`), so you can link to one.

## Websites

Each card shows a site's domain and id, how many events arrived in the last 24 hours, and when the last one came. On a fresh install there are no sites, and this is the whole screen until you add one.

**Add a website.** Paste the domain, as a URL or a bare host such as `example.com`. Trail suggests an id from it. The id goes in `data-site` and cannot be changed later: 1 to 40 characters, lowercase letters, digits and dashes. The domain and all its subdomains are allowed at once. The same steps run in the [first-run walkthrough](/dashboard/first-run).

**Allowed origins.** Extra hosts that may send events for the site, one per line, up to 20. Use `*.vercel.app` to cover every preview deployment. The site's own domain and subdomains, and `localhost`, are always allowed. See [Allowed origins](/operations/configuration#allowed-origins). If events came from a host that is not on the list, a warning counts them. That count lives in memory, covers about the last 24 hours, and resets when the server restarts.

**Remove a website.** Type the site id to confirm. Trail stops accepting its events at once and keeps its data, so adding the same id again brings it back. Tick **Also delete its data** to remove every event, goal and identity for the site. That cannot be undone.

Sites listed in `TRAIL_SITES` are added at startup if they are missing. Edits made here are kept across restarts. Everything is also on the [API](/api/read-api#sites).

## Install

Copy-ready code for the chosen site, with your site id and Trail host filled in. A live check waits for the first event and then reads "Receiving data".

## AI assistants

Pick a client, create a token for one site, and paste the setup with the token filled in. A test button checks the connection. See [MCP](/api/mcp).

## API tokens

Create, list and revoke tokens. A token has a name, a scope and a site. See [Keys and tokens](/api/tokens). The secret is shown once, when you create it.

## Sharing

Every active [read-only link](/dashboard/navigating#share-a-read-only-link), for all sites, with when it was created, when it expires and when it was last opened. **Revoke** stops a link at once.

## Data

Export every page view and event of a site as gzipped NDJSON. Every panel and table also exports CSV and JSON from its own menu.

## Config and appearance

The effective configuration the server runs with, and where each value comes from. Secrets are never shown. Also: the current view as an API call, the theme (stored in this browser only), and the keyboard shortcuts.

## Next

- Install the script: [Quickstart](/quickstart).
- Set what the server runs with: [Configuration](/operations/configuration).
