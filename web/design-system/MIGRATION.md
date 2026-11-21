# Migration: current values → tokens

Every value in the inventory (`docs/design/2026-11-20-design-tokens-inventory.md`) and in prototype D v3, mapped to its token, so the build phase can apply it with search and replace. File abbreviations follow the inventory (`bg.css` = `site/src/styles/blue-ground.css`, `dash/index.css` = `web/src/index.css`, `docs/*.css` = `site/docs/.vitepress/theme/styles/*.css`). "→ role" means the CSS variable `--role` (Tailwind: `bg-role`, `text-role`, `border-role`).

## Decisions

| Inconsistency | Was | Now |
|---|---|---|
| Three focus rings | Landing yellow `#ffd23f` 2px/offset 3 (1.37:1 on paper); docs `#4aa3ff` offset 2; dashboard `ring-2` `#3b82f6` box-shadow | **One:** `outline: 2px solid var(--ring); outline-offset: 2px` in `dist/base.css`. `--ring` = `#6aa8ff` dark, `#0a63d1` light, white on Blue Ground. Yellow is goals only |
| Three greys (subtle) | `#8a8a8a` landing, `#8c8c8c` docs, `#707070` dashboard (4.24:1, fails), plus `#8f8f8f` ticks and docs `--prose #c7c7c7` | **One scale:** `fg` / `muted` / `subtle`, every step ≥ 4.5:1 on every surface. Dark `#ededef / #a8a8b0 / #909099`; light `#06142e / #3a4a66 / #56667f` |
| Three link blues | `#6cb2ff`, `#4aa3ff`, `#3b9eff` (+ hard-coded `#6cb2ff`) | **One:** `--link` = `#6aa8ff` dark, `#0753b8` light, white (underlined) on Blue Ground |
| Two ease-outs | `--ease-out (.23,1,.32,1)` landing; dashboard `--ease-out (.2,.8,.2,1)` and `--ease-ui (.23,1,.32,1)`; docs `--ease`; proto `--ease-ui (.2,0,0,1)` | **One:** `--ease-out` = `cubic-bezier(.23, 1, .32, 1)`. Plus `--ease-in-out` (movement) and `--ease-drawer` (sheets) |
| Four copy buttons | Landing `.copy` (1600ms, blur 2px); docs Shiki (1500ms); docs hero + page header (scale .8, 150ms); dashboard `.icon-swap` (scale .25, blur 4px, 200ms) | **One:** [components/copy-button.md](components/copy-button.md): 32px, scale .6 + blur 2px swap, 180ms `--ease-out`, reset 1600ms, live "Copied" |
| Three marks | Landing 4th dot opacity .6; docs 4th dot `--accent`; kit all solid | **One:** four solid shapes in `currentColor` (`brand/trail-mark.svg`) |
| Black vs near-black | Docs and dashboard `#000` | Trail black `#0b0b0c` canvas, `#121214` panels (decided in proto D v2) |
| Primary button | White pill / blue pill (landing), `--accent` with no hover (docs), `#ededed` box (dashboard) | One `Button` with `variant="primary"`: `--primary` resolves per theme (near-white on dark, blue on paper, white on Blue Ground) with a real hover |
| Namespaces | `--bg/--card/--line` (docs), `--ui-*` + `--blue/--ink/--rule` (landing), `--color-*` (dashboard) | One set of role names. Tailwind gets them as `--color-<role>` via `@theme inline` |
| Fonts | Landing self-hosts `Geist/GeistMono/Doto`; docs and dashboard use Fontsource `Geist Variable` | Everyone loads `dist/fonts.css` (same files, names and fallback). Remove `@fontsource-variable/geist*` |
| Uppercase labels | Docs sidebar, dashboard column heads, landing `.cols` uppercase | Sentence case in product and docs; uppercase only for the marketing `kicker` |
| theme-color | `#0a72ef` landing, `#000000` docs and kit | `#0a72ef` on Blue Ground pages; `#0b0b0c` dark / `#f6f9fe` light (media) on docs and dashboard; manifest `#0b0b0c` |

## 1. Colour

### 1.1 Landing, paper (`bg.css`; the page gets `data-theme="light"`)

