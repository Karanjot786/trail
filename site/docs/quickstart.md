---
title: Quickstart
description: Run Trail, add the script to a page and see your first visitor online, in three steps.
---

# Quickstart

You need Docker, or Go 1.26+ with Node 22+ and pnpm to build from source. It takes about two minutes.

<div class="steps">

### Start the server

::: code-group
```sh [Docker]
git clone https://github.com/karanjot786/trail && cd trail
docker build -t trail .
docker run -d --name trail -p 8080:8080 -v trail-data:/data \
  -e TRAIL_PASSWORD=change-me \
  -e TRAIL_SITES=mysite=localhost \
  trail
```
```sh [From source]
git clone https://github.com/karanjot786/trail && cd trail
make build
TRAIL_PASSWORD=change-me TRAIL_SITES=mysite=localhost ./trail
```
:::

The log ends with `trail listening on :8080 (sites: 1, api tokens: 0)`. `TRAIL_SITES` is optional. It adds a site id (`mysite`) with its domain at startup. You can also add sites in the dashboard (step 3). Events for ids that do not exist are rejected.

### Add the script to a page

Any page on any port works. `data-dev` is needed only because the page runs on `localhost`, where the tracker stays quiet unless told otherwise.

::: code-group
```html [index.html]
<script defer src="http://localhost:8080/_t/t.js" data-site="mysite"
  data-api="http://localhost:8080/_t/e" data-dev></script>
```
:::

On a real site you proxy `/_t/*` through your own domain, and the tag shrinks to `<script defer src="/_t/t.js" data-site="mysite"></script>`. See [Rewrites](/install/rewrites).

### Open the dashboard

Go to `http://localhost:8080`, sign in with `TRAIL_PASSWORD`, and open your page in another tab. The header shows **1 online** within a few seconds.

To track another site, open **Settings**, click **Add site** and enter its domain. Its **Install** panel gives you the snippet for a script tag, npm, Next.js, React or a Vercel rewrite, and shows "Receiving data" once the first event arrives.

</div>

::: tip
Events from `localhost` are tagged with the `development` environment. The dashboard shows `production` by default, so pick **All Environments** in the header to see test pageviews in the charts. The online count covers every environment.
:::

::: info
Trail only accepts events from the site's own domain, its subdomains, hosts you list as allowed origins, and `localhost`. Anything else gets a `403`. See [Allowed origins](/operations/configuration#allowed-origins).
:::

## Next

- Put it on a server: [Docker](/install/docker), [Fly.io](/install/fly), or [a binary with systemd and Caddy](/install/binary).
- Choose a [privacy mode](/tracking/privacy) before you go live.
- Every setting is listed in [Configuration](/operations/configuration).
