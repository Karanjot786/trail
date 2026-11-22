---
title: Revenue
description: Revenue reported by your site through Purchase events, credited to a visit's first source.
---

# Revenue

Trail shows **Revenue** in the sidebar only for a site that has sent at least one `Purchase` event, so nobody sees an empty money screen. Send one from your site:

```js
trail.track('Purchase', { amount: 19, currency: 'USD' })
```

The numbers are labelled "reported by your site": Trail adds up what your page sends, and does not talk to a payment provider. A site uses one currency; purchases in another currency are counted separately and not added in.

Each purchase is credited to the visitor's first source, so Revenue, [Acquisition](/dashboard/acquisition) and goals agree row for row. The chart is daily bars, and a day with no purchases reads "No purchases".

To hide it from a [shared link](/dashboard/navigating#share-a-read-only-link), turn on **Hide revenue** when you create the link.