| Was | Value | → Token |
|---|---|---|
| `--paper` | `#f6f9fe` | `bg` |
| `--ink` | `#06142e` | `fg` (text), `inverse` (fills), `raised` in blue-ground |
| `--ink-2` | `#3a4a66` | `muted` |
| `--blue` | `#0a72ef` | `primary` / `brand` (light); `bg` (blue-ground) |
| `--deep` | `#0753b8` | `link`, `accent-text` (eyebrows), `primary-hover` (light); `surface` (blue-ground) |
| `--dot` | `#f5f8ff` | `primary-hover` (blue-ground: `#f6f9fe`) |
| `--mist` | `#dce7fb` | `tint` |
| `--signal` | `#ffd23f` | `goal-fill` (fills behind ink), `goal` (marks on blue/dark only) |
| `--rule` | `#c9d7f0` | `border-strong` |
| `--field` | `#e8effc` | delete (no consumer) |
| `#fff` card / window / segmented bg | | `surface` |
| `#d3e0f5` Bento border | | `border` (`#dbe5f6`) |
| `#b6ccef` Bento border hover | | `border-strong` (`#c9d7f0`) |
| `#cddcf7` FAQ circle hover | | `press` (`#dbe5f6`) |
| `#eaf2fe` selected tool chip | | `accent-soft` |
| `#45577a` legend `dt` | | `muted` |
| `#4e5f7d` `.purl`, finder header | | `subtle` |
| `#0b7a3b` green on white | | `success` (`#13794a`) |
| `#c5d0e3` legend divider | | `border-strong` |
| `#eef3fa` / `#dbe4f1` / `#c4d0e3` / `#e3e9f3` finder chrome | | `raised` / `border` / `border-strong` / `hover` |
| Hero gradient `#0a72ef, #0a6ae2 60%, #0650b0` | | `bg` → `bg-subtle` 60% → `surface` (blue-ground) |
| Journey gradient `#0a72ef, #0866dc` | | `bg` → `press` (blue-ground) |
| Header scrim `rgb(7 60 150 / .3 … 0)` | | `scrim` (blue-ground) for the top stop; keep the stop ladder in the component |
| Header frosted `rgb(246 249 254 / .78)` | | `glass` (light) |
| Dot grids `rgb(255 255 255 / .13–.22)` | | keep as component literals (texture), documented in brand.md |

### 1.2 Landing, product windows (`bg.css --ui-*`, `ui.css`; windows get `data-theme="dark"`)

| Was | Value | → Token (dark) |
|---|---|---|
| `--ui-bg` | `#000` | `bg` (`#0b0b0c`) |
| `--ui-card` | `#0a0a0a` | `surface` (`#121214`) |
| `--ui-raised` | `#111` | `raised` |
| `--ui-bar` | `#141414` | `chart-track` (goal bars) |
| `--ui-border` / `--ui-border-strong` | `#1f1f1f` / `#2e2e2e` | `border` / `border-strong` |
| `--ui-fg` / `--ui-muted` / `--ui-subtle` | `#ededed` / `#a1a1a1` / `#8a8a8a` | `fg` / `muted` / `subtle` |
| `--ui-good` / `--ui-good-bg` | `#45d483` / `#0f2417` | `success` / `success-bg` |
| `--ui-link` | `#6cb2ff` | `link` |
| `#0d1f3a` event chip (`ui.css:8`, `.sample`) | | `accent-soft` + `accent-line` edge, text `fg` |
| `#cfe4ff` `.sample` text | | `fg` |
| `#1c1c1c` copy hover | | `hover` |
| `#04122b` `.term`, `#020b1c` SelfHost terminal, `#050505` json | | `code-bg` (a terminal on Blue Ground is navy `#06142e`) |
| `#e8f0ff` / `#9cc4ff` / `#a9bde0` / `#8ea6cf` / `#7ee2a8` terminal text / prompt / dim / dim / highlight | | `code-fg` / `code-keyword` / `code-comment` / `code-comment` / `code-string` |
| `.code .c #8a8a8a` / `.k #6cb2ff` / `.s #b8e3c7` | | `code-comment` / `code-keyword` / `code-string` |
| `#0b0b0c` MCP conversation | | `bg` |
| `#1d2a3d` user chat bubble | | `accent-soft` |
| `#111` / `#232323` call row | | `raised` / `border` |
| `#ff8a8c` on `#2a0f10`, edge `#3a1a1b` (reject chip) | | `danger` on `danger-bg`, no edge |
| `#f5c451` on `#1f1806`, edge `#5a4512` (amber) | | `warn` on `warn-bg`, no edge |
| `.reached` ink on `--signal` | | `on-goal-fill` on `goal-fill` |
| Tabs `.on` underline `#fff` | | `fg` |
| `.lights` `rgb(255 255 255 / .2)` | | keep (window chrome literal) |
| DevTools mock `#282828 #3c3c3c #16304f #9aa0a6 #c4c7c5 #e8eaed #7cacf8` (`Privacy.astro`) | | keep as literals: they depict a third-party UI, not Trail's |

