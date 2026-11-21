---
title: Rewrites (Vercel and others)
description: Serve the tracker and its endpoint from your own domain with a /_t/* rewrite.
---

# Rewrites (Vercel and others)

The tracker is served at `/_t/t.js` (and `/_t/t.p.js`, `/_t/t.x.js`), and it sends events to `/_t/e`. If your site forwards `/_t/*` to the Trail server, the browser sees first-party requests: no third-party host for blockers to match, and no CORS round trip.

Replace `stats.example.com` with your Trail host. The files are `vercel.json`, `next.config.js`, `netlify.toml`, your `Caddyfile` and your nginx server config.

::: code-group
```json [Vercel]
{
  "rewrites": [{ "source": "/_t/:p*", "destination": "https://stats.example.com/_t/:p*" }]
}
```
```js [Next.js]
module.exports = {
  async rewrites() {
    return [{ source: '/_t/:p*', destination: 'https://stats.example.com/_t/:p*' }];
  },
};
```
```toml [Netlify]
[[redirects]]
  from = "/_t/*"
  to = "https://stats.example.com/_t/:splat"
  status = 200
```
```txt [Caddy]
example.com {
	handle /_t/* {
		reverse_proxy https://stats.example.com {
			header_up Host {upstream_hostport}
		}
	}
	# ...the rest of your site
}
```
```nginx [nginx]
location /_t/ {
    proxy_pass https://stats.example.com;
    proxy_set_header Host stats.example.com;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_ssl_server_name on;
}
```
:::

Then the script tag needs no host:

```html
<script defer src="/_t/t.js" data-site="mysite"></script>
```

## Check the rewrite

Open your site, then the browser's network panel. You should see `t.js` load from your own domain with status 200, and a `POST /_t/e` answered with `204` and an `X-Trail-Accepted` header.

Two other answers mean something specific. A `403` means the page's domain is not on the site's allowed origins; see [Allowed origins](/operations/configuration#allowed-origins). A `429` means one IP sent more than `TRAIL_INGEST_RPS` event requests per second.

Trail serves `t.js` gzipped, with an `ETag` and `Vary: Accept-Encoding`. A proxy in front can cache it or compress it again without trouble.

## Forward the visitor IP

Vercel, Netlify, Caddy and nginx (with the line above) add the visitor's IP to `X-Forwarded-For`. Trail believes that header only when the request comes from a proxy listed in `TRAIL_TRUSTED_PROXIES` (default: loopback, private ranges and Cloudflare). Otherwise every visitor appears to come from the proxy: countries go wrong, in private mode visitors from different people can merge, and the per-IP rate limit (`TRAIL_INGEST_RPS`, default 50 per second) applies to the proxy as a whole.

- Your own nginx or Caddy with a fixed address: add it, e.g. `TRAIL_TRUSTED_PROXIES=private,cloudflare,198.51.100.7`.
- Vercel and Netlify: they connect from changing public addresses, so they cannot be listed. You can trust every peer with `TRAIL_TRUSTED_PROXIES=0.0.0.0/0,::/0`, which brings the visitor IP back but lets anyone who calls Trail directly send a forged one. Keep that in mind for the rate limit.

See [Client IP and proxies](/operations/configuration#client-ip).

## Next

- Add the tag for your stack: [script tag](/add/script-tag), [npm](/add/npm) or a framework guide.
- Check [Troubleshooting](/operations/troubleshooting) if `t.js` returns a `404`.
