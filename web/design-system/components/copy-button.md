# CopyButton (the one implementation)

Replaces four: the landing `.copy` (1600ms, blur swap), the docs Shiki button (1500ms, VitePress icons), the docs hero and page-header copies (scale .8, 150ms) and the dashboard `.icon-swap` (scale .25, blur 4px, 200ms).

## Spec

- 32 x 32 (44 on coarse pointers), `radius-row` (6), no border, transparent; icon 16px `muted`.
- Hover `hover` fill, `fg`. Press `scale(.94)`.
- Two stacked icons: copy and check. On success, copy leaves to `scale(.6)` + `blur(2px)` + opacity 0; check arrives from `scale(.6)` + opacity 0 to `scale(1)`, in `success`, stroke 2.2. 180ms `--ease-out`. Reduced motion: opacity only.
- Returns to idle after `--duration-copy-reset` (1600ms). A second click during success copies again and restarts the timer.
- Copies with `navigator.clipboard.writeText`; falls back to a hidden textarea + `execCommand('copy')`; never rejects unhandled. On failure the icon stays and a toast says "Could not copy. Select the text and press ⌘C."

## Props

`text` (string) **or** `from` (element id whose `textContent` is copied), `label` (what is copied: "Copy install command"), `size` (`sm` 28 | `md` 32), `onCopied`.

## ARIA

`<button type="button" aria-label="Copy install command">`. On success the label becomes "Copied" and a polite live region announces "Copied". Never moves focus.

## Reference implementation (framework-free)

```html
<button class="copy" type="button" data-copy="npm i trail" aria-label="Copy install command">
  <svg class="i cp" aria-hidden="true"><use href="#i-copy"/></svg>
  <svg class="i ok" aria-hidden="true"><use href="#i-check"/></svg>
</button>
```

```css
.copy { position: relative; display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--radius-row); color: var(--muted);
  transition: background-color var(--motion-hover), color var(--motion-hover), transform var(--motion-press); }
.copy svg { position: absolute; transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out), filter 180ms var(--ease-out); }
.copy .ok { opacity: 0; transform: scale(.6); color: var(--success); stroke-width: 2.2; }
.copy[data-state="copied"] .cp { opacity: 0; transform: scale(.6); filter: blur(2px); }
.copy[data-state="copied"] .ok { opacity: 1; transform: none; }
.copy:active { transform: scale(.94); }
@media (hover: hover) and (pointer: fine) { .copy:hover { background: var(--hover); color: var(--fg); } }
@media (pointer: coarse) { .copy::after { content: ''; position: absolute; inset: -6px; } }
@media (prefers-reduced-motion: reduce) { .copy svg { transform: none !important; filter: none !important; } }
```

```js
const RESET = 1600, timers = new WeakMap();
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy], [data-copy-from]');
  if (!btn) return;
  const text = btn.dataset.copy ?? document.getElementById(btn.dataset.copyFrom)?.textContent ?? '';
  try { await navigator.clipboard.writeText(text); }
  catch { const t = Object.assign(document.createElement('textarea'), { value: text }); t.style.cssText = 'position:fixed;opacity:0'; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
  const label = btn.dataset.label ??= btn.getAttribute('aria-label');
  btn.dataset.state = 'copied'; btn.setAttribute('aria-label', 'Copied'); announce('Copied');
  clearTimeout(timers.get(btn));
  timers.set(btn, setTimeout(() => { delete btn.dataset.state; btn.setAttribute('aria-label', label); }, RESET));
});
```

React: the same markup in `<CopyButton text label />` with a `useState('idle'|'copied')`. VitePress: replace the default Shiki copy button by mounting this component into each code block (theme `enhanceApp`), and point `--vp-code-copy-*` at the tokens (already in `dist/vitepress.css`).

## Tokens

`muted`, `fg`, `hover`, `success`, `radius-row`, `motion-hover`, `motion-press`, `ease-out`, `duration-copy-reset`.

## Port from

`site: components/site/CopyButton.astro`, `scripts/copy.ts`, `styles/ui.css` `.copy` (the base of this spec); `proto: js/ui.js` `copy()` + `legacyCopy()` (fallback).