### 1.3 Docs (`tokens.css`, `docs/vars.css`, `docs/*.css`; replace with `dist/vitepress.css`)

| Was | Value | → Token |
|---|---|---|
| `--bg` | `#000` | `bg` |
| `--card` | `#0a0a0a` | `surface` (code block → `code-bg`) |
| `--raised` | `#121212` | `raised` |
| `--line` / `--line-strong` | `#1f1f1f` / `#2e2e2e` | `border` / `border-strong` |
| `--fg` / `--muted` / `--subtle` | `#ededed` / `#a1a1a1` / `#8c8c8c` | `fg` / `muted` / `subtle` |
| `--prose` (`doc.css:9`) | `#c7c7c7` | `fg` |
| `--accent` | `#0a72ef` | `accent` (sidebar bar, highlighted line), `primary` (buttons) |
| `--link` | `#4aa3ff` | `link` |
| `--good` / `--good-bg` | `#45d483` / `#0f2417` | `success` / `success-bg` |
| `--event-bg` | `#0c1f3d` | `accent-soft` |
| inline code bg (`code.css:7`) | `#0f0f0f` | `raised` |
| callout warning (`doc.css:172`) | `#f5a524` | `warn` (+ `warn-bg`) |
| callout danger/caution (`doc.css:175`) | `#e5484d` | `danger` (+ `danger-bg`) |
| callout details | `var(--subtle)` | `subtle` |
| `--gh-bg` / `--gh-bg-hover` | `#161616` / `#1f1f1f` | `raised` / `hover` |
| `--gh-star-bg` | `rgb(255 255 255 / .08)` | GitHub button component literal |
| `--gh-edge` | `inset 0 0 0 1px #2e2e2e` | `inset 0 0 0 1px var(--border-strong)` |
| `--chrome-fg` / `--chrome-muted` | | `fg` / `muted` (landing hero state: blue-ground `fg`) |
| `--vp-button-brand-*` all `--accent` | | `primary` / `primary-hover` / `on-primary` (already in `vitepress.css`) |
| `--vp-c-brand-soft` | `--event-bg` | `accent-soft` |
| `--vp-code-tab-active-bar-color` | `--accent` | `fg` |
| `--vp-code-line-highlight-color` | accent 12% | accent 14% (in `vitepress.css`) |
| Docs nav `color-mix(--bg 82%)` + blur | | `glass` |

### 1.4 Dashboard today (`dash/index.css` `@theme`; replace the block with `dist/tailwind.css`)

