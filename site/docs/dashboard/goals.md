---
title: Goals
description: Count conversions on a page or an event and see the conversion rate.
---

# Goals

A goal marks something you want visitors to do. The Goals panel on the Overview tab shows, for each goal, the conversions, the visitors who converted, and the conversion rate, each against the previous range.

## Add a goal

Click **Add goal** in the Goals panel and choose a kind:

| Kind | Match | Counts |
|---|---|---|
| Page | A path such as `/pricing`. End it with `*` to match a prefix: `/docs/*` | Pageviews of that path |
| Event | An event name such as `Signup` | Custom events or named clicks with that name |

Names are 1 to 60 characters and unique per site. Matches are 1 to 200 characters and exact, apart from the trailing `*`. Prefix matches are case-sensitive. A site can have up to 50 goals.

## The numbers

- **Conversions**: how many times the goal was hit.
- **Visitors**: distinct people who hit it.
- **Rate**: goal visitors divided by all visitors in the range, between 0 and 1.

Goals follow the dashboard's filters and environment, so filtering by a referrer shows how well that source converts.

Goals are evaluated when you look, over the events already stored, so a new goal shows history straight away.

## From the API

`GET /api/v1/goals/report` returns the same numbers, and a write token can create and delete goals. See [Read API](/api/read-api).
