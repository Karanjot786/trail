---
title: Custom events
description: Send your own events with properties, from code.
---

# Custom events

```js
trail.track('Signup', { plan: 'pro', seats: 3 });
```

- The name is what the Events panel shows and what [event goals](/dashboard/goals) match.
- Properties are optional and flat: each value is a string, number, boolean or `null`, with at most 20 keys. The server skips an event with nested objects, arrays or more keys. Events travel in batches, and the server keeps the valid ones in a batch and drops only the bad one. Keep properties flat so none get dropped.
- Custom events are queued and sent together when the page is hidden, so calling `track` costs no request of its own.

With the npm package the same call is typed:

```ts
import { track } from 'trail-analytics';

track('Signup', { plan: 'pro' });
```

## Calls before the tracker loads

`window.trail` exists only after the script runs. To call it earlier, add the queue stub before the tag; the tracker replays queued calls in order when it starts. The npm package does this for you.

```html
<script>
  window.trail = window.trail || function () { (window.trailq = window.trailq || []).push(arguments); };
</script>
```

## Naming

Pick names a person would read in a report, such as `Signup` or `Invite sent`, and keep them stable: renaming an event starts a new row, and goals that match the old name stop counting.

To record a click without writing code, use a [named click](/tracking/named-clicks) instead.