| Was | Value | → Token / utility |
|---|---|---|
| `--color-bg` | `#000` | `bg` |
| `--color-card` | `#0a0a0a` | `surface` (`bg-card` → `bg-surface`) |
| `--color-raised` | `#111111` | `raised` |
| `--color-bar` | `#141414` | `chart-track` |
| `--color-hover` | `#1c1c1c` | `hover` |
| `--color-border` / `--color-border-strong` | `#1f1f1f` / `#2e2e2e` | `border` / `border-strong` |
| `--color-fg` / `--color-muted` / `--color-subtle` | `#ededed` / `#a1a1a1` / `#707070` | `fg` / `muted` / `subtle` |
| `--color-ring` | `#3b82f6` | `ring` (and `focus-visible:ring-2` → delete; base.css draws the outline) |
| `--color-chart` | `#0a72ef` | `chart-1` (lines), `chart-bar` (bars) |
| `--color-link` | `#3b9eff` | `link` |
| `--color-good` / `--color-good-bg` | `#45d483` / `#0f2417` | `success` / `success-bg` |
| `--color-bad` / `--color-bad-bg` | `#ff4d4f` / `#2a1215` | `danger` / `danger-bg` |
| `#1d2a3d` active bar (`BarRow.tsx:42`) | | `accent-soft` |
| `#070707` selected-tab hover (`KpiTabs.tsx:68`) | | `hover` |
| `#0d1f3a` + `#6cb2ff` event chip (`JourneyView.tsx:115`) | | `accent-soft` + `accent-line`, text `fg` |
| `#0f0f0f/95` hover pill (`Panel.tsx:111`) | | `raised` + `elevation-pop` |
| `#3b3b3b` input focus border (`GoalDialog.tsx:163`) | | `ring` |
| `#ff6163`, `#ff6668`, `#ff4d4f` error text | | `danger` |
| amber `#f5c451 / #1f1806 / #5a4512` (`InstallPanel.tsx`) | | `warn` / `warn-bg` / none |
| Chart `BLUE #0a72ef` (`MainChart.tsx:7`) | | `cssVar('chart-1')` |
| Chart grid `#1f1f1f` | | `border` |
| Chart ticks `#8f8f8f` size 13 | | `subtle`, `micro` (11/500) |
| Chart cursor `#3a3a3a` | | `muted` hairline |
| Area fill opacity .08 | | remove (lines only) |
| Incomplete bucket dash `4 4` | | dotted `2 4`; previous period `4 3` in `chart-prev` |

### 1.5 Prototype D v3 (`proto: css/app.css`) → tokens

| Proto | → Token |
|---|---|
| `--bg --surface --raised --hover --press --fg --muted --subtle --link --ring --brand --on-brand --primary --on-primary --primary-hover --code-bg --scrim --glass` | same names |
| `--side` | `bg-subtle` |
| `--line` / `--line-strong` | `border` / `border-strong` (light `#dbe4f3` → `#dbe5f6`) |
| `--blue` / `--blue-soft` / `--blue-line` | `accent` / `accent-soft` / `accent-line` |
| `--bar` / `--track` / `--prev` | `chart-bar` / `chart-track` / `chart-prev` |
| `--cat-1..4` | `chart-1..4` |
| `--signal` / `--on-signal` / `--signal-soft` | `goal-fill` / `on-goal-fill` / `color-mix(in srgb, var(--goal-fill) 14%, transparent)` |
| `--goal` / `--goal-stroke` / `--goal-soft` | `goal` / `goal-stroke` / (light ring fill: `color-mix(in srgb, var(--goal) 14%, transparent)`) |
| `--good` / `--good-bg` / `--bad` / `--bad-bg` / `--warn` / `--warn-bg` | `success` / `success-bg` / `danger` / `danger-bg` / `warn` / `warn-bg` |
| `--heat-0` dark `#18181b` | `heat-0` (`#19191c`) |
| `--heat-lo` / `--heat-hi` | `heat-1` / `heat-5` (steps 2–4 added) |
| `--heat-zero-line` | `heat-zero-line` |
| `--shadow-pop` / `--shadow-sheet` | `elevation-pop` / `elevation-sheet` |
| `--sans` / `--mono` / `--dots` | `font-sans` / `font-mono` / `font-dots` |
| `--ease-out` / `--ease-drawer` | same |
| `--ease-ui (.2,0,0,1)` | `ease-out` |
| `--r-ctl 8` / `--r-panel 14` / `--r-row 6` | `radius-control` / `radius-panel` / `radius-row` |
| `--fs-xs 12` / `--fs-sm 13` / `--fs-base 14` / `--fs-md 14` / `--fs-lg 17` / `--fs-xl 20` / `--fs-stat 28` | `text-caption` / `text-small` / `text-body` / `text-body` / `text-title` (18) / `text-heading` / `text-stat` |
| `--side-w 252` / `--side-wc 64` | `layout-rail` / `layout-rail-collapsed` |
| `.switch` off `--line-strong` | `control` |
| `.code` light text `#e8f0ff`, comment `#8ea6cf`; dark comment `#9a9aa3` | `code-fg` (`#eef3fb`) / `code-comment` |
| `.code .copy` | CopyButton |
| hard-coded `#fff` switch knob, `#fff` on checked checkbox | keep (always on a coloured fill) |

## 2. Typography

Families: `Geist`, `'Geist Fallback'`, `GeistMono`, `Doto` from `dist/fonts.css` everywhere; `'Geist Variable'` → `Geist`, `'Geist Mono Variable'` → `GeistMono`.

