---
title: Conversions
description: Goals count a page or an event. Funnels follow people through ordered steps.
---

# Conversions

**Conversions** has two tabs: **Goals** and **Funnels**. Both follow the dashboard's filters, comparison and environment, so filtering by a referrer shows how well that source converts. They are worked out when you look, over the events already stored, so a new one shows history straight away.

## Goals

A goal marks something you want visitors to do. Each shows conversions, the visitors who converted and the conversion rate, against the comparison period. Open a goal for its detail, including its sources. The Overview also has a Goals panel.

Click **Add goal** and choose a type:

| Type | Match | Counts |
|---|---|---|
| Page | A path such as `/pricing`. End it with `*` to match a prefix: `/docs/*` | Pageviews of that path |
| Event | An event name such as `Signup` | Custom events or named clicks with that name |

Names are 1 to 60 characters and unique per site. Matches are 1 to 200 characters and exact, apart from the trailing `*`. Prefix matches are case-sensitive. A site can have up to 50 goals.

- **Conversions**: how many times the goal was hit.
- **Visitors**: distinct people who hit it.
- **Rate**: goal visitors divided by all visitors in the range, between 0 and 1.

## Funnels

A funnel has 2 to 8 ordered steps, each a page (with `*` for a prefix) or an event. It shows how many people reach each step and where most drop off. Open a drop-off to see the people who reached a step and not the next one.

## From the API

`GET /api/v1/goals/report` returns the goal numbers, and a write token can create and delete goals. See [Read API](/api/read-api).

## Next

- Send the events goals match: [custom events](/tracking/custom-events) and [named clicks](/tracking/named-clicks).
