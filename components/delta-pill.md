# DeltaPill

A change against a stated basis. Arrow + sign + number + colour, never colour alone.

## Anatomy

`[arrow 12px, stroke 2.2] +12%` in a 20px pill (18px inside the chart card), padding `0 6px 0 4px`, `radius-row`, Geist 500 12px tabular, `nowrap`.

## Props

| Prop | Type | Notes |
|---|---|---|
| `current`, `previous` | number | |
| `kind` | `count \| rate \| money \| duration` | rates read "+1.2 points"; money at $0 reads "no purchases" |
| `goodWhen` | `up \| down` | bounce rate is good when down |
| `basis` | string | "Wed, Nov 11 (the day before)"; required |

Built by one function (`delta()` in the engine). Under 5 in the earlier period it shows the plain difference ("+7 vs 1").

## Tones

| Tone | Fill | Text |
|---|---|---|
| good | `success-bg` | `success` |
| bad | `danger-bg` | `danger` |
| flat (under 0.5%) | `raised` | `muted`, a flat arrow |

## ARIA

`aria-label="Up 12% vs 414 on Sep 22 – Oct 21"`. The basis is also in a tooltip.

## Don't

Don't show a delta without a basis. Don't show "−100%" for an empty period. Don't colour the KPI value itself.

Port from: `proto: css/app.css` `.delta` (lines 127-133), `js/ui.js` `delta()`, `js/engine.js` `compare()`; `lib: ui/chip.tsx` (DeltaPill).