Weights: 400 → 400; 450 (inline code) → 400; 500, 520, 540 → 500; 560, 580, 600, 620, 700 (`.g` glyph) → 600; 800 (decimal point) → 600 Geist Mono; 900 → 900 Doto only.

| Surface | Was | → Role |
|---|---|---|
| Landing | body 18/1.5 (17 phone) | `lead` |
| | `.lede` 19/1.5, hero lede | `lead` (measure 34em stays) |
| | h2 `clamp(34,4.2vw,52)` −.034em; CTA h2 `clamp(36,4.4vw,58)` | `display-md` |
| | hero h1 `clamp(44,5.3vw,74)` /1.01 620 −.04em | `display-lg` (600, leading 1.04) |
| | h3 20/1.25 580; Bento h3 20; HowItWorks h3 21 | `heading` |
| | Bento hero-card h3 30 (26 phone) | `stat` size with `heading` tracking |
| | kicker / `.lbl` 12 600 .08em uppercase | `kicker` |
| | `.btn` 15.5 (15 phone) 560 | 16 / 500 (marketing button) |
| | nav link 15 500 −.005em; footer links 15 | 16 / 500 |
| | `.brand` 19 620 −.01em | `title` |
| | foot meta 14/1.5; repo link 13 mono | `body`; mono `small` |
| | FAQ q 19/540; answer 17 | `lead` 500; `lead` |
| | Bento body 15.5/1.5 (hero 17, note 13.5) | `prose` size with `body` leading 1.5; note `small` |
| | product windows: base 14/1.4, chips 14, tabs 13.5, window bar 13.5, `.cols` 11.5 uppercase | `body`; `small`; `small`; `small`; `label` sentence case |
| | code 12.5/1.65, `.cmd` 13, `.inst` 11.5/1.7, terminal 13/1.7 | `code` (13/1.65); install 12 mono `caption` leading |
| | Doto hero 44, numbers 54 / 40, self-host 40 | `numeral` |
| | waypoint chip 13 mono; legend 12.5 mono, title 13.5 600 | `small` mono; `caption` mono, `small` 600 |
| | `.who` 20 600 −.02em; `.badge` 12 500 | `heading`; badge (`label`) |
| Docs | body 16/1.7 `ss01` | `prose` (`ss01` now global) |
| | h1 36/40 −.025em; DocsHero h1 40/44 | `display-sm` |
| | h1+p lede 18/30; tagline 17/28 | `lead` |
| | h2 24/32 −.015em | `heading-lg` |
| | h3 18/28 −.01em | `title` |
| | table 14/22; th 13 500 | `body`; `small` 500 |
| | callout 15/24; title 14 600 | `body`; `body-strong` |
| | inline code .85em 450 | mono `calc(1em - 1px)` 400 |
| | code block 13.5/22 (13/20 < 640) | `code` |
| | sidebar group 12/32 500 uppercase .06em | `label`, sentence case |
| | sidebar link 14/20; outline 13; outline title 12 uppercase | `body`; `small`; `label` |
| | search 14, kbd 11 | `body`; kbd (`label`) |
| | pager title 15 / desc 12; breadcrumb 13; feedback 14 / 13 | `body-strong` / `caption`; `small`; `body` / `small` |
| Dashboard | KPI value `text-[28px] sm:text-[44px]` 600 −.03em | `text-stat` (28 at every width, 22 on phones) |
| | KPI label `text-sm sm:text-base` 500 | `text-small` + `font-medium` |
| | delta `text-xs sm:text-[13px]` | DeltaPill (`label`) |
| | `text-[15px]` tabs, rows, inputs, selects | tabs `text-small`; rows and inputs `text-body` (16 on coarse) |
| | column labels `text-[13px]` 500 uppercase .02em | `text-label`, sentence case |
| | `text-sm` body | `text-body` |
| | page title `text-xl` 600 −.02em | `text-title` |
| | header stat `text-2xl` 600 | `text-stat` |
| | help `text-[13px] leading-5` | `text-small` |
| | code `text-[12.5px] leading-[1.6]`; filename `text-[12px]` | `text-code`; `text-caption` mono |
| | inline code `text-[12px]` | mono `calc(1em - 1px)` |
| | empty title `text-[15px] font-semibold` | `text-body-strong` |

