---
title: Delivery health
description: How many events reached the server, and how many needed a retry.
sidebar:
  order: 4
---

Open the `...` menu in the header and choose **Delivery health**. It shows, for the current range:

- **Events**: non-bot events that reached the server.
- **On a retry**: the share of them that arrived on a second or later attempt.

The tracker sends each pageview at once. Other events are queued and sent together when the page is hidden. If a send fails, the tracker retries with backoff while the page is open, and marks the event with its retry count, which the server stores.

A small retry share is normal: it is mostly phones on weak connections. A share that climbs suddenly points at a problem between visitors and your server, such as a proxy or rewrite that fails some of the time.

The API returns the same numbers at `GET /api/v1/delivery` as `{events, retried, retriedRate}`.
