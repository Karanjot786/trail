# Nav header and Footer (marketing and docs chrome)

One component pair shared by the landing (Astro) and the docs (Vue): the same markup, the same classes, the same GitHub button. Today the HTML is copied between `SiteHeader.astro` and `TrailNavBar.vue`; after migration both render one source (an Astro component and a Vue wrapper over the same template string, or a web component).

## Header

Anatomy: brand (mark 24px + "Trail" 18/600 −0.01em, 44px tall link) · nav links · spacer · search trigger (docs only) · GitHub button.

| | Landing | Docs |
|---|---|---|
| Height | 72px (`layout-header-marketing`) | 64px (`layout-docs-nav`) |
| Position | fixed; `absolute` without JS | sticky |
| Theme | `data-state="hero"`: sits on Blue Ground, text white, a top scrim (`scrim` from the blue-ground theme fading to 0 over 64px) for 5:1 on the terrain. `data-state="solid"`: paper `glass` + `blur(18px) saturate(170%)`, ink text, shadow `0 1px 0 rgb(6 20 46/.06), 0 8px 24px -12px rgb(6 20 46/.18)` | `glass` of the docs theme, 1px `border` below |
| Ring | inherited from the section's theme (white on hero, blue on paper) | `ring` |

Nav links: 44px tall, padding `0 12px`, Geist 500 16px, `currentColor`; hover draws a 1.5px underline at offset 6px (not a pill), so the GitHub button stays the only filled shape. Current page: underline always on + `aria-current="page"`. Below 700px: secondary links hide (`hide-s`), the GitHub button becomes a 44px mark; docs show a menu button.

State switch: an IntersectionObserver on the hero (`rootMargin: -<header height>px 0 0 0`) toggles `data-state`; the frosted layer fades with `--motion-dialog`. Under `prefers-reduced-transparency` or `prefers-contrast: more` the solid state is opaque paper.

## Footer

| | Landing | Docs |
|---|---|---|
| Ground | `data-theme="blue-ground"` → `surface` (deep `#0753b8`) | `bg` with 1px `border` top |
| Content | dot-art footer word (build-time SVG, footsteps walking in once), link row, meta line | link row, meta line |

Links: 44px targets, 16px, underline on hover in both (the docs' pill hover is retired: one hover model for text links). Meta line (`foot-meta`): 14/1.5, `muted` (white on Blue Ground); repo link in mono 13. On Blue Ground the 1px divider is `border` (white at 22%).

## Keyboard and ARIA

`<header>` with `<nav aria-label="Main">`; footer `<nav aria-label="Footer">`. Skip link first in the document. The GitHub button's accessible name starts with "GitHub".

## Tokens

`fg`, `muted`, `border`, `glass`, `scrim`, `ring`, `raised`, `layout-header-marketing`, `layout-docs-nav`, `layout-marketing-wrap`, `layout-marketing-gutter`, `motion-dialog`, `type-small`.

## Do / don't

- Do keep one hover model for text links: underline.
- Don't render the mark with a faded or blue fourth dot.
- Don't add a CTA button beside the GitHub button in the header.

## Port from

`site: components/site/SiteHeader.astro`, `SiteFooter.astro`, `GitHubButton.astro`, `styles/chrome.css` (shared chrome), `lib/nav.mjs`; `docs: TrailNavBar.vue`, `TrailFooter.vue`; `site: scripts/nav.ts` (state observer).