## 3. Spacing, layout and heights

| Was | → Token |
|---|---|
| Landing `--gut 56px` (16 < 700) | `layout-marketing-gutter` (56) / `layout-gutter-phone` (16) |
| `--wrap-w 1240` | `layout-marketing-wrap` |
| `--head-h 72` | `layout-header-marketing` |
| `.sec` 128 / 88 | `layout-section-y` / `layout-section-y-phone` |
| `.head` gap 18, mb 56/36 | gap `space-16`; below `space-56` / `space-32` (36 is off-grid) |
| Bento gap 24, rows 384; card padding 28 (36/40 hero, 24 phone) | `space-24`; 384 stays a component literal; `space-28` (`space-40`, `space-24`) |
| Docs `--gutter 24` (32 at 48rem) | `layout-gutter` (`space-32`) |
| `--vp-nav-height 64`, `--vp-sidebar-width 272`, content 720 | `layout-docs-nav`, `layout-docs-sidebar`, `layout-docs-content` |
| Dashboard panel header `h-16` (64) | 48 (proto `panel-h` min 48) |
| Dashboard panel body `sm:h-[304px]` | removed; panels pair by height |
| Dashboard heights `h-8 h-9 h-10` (32 / 36 / 40) | `layout-control-md` (34) for 32 and 36; `layout-control-lg` (40) for 40 |
| Landing chips 28, tabs 40, `.wbar` 44, `.bar` 42, `.plist` 44, feed 46 | windows: chip 24 (28 kept in marketing windows), tabs 42, window bar 44, row 40, table row 44 |
| Odd gaps 18, 22 (landing windows) | 16 / 20 / 24 |
| Header links 44, footer links 44, `.segc` 44 | `layout-target-min` |

## 4. Radius

| Was | Where | → Role |
|---|---|---|
| 3px | dashboard `rounded-[3px]`, heat cells | `cell` |
| 4px | `.reached`, `.t`, legend boxes, `rounded` | `tag` |
| 5px | docs inline code, kbd; proto kbd | `tag` |
| 6px | landing chips, `.copy`, `.sid`, `.badge`, tabs2; docs `.copy`, menu items; `rounded-md` | `row` |
| 7px | docs split-button inner, proto note chip / textbtn | `row` |
| 8px | `.back`, `.check`, `.brand`, nav links, docs code blocks / search / buttons; `rounded-lg`; proto `.pop .mi` | `control`; menu items → `row` (concentric) |
| 9px | proto switcher mark, cmdk item | `control` / `tooltip` (cmdk item, concentric 16 − 6) |
| 10px | `.callrow`, docs tables / callouts / images / pager / menu; proto tip, switcher, banners | `tooltip`; docs tables and images → `popover` |
| 12px | `.ui`, `.code`, windows, docs run card, features grid; `rounded-xl`; proto pop, code, ctip | `popover` |
| 14px | `.jv`; proto `--r-panel` | `panel` |
| 16px | `.you`; `rounded-2xl`; proto sheet, dialog, cmdk | `overlay` |
| 20px | Bento card, `.flow` | `card` |
| 22px | CTA band on phones | `card` |
| 28px | CTA `.band` | `band` |
| 999px | `.btn`, `.gh`, `.segc`, badges; `rounded-full` | `pill` |
| `:focus-visible { border-radius: 6px }` | landing, docs, proto | delete (the ring follows the element) |

## 5. Shadows and depth

| Was | → Token |
|---|---|
| `.ui` window (`ui.css:3`) | `elevation-pop` in `blue-ground` |
| `.lift`, `.fshot .win`, `.jcard`, `.convo`, `.twin`, `.finder`, `.upcard`, `.idsat` | `elevation-sheet` of the ground they sit on (`blue-ground` on blue, `light` on paper) |
| Bento panel | `elevation-pop` (blue-ground) |
| Bento card hover `0 24px 48px -28px rgb(7 40 100 / .4)` | component literal (marketing card hover) |
| `.jlegend` hard `6px 6px 0 rgb(6 20 46 / .35)` | component literal (legend) |
| `.segc` `0 1px 2px rgb(7 40 100 / .06)` | delete (border only) |
| Header frosted shadow | component literal (marketing header) |
| GitHub pill shadows | GitHub button spec |
| Docs menu `0 12px 32px rgb(0 0 0 / .5)`; dash dropdown / select / toast / filter pill `0 8px 30px /.6`; dash hover pill `0 4px 20px /.6`; dash tooltip `shadow-lg` | `elevation-pop` (`shadow-pop`) |
| Docs search `0 24px 64px …`; dash dialog `0 20px 60px /.7` | `elevation-sheet` (`shadow-sheet`) |
| Dash seg thumb `inset 0 0 0 1px rgb(255 255 255 / .06)` | `inset 0 0 0 1px var(--border-strong)` |
| `backdrop-filter` header blurs 18px / 12px / 14px | marketing header 18px (component); docs and dashboard `glass` + 14px |
| Content-swap blur 2px / 4px | 2px (CopyButton recipe) |

