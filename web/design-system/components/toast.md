# Toast

Confirmation that something happened, out of the way. Replaces `ReadOnlyToast` and every ad-hoc "Copied" message.

## Anatomy

`[icon 16] message [action?] [×?]`. Padding `10px 14px`, `radius-tooltip` (10) on product, `inverse` fill, `on-inverse` text, `small` 500, `elevation-pop`. Bottom centre, 20px from the edge (above the bottom sheet on phones), stacked with an 8px gap, newest at the bottom, max 3.

## Props

`message`, `tone` (`neutral | success | danger`, which only changes the icon), `action` (`{ label, onClick }`, e.g. Undo), `duration` (default 2600ms; 6000 with an action; errors stay until dismissed).

## Behaviour

- Enters rising 8px + fade (`--motion-toast`), leaves 4px + fade faster (`--motion-exit`). Transitions, not keyframes, so rapid toasts retarget smoothly.
- Timers pause while hovered, focused or when the tab is hidden.
- Reduced motion: fade only.

## ARIA

A single `role="status" aria-live="polite"` region holds all toasts; errors use `role="alert"`. The action button is reachable by keyboard (F6 or the region's skip). Toasts never steal focus.

## Tokens

`inverse`, `on-inverse`, `elevation-pop`, `radius-tooltip`, `motion-toast`, `motion-exit`, `z-toast`.

## Don't

Don't toast what the UI already shows (a switch flipping). Don't use toasts for errors that need a decision; use an inline ErrorState.

## Port from

`proto: css/app.css` `.toast`, `.toasts` (lines 784-789), `js/ui.js` `toast()`; `lib: ui/notification.tsx` (role handling, reduced motion, auto-dismiss bar; replace motion with CSS).
