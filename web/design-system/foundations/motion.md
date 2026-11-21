# Motion

One question first: how often will someone see this? Many times a day means no animation.

## Curves

| Token | Curve | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(.23, 1, .32, 1)` | Everything that enters, exits, is pressed or hovered. The only ease-out |
| `--ease-in-out` | `cubic-bezier(.77, 0, .175, 1)` | Movement from A to B on screen: segmented thumbs, tab indicators, cursor flight |
| `--ease-drawer` | `cubic-bezier(.32, .72, 0, 1)` | Sheets and drawers |

The dashboard's old `--ease-out` (`.2, .8, .2, 1`) and `--ease-ui` are retired. Never `ease-in` on UI. `linear` only for progress and constant motion.

## Durations

| Token | ms | Use |
|---|---|---|
| `--motion-exit` | 100 | Popovers and menus closing |
| `--motion-press` | 120 | `scale(.97)` on `:active` |
| `--motion-tooltip` | 125 | Tooltip in (instant if another tooltip closed in the last 400ms) |
| `--motion-hover`, `--motion-popover` | 150 | Colour and background; popovers in (`scale(.97)` + fade, from the trigger) |
| `--motion-toast`, `--motion-dialog` | 200 | Toast rises 8px; dialog `scale(.98)` + fade, centred |
| `--motion-disclose`, `--motion-move` | 240 | `grid-template-rows 0fr → 1fr`; sliding indicators |
| `--motion-sheet` | 320 | Sheet slides from its edge (`--ease-drawer`) |
| `--motion-reveal` | 700 | Marketing scroll reveal (opacity 600, transform 700), once |
| `--duration-copy-reset` | 1600 | CopyButton returns to idle |

Product UI stays under 300ms, except the sheet. Exits are faster than entrances.

## Pressed and swapped

- Every pressable thing: `transform: scale(.97)` on `:active`, `--motion-press`. Icon buttons and the copy button: `.94`. Never below `.94`.
- Icon swap (copy → check): outgoing `scale(.6)` + `blur(2px)` + fade, incoming from `scale(.6)`, 180ms `--ease-out`. One recipe everywhere.
- Nothing enters from `scale(0)`.

## What never animates

- The command palette and the `?` shortcuts dialog: open and close instantly.
- Anything opened from the keyboard: arrow keys in lists, `[` and `]` between visits, tab switching by keys.
- The sidebar grid on collapse (it snaps; only labels fade, and only for pointer toggles).
- Numbers that update live in tables. A KPI value may cross-fade once when the range changes; it never counts up in product.
- Layout properties (`width`, `height`, `top`, `margin`). Animate `transform`, `opacity`, `clip-path`, `filter`.
- `transition: all`.
- Loops, except the live dot pulse (2.4s) and the skeleton shimmer (1.4s), both off under reduced motion.

## Reduced motion

Movement is opt-in. Write transforms, slides and reveals inside `@media (prefers-reduced-motion: no-preference)`. Under `reduce`:

- Sheets and dialogs cross-fade (200ms opacity), no slide or scale.
- Marketing sequences show their final state; scroll reveal is off; smooth scroll is off.
- Pulses, shimmers, the waiting dots and count-ups stop on a still frame.
- Colour and opacity transitions that aid understanding stay.

## Marketing motion

One orchestrated moment per section, played once at about 45% in view, never looping: footsteps stagger 38ms, reveal stagger 70ms, typed terminal 11ms per character with a Skip button. No-JS and reduced motion show the final state. Hover micro-interactions live behind `(hover: hover) and (pointer: fine)`.