## 6. Motion

| Was | → Token |
|---|---|
| `--ease-out` landing, `--ease` docs, `--ease-ui` dash, JS `EOUT`, docs `motion.ts` const | `--ease-out` (`easing.out` in `tokens.ts`) |
| `--ease-io` landing, JS `EIO` | `--ease-in-out` |
| dash `--ease-out (.2,.8,.2,1)`, icon swap `(.2,0,0,1)`, proto `--ease-ui` | `--ease-out` |
| `ease`, `ease-out` keywords on colour transitions | `--motion-hover` |
| 100ms | `--motion-exit` |
| 120ms (press, reduced fades) | `--motion-press` |
| 125 / 140 / 150 / 160ms (tooltip, hover, pop-in, pressable, `.btn`) | `--motion-tooltip` (125) for tooltips; `--motion-hover` / `--motion-popover` (150) for the rest |
| 180ms (copy swap, docs page enter) | CopyButton 180 literal; page enter `--motion-popover` |
| 200 / 220ms (modal, toast, header fade, seg thumb) | `--motion-dialog` / `--motion-toast` (200); seg thumb `--motion-move` |
| 240 / 260 / 280ms (disclose, FAQ open, `.segc` thumb, status-in) | `--motion-disclose` / `--motion-move` (240) |
| 300 / 320ms (`.wpt`, sheet) | `--motion-sheet` (320) for sheets; marketing literals stay |
| 600 / 700ms reveal | `--motion-reveal` |
| 1600ms / 1500ms copy reset | `--duration-copy-reset` |
| Press scale `.97` (landing, docs), `.96` (dash `.pressable`), `.99` (docs search trigger) | `.97`; icon buttons and copy `.94` |
| Icon swap `scale(.25) blur(4px)` (dash), `scale(.8)` (docs) | CopyButton recipe (`.6`, `blur(2px)`) |
| Dash reduced motion blanket `transition-duration: .01ms !important` | delete; movement is opt-in per component (`no-preference`), opacity stays |
| Sidebar collapse width transition (library 300ms) | none (snap; labels fade 150ms) |

## 7. Focus, targets, icons, brand

| Was | → Now |
|---|---|
| `:focus-visible{outline:2px solid var(--signal);outline-offset:3px;border-radius:6px}` (`base.css:12`) | `dist/base.css` rule |
| `--head-focus` (`SiteHeader.astro`) | delete; the ring takes `--ring` from the section's theme |
| docs `:focus-visible` (`docs/base.css:15-19`) and per-component offsets | `dist/base.css`; inset cases add `.ring-inset` |
| dash `focus-visible:ring-2 focus-visible:ring-ring` (25 uses), `ring-inset` on tabs, `ring-ring/60`, `ring-bad/40` | delete the classes; tabs add `ring-inset`; invalid inputs use `aria-invalid` + `border-danger` |
| Icon stroke 1.75 (landing), 2 (lucide default), 1.5 / 1.75 / 2 (dash) | 1.6 everywhere; 2.2 for 12px glyphs in pills |
| Inline GitHub path in `GitHubButton.astro`, `SiteFooter.astro`, `TrailNavBar.vue`, `TrailFooter.vue`; inline star in `TrailNavBar.vue` | sprite symbols `#i-github`, `#i-star` |
| Mark: `SiteHeader.astro:16` 4th dot opacity .6; `TrailNavBar.vue:24`, `TrailFooter.vue:17` 4th dot `--accent` | `brand/trail-mark.svg` shapes, all `currentColor` |
| App icon tile `#000000`, mark `#ffffff` | `#0b0b0c` tile, `#ededef` mark (`brand/trail-mark-app-icon.svg`) |
| `theme-color` (`Landing.astro:22`, `seo.ts:7`, `head-snippet.html:5`), manifests | see Decisions |

