---
title: Do Not Track and GPC
description: How Trail treats the Do Not Track and Global Privacy Control signals.
---

# Do Not Track and GPC

If a visitor's browser sends **Do Not Track** (`navigator.doNotTrack == "1"`) or **Global Privacy Control** (`navigator.globalPrivacyControl`), the tracker stops before doing anything: no request, no storage, no listeners. They are simply not in your numbers.

To count those visitors anyway, set `data-dnt="off"`:

```html
<script defer src="/_t/t.js" data-site="mysite" data-dnt="off"></script>
```

With the npm package, pass `dnt: false`. Only do this if you have decided the signals do not apply to your site; the rest of the mode rules (private until consent, and so on) still apply.

The check runs in the browser, so the server never learns that a visitor opted out.
