---
title: Named clicks
description: Record clicks on chosen elements with a data-trail attribute and no JavaScript.
sidebar:
  order: 2
---

Give an element a `data-trail` name and every click on it, or on anything inside it, becomes an event with that name:

```html
<button data-trail="Signup">Create account</button>

<a href="/pricing" data-trail="Pricing from hero">
  <span>See pricing</span>
</a>
```

- The closest element with `data-trail` wins, so a click on the `<span>` above records `Pricing from hero`.
- The event looks the same as `trail.track('Signup')`, so it shows in the Events panel and can be a [goal](/docs/dashboard/goals/).
- Named clicks are sent in **full mode**, which includes the default mode after `consent(true)` or `identify()`. Private visitors do not send them, and `t.p.js` does not include them.

Trail does not record every click on the page. Only the elements you name are tracked, plus links to other sites (outbound clicks), which are recorded in every mode.