## 8. Components

| Was | → Spec |
|---|---|
| Landing `.btn .btn-white/.btn-ghost/.btn-blue`, `.acc`, `.undo`, `.fbtn` | [Button](components/button.md) (`primary`, `secondary`, `marketing` size) |
| Dash `btnPrimary`, `btnSecondary`, login submit, header CTA, icon buttons | [Button](components/button.md) |
| `GitHubButton.astro` + copied markup in `TrailNavBar.vue` | Button `variant="github"` in the shared header |
| `CopyButton.astro` + `copy.ts`; docs Shiki copy; `DocsHero.vue` `.copy`; `PageHeader.vue` split copy; dash `.icon-swap` | [CopyButton](components/copy-button.md) |
| `CodeBlock.astro`; `InstallPanel.tsx` block; docs Shiki blocks | [CodeBlock](components/code-block.md) |
| Landing `.tabs`, `.tabs2`; docs code-group tabs; dash `TabStrip` | [Tabs](components/tabs-segmented.md) |
| Landing `.segc`; dash `GoalDialog` toggle group | [SegmentedControl](components/tabs-segmented.md) |
| Landing `.chip .ev .idn .out .left .sid .badge .reached .sample`; dash delta badge, identified badge, event chip, journey chip | [Chip](components/chip.md), [Badge](components/badge.md), [DeltaPill](components/delta-pill.md) |
| Dash `FilterChips.tsx` | [FilterBar](components/filter-bar.md) |
| Dash `KpiTabs.tsx` | [KPI tile](components/kpi-tile.md) |
| Dash `MainChart.tsx` | [ChartCard](components/chart-card.md) |
| Dash `Panel.tsx` + `BarRow.tsx`; landing `.bars .bar` | [BarList row](components/bar-list-row.md) |
| Dash `VisitorsView.tsx`, `ViewAllDialog.tsx` | [DataTable](components/data-table.md), [Sheet](components/dialog-sheet.md) |
| Dash `JourneyView.tsx`; landing `.day .sess .sl` | [Journey timeline](components/journey-timeline.md) |
| Dash `ReadOnlyToast.tsx` | [Toast](components/toast.md) |
| Dash `ui/dialog.tsx`, `GoalDialog.tsx` | [Dialog](components/dialog-sheet.md) |
| Dash `ui/dropdown-menu.tsx`, `ui/select.tsx` | [Menu and Popover](components/menu-popover.md) |
| Dash `ui/tooltip.tsx` | [Tooltip and InfoHint](components/tooltip-infohint.md) |
| Dash `Header.tsx` (site menu, date select, online dot) | [Sidebar and Shell](components/sidebar-shell.md), [SiteSwitcher](components/site-switcher.md), [DateRangePicker](components/date-range-compare.md), [StatusDot](components/status-dot.md) |
| Dash `EmptyState.tsx` | [EmptyState](components/states.md) (keep its API) |
| `SiteHeader.astro`, `SiteFooter.astro`, `TrailNavBar.vue`, `TrailFooter.vue`, `chrome.css` | [Nav header and Footer](components/marketing-header-footer.md); docs footer link hover pill → underline |

## 9. Files after migration

| Delete | Replace with |
|---|---|
| `site/src/styles/tokens.css` | `dist/tokens.css` (landing) / `dist/vitepress.css` (docs) |
| `site/src/styles/blue-ground.css` | `dist/tokens.css` + `data-theme` attributes |
| `site/src/styles/fonts.css` | `dist/fonts.css` |
| `site/docs/.vitepress/theme/styles/vars.css` | `dist/vitepress.css` |
| `web/src/index.css` `@theme` block, `.pressable`, `.icon-swap`, reduced-motion blanket | `dist/tailwind.css`, `dist/base.css`, component CSS |
| `@fontsource-variable/geist`, `@fontsource-variable/geist-mono` (docs, web) | `dist/fonts.css` |

`chrome.css`, `base.css`, `ui.css`, `docs/base.css`, `docs/doc.css`, `docs/code.css`, `docs/motion.css` stay as component CSS, with every literal above replaced by its token.
