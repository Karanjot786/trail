# Sidebar and Shell

The dashboard frame: a rail on the left, a sticky header and the content column.

## Anatomy

```
Shell (grid: rail | main)
├─ Sidebar (sticky, 100vh, bg-subtle, 1px border right)
│  ├─ SiteSwitcher
│  ├─ Search trigger (⌘K)
│  ├─ nav: Overview · Live · Acquisition · Activity · Conversions · Revenue* · AI crawlers
│  ├─ Views (saved views, + to save)
│  └─ footer: demo card (Blue Ground) · Settings · collapse
└─ Main
   ├─ Header (sticky, glass): title · range · compare · live pill · filter bar
   └─ Page (max 1280, gutter 24)
```

## Nav item

36px, padding `0 10px`, gap 10, `radius-control`, icon 18, `small` 500 `muted`. Hover: `hover` fill, `fg`. Current (`aria-current="page"`): `hover` fill, `fg`, and a 3px `accent` bar on the inline start edge of the rail (`left: -12px`, inset 9px top and bottom, radius `0 3px 3px 0`). A trailing count or live dot in `muted` 12px. Group labels (`label`, `subtle`).

## Collapse

252 → 64px. The grid snaps (no width transition). Labels fade over 150ms for pointer toggles only; `[` and reduced motion are instant. Items become 40px squares with a tooltip naming them (Radix Tooltip, never `title`). State persists in `localStorage` (wrapped in try/catch).

## Phone drawer

Below 960px the rail becomes a push drawer: 272px lane, main slides with `--motion-sheet` and gains a 16px radius, scrim button closes. Esc closes, focus moves in and returns to the menu button, focus is trapped, body scroll locks, the hidden drawer is `inert`.

## Header

60px (56 phone), `glass` with `backdrop-filter: blur(14px) saturate(160%)` (solid under reduced transparency), a 12px scroll-edge fade instead of a border once scrolled. Title `title`. The filter bar lives inside the sticky header and shares its 1280 column.

## Keyboard and ARIA

`<nav aria-label="Main">`, `<nav aria-label="Views">`. Skip link to `#main`. Shortcuts: `[` collapse, `G` then a letter to go to a screen, `1–7` metrics, `?` shortcuts.

## Tokens

`bg-subtle`, `border`, `hover`, `fg`, `muted`, `subtle`, `accent`, `glass`, `layout-rail`, `layout-rail-collapsed`, `layout-header-product`, `layout-content-max`, `layout-gutter`, `radius-control`, `type-small`, `z-sticky`, `z-rail`.

## Port from

`proto: css/app.css` shell and header (lines 145-216), v3 sidebar rule (line 1239); `lib: shell/sidebar.tsx`, `shell/collapsible-label.tsx` (copy as-is), `shell/app-shell.tsx` (ShellFrame push drawer; replace motion with CSS, add Esc and focus handling).
