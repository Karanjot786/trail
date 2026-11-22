---
title: Delivery health
description: See how many events reached the server and how many needed a retry, and what a rising retry share means.
---

# Delivery health

Delivery health is on the [API](/api/read-api) (`GET /api/v1/delivery`). For a range it reports:

- **Events**: non-bot events that reached the server.
- **On a retry**: the share of them that arrived on a second or later attempt.

The tracker sends each pageview at once. Other events are queued and sent together when the page is hidden. If a send fails (a network error, a server error, a `408` or a `429`), the tracker retries with backoff while the page is open, up to 5 times, and marks the event with its retry count, which the server stores. Other errors, such as a `403` for an origin that is not allowed, are not retried.

A small retry share is normal: it is mostly phones on weak connections. A share that climbs suddenly points at a problem between visitors and your server, such as a proxy or rewrite that fails some of the time, or a [rate limit](/operations/configuration#rate-limit) set too low.

The API returns the same numbers at `GET /api/v1/delivery` as `{events, retried, retriedRate}`.

## Next

- Fix a failing proxy: [Rewrites](/install/rewrites).
- Tune the [rate limit](/operations/configuration#rate-limit).
