---
title: Web vitals, rage clicks, forms and errors
description: Opt-in extras that load a small second file only when you ask for them.
---

# Web vitals, rage clicks, forms and errors

Four features live in `t.x.js`, a separate file the tracker loads from the same folder only when the tag asks for one of them. Sites that do not use them never download it. It is 740 bytes gzipped.

| Attribute | Records |
|---|---|
| `data-vitals` | Largest Contentful Paint, Cumulative Layout Shift and Interaction to Next Paint, sent once when the page is hidden |
| `data-rage` | A `rage_click` event when someone clicks three times within a second in nearly the same spot |
| `data-forms` | A `form` event on each submit, named by the form's `id` or `name`. Field values are never read |
| `data-errors` | Uncaught errors and unhandled promise rejections, up to 5 distinct messages per page load, cut to 200 characters |

```html
<script defer src="/_t/t.js" data-site="mysite" data-vitals data-errors></script>
```

They work with `t.js` and `t.p.js`, in every mode.

Errors thrown before `t.x.js` has loaded are not caught. Rage clicks show in the Events panel as `rage_click`, so you can make one a [goal](/dashboard/conversions) to watch it.

## Next

- Watch an extra event as a [goal](/dashboard/conversions).
- See what each file costs in [Tracker cost](/tracking/cost).
