---
title: Identify and journeys
description: Link visits to your own user ids so journeys follow people across visits and devices.
sidebar:
  order: 3
---

Call `identify` when a person signs in, and `reset` when they sign out:

```js
trail.identify(user.id); // on login, and on page load while signed in
trail.reset();           // on logout
```

- The id is stored as the user id on this device, and every visit from this browser, earlier anonymous ones included, joins that person's [journey](/docs/dashboard/visitors/).
- Sign in on a phone and a laptop, and both journeys join under one person.
- If a different user signs in on the same device, the tracker starts a new anonymous id first, so the two people are never merged.
- `reset` starts a fresh anonymous id and forgets the user id.

Use an id that means nothing outside your app, such as a database key. Avoid email addresses: the id is visible in the dashboard and the API.

## Identify and consent

`identify` needs browser storage, so it only works in full mode.

| Mode | What `identify` does |
|---|---|
| Default (private until consent) | Upgrades the visitor to full mode, as `consent(true)` would, then identifies. Call it only once you have the visitor's agreement |
| `data-mode="full"` | Identifies |
| `data-mode="private"` and `t.p.js` | Nothing |

If the visitor has said no with `consent(false)`, `identify` does nothing until they say yes.
