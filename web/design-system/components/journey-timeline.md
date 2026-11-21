# Journey timeline

The hero of the product: one visitor's path from source to goal, opened as a sheet from anywhere (`?v=`).

## Anatomy

```
Header (pinned, surface, 1px border below)
  44px dot-face avatar · name (heading) · "from Google · Chrome on Mac · India"
  facts: visits · pages · time · goal badge(s) built from data ("2 goals: Pricing · visit 1, Signup · visit 3")
Visits strip
  a time axis ending today; each visit a 36px button (number, date, a dot per page); the goal visit in goal
  visits closer than 16% of the axis stack into lanes
Timeline (one section per visit)
  visit head: "Visit 3 · Nov 12, 10:41 · 9 days, 12 hours later" (focusable, the strip scrolls here)
  steps: time (caption muted, tabular) · page path (mono) · scroll depth · chips (event, outbound, exit)
  between steps: footsteps (the mark's three descending dots, subtle) instead of a line
  goal step: a goal ring + "Signup" + goal-fill badge
```

## Behaviour

- `[` and `]` step between visits (no animation), scrolling the visit head into view and focusing it.
- Long gaps print as words ("9 days, 12 hours later"), never as a long line.
- Every step's source and event chips are buttons that filter the dashboard.

## ARIA

The timeline is an ordered list of visits, each an ordered list of steps. Goal steps say "Goal reached: Signup". The strip's buttons have names like "Visit 3, Nov 12, 4 pages, goal reached".

## Tokens

`surface`, `raised`, `border`, `fg`, `muted`, `subtle`, `goal`, `goal-stroke`, `goal-fill`, `on-goal-fill`, `accent-soft`, `accent-line`, `type-heading`, `font-mono`, `radius-row`.

## Marketing versions

The landing's Journey band and Bento tile draw the same structure inside a dark product window (`data-theme="dark"`), with footsteps from `site: scripts/art/journey.mjs`.

## Port from

`proto: css/app.css` journey block (lines 515-598), `js/sheets.js` `journey()`, `stepRow()`, `goalsAt()`; `site: styles/ui.css` `.day`, `.sess`, `.sl`; `web: components/JourneyView.tsx`.
