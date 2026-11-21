# Button

One component, five variants, two families of size. Replaces the landing `.btn-*`, the VitePress brand button (which had no hover state) and the dashboard's `btnPrimary`/`btnSecondary` class strings.

## Anatomy

`[icon?] label [trailing icon | kbd?]`. Gap 8px. Icons 16px (14px at `sm`).

## Props

| Prop | Type | Default |
|---|---|---|
| `variant` | `primary \| secondary \| ghost \| danger \| github` | `secondary` |
| `size` | `sm` (28) `md` (34) `lg` (40) `marketing` (48, 46 phone) | `md` |
| `icon`, `iconEnd` | Lucide icon | |
| `loading` | boolean: keeps width, swaps label for a spinner + "Saving…" for screen readers | false |
| `pressed` | boolean, for toggles (`aria-pressed`) | |
| `asChild` / `href` | renders an `<a>` with the same look | |

## Variants

| Variant | Rest | Hover | Text |
|---|---|---|---|
| `primary` | `primary` | `primary-hover` | `on-primary` |
| `secondary` | `surface` + 1px `border-strong` | `hover` | `fg` |
| `ghost` | transparent | `hover`, text to `fg` | `muted` |
| `danger` | `danger-bg`, 1px transparent | `danger-bg` + `danger` edge | `danger` |
| `github` | see below | | |

`primary` resolves per theme: near-white on dark, blue on paper, white on Blue Ground. One primary per view; everything else is secondary or ghost. Danger is for confirming destructive actions inside a dialog, not for the button that opens it.

Shape: product sizes use `radius-control` (8). `marketing` uses `radius-pill` and Geist 500 16px. Pressed toggles: `accent-soft` fill + `accent-line` edge.

## GitHub button

40px pill (44 x 44 mark-only on phones), padding `0 5px 0 14px`, mark 18px, label "GitHub" 500 15px, then an inset 30px star pill (5px inset keeps the radii concentric) with a 14px star and a tabular count. Colours: on Blue Ground `raised` (navy) with an inset top highlight; on dark `raised` + 1px `border-strong`; on paper `inverse`. Star icon turns `goal-fill` on hover only. Accessible name starts with the visible text: "GitHub, Star, 1,204 stars". Count hidden below 50 stars.

## States

rest, hover, active (`scale(.97)`), focus-visible (ring), pressed, loading, disabled (`opacity .5`, `cursor: not-allowed`, still focusable when it has a tooltip explaining why).

## Keyboard and ARIA

Native `<button type="button">` (or `<a>` for navigation). Enter and Space activate. Icon-only buttons are [icon buttons](#icon-button) with `aria-label`. Loading sets `aria-busy="true"`.

## Icon button

34 x 34 (`sm` 28), `radius-control`, `muted` → `fg` on hover with a `hover` fill, `scale(.94)` on press. 44px hit area on coarse pointers.

## Tokens

`primary`, `primary-hover`, `on-primary`, `surface`, `hover`, `border-strong`, `muted`, `fg`, `danger`, `danger-bg`, `accent-soft`, `accent-line`, `ring`, `radius-control`, `radius-pill`, `type-small`, `motion-press`, `motion-hover`.

## Do / don't

- Do keep the label a verb: "Add website".
- Do keep width stable while loading.
- Don't put two primary buttons side by side.
- Don't use a blue button on dark: blue is data and the active item.
- Don't add `rounded-full` to product buttons.

## Port from

`proto: css/app.css` `.btn`, `.btn-primary`, `.btn-ghost`, `.icon-btn` (lines 93-127). `site: styles/base.css` `.btn` (marketing size and press), `site: styles/chrome.css` + `components/site/GitHubButton.astro` (GitHub). `lib: ui/button.tsx`, `ui/icon-button.tsx` for the prop shape.
