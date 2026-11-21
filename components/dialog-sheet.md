# Dialog and Sheet

**Dialog**: a short, blocking task (share link, add website, confirm delete, shortcuts). **Sheet**: detail on demand that keeps the page behind it (a journey, a row report, an event, a full report).

## Dialog

Centred, width `min(560px, 100vw − 24px)` (`wide` 780), max height `100vh − 48px` scrolling, `raised`, `radius-overlay` (16), `elevation-sheet`, over a `scrim`. Header: title `body-strong` + close icon button, padding `14px 14px 10px 18px`, 1px `border` below. Body padding `8px 18px 18px`. Footer actions right-aligned: one primary, one secondary.

Motion: in from `scale(.98)` + fade, `--motion-dialog`, origin centre; out `--motion-exit`. The shortcuts dialog (`?`) and anything opened by a key: no animation.

## Sheet

Right edge on desktop: `top/right/bottom: 8px`, width `min(820px, 100vw − 16px)` (`sm` 560), `surface`, `radius-overlay`, `elevation-sheet`, scrim behind. Bottom sheet on phones (≤ 640): full width, top radius 16, a 36 x 4 grab handle, drag down to dismiss (velocity > 0.11 px/ms or 30% of height). Header pinned (padding `16px 16px 14px 20px`, 1px `border`), body scrolls with `overscroll-behavior: contain`.

Motion: slides from its edge with `--motion-sheet` (`--ease-drawer`) and leaves the same way. Reduced motion: 200ms cross-fade, no slide.

Sheets are URL state (`?v=`, `?dr=`, `?rep=`): Back closes them.

## Keyboard and ARIA (both)

Radix Dialog: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title. Focus moves to the title (sheets) or the first field (dialogs), is trapped, and returns to the trigger on close (to `#main` after a deep link). Esc closes only the top layer. Body scroll locks. The page behind is `inert`.

## Tokens

`raised`, `surface`, `scrim`, `elevation-sheet`, `border`, `radius-overlay`, `motion-dialog`, `motion-sheet`, `motion-exit`, `z-scrim`, `z-sheet`, `z-dialog`.

## Do / don't

- Do confirm destructive actions in a dialog that names the thing.
- Don't open a dialog from a dialog; replace its content.
- Don't use a sheet for a two-field form.

## Port from

`proto: css/app.css` `.dialog`, `.sheet`, `.scrim` (lines 496-514, 807-822), `js/sheets.js` (`teardown`, focus return, `dragToDismiss`); `lib: ui/modal.tsx`, `shell/settings-modal.tsx` (focus trap and restore); `web: components/ui/dialog.tsx` (Radix base).
