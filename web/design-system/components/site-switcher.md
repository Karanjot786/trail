# SiteSwitcher

The top of the rail: which site you are looking at, and the way to every other site.

## Anatomy

Trigger (48px min, padding 6, `radius-tooltip` 10): a 36px mark tile (`brand` fill, white mark 20px, radius 8; the concentric value would be 10 − 6 = 4, but the tile is an app icon and keeps its own shape, the one documented exception) · site name (`body` 600, ellipsis) over domain (`caption` `muted`) · chevron `subtle`.

Popover (see [Menu](menu-popover.md)): "All websites" first, then each site as a row with a 28px tile (`hover` fill; current site `accent-soft` + `accent-line` inset), name and domain, a live count on the right; then a separator, "Add website" and "Manage sites".

## States

Hover `hover`. Pending site (no events yet): a `waiting` StatusDot instead of the count. Collapsed rail: only the tile shows, with a tooltip.

## Keyboard and ARIA

`<button aria-haspopup="menu" aria-expanded>`; items are `menuitemradio` with `aria-checked` on the current site. Typeahead by name.

## Tokens

`brand`, `on-brand`, `hover`, `accent-soft`, `accent-line`, `fg`, `muted`, `subtle`, `radius-tooltip`, `radius-control`.

## Port from

`proto: css/app.css` `.switcher`, `.site-mi` (lines 160-165, 491-495); `lib: shell/team-menu.tsx` (layout and placement; rebuild on Radix).
