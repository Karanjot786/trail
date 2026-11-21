# CodeBlock

Install snippets, API calls, MCP configs, docs examples.

## Anatomy

```
figure.code (code-bg, 1px border, radius-popover 12, overflow hidden)
├─ head (40px, padding 0 6px 0 14px, 1px border below): file name or language (mono 12, muted) · [tabs?] · CopyButton
└─ pre (padding 14px, code: 13 / 1.65 mono, code-fg, overflow-x auto, tab-size 2)
```

Without a head (inline snippets), the CopyButton sits at `top: 8px; right: 8px` and the pre gets `padding-right: 48px`.

Syntax colours (tokens, both themes): comment `code-comment`, keyword `code-keyword`, string `code-string`, everything else `code-fg`. Code stays dark on paper and on Blue Ground (`code-bg` is navy ink there). Highlighted lines: a 2px `accent` inset bar on the start edge + `accent` at 14% fill. Docs (Shiki): map the Shiki theme colours to the same tokens.

## Props

`code` (highlighted HTML or tokens), `copy` (the plain string the button copies; required when `code` is HTML), `title`, `lang`, `tabs` (`{ label, code, copy }[]` for per-framework snippets), `highlight` (line numbers), `wrap` (default false in docs, true in marketing windows).

## Behaviour

- Long lines scroll horizontally in docs and product; marketing windows wrap (`overflow-wrap: anywhere`).
- Tabs use the [Tabs](tabs-segmented.md) component at 36px with the `fg` underline.
- Real values are filled in (host, site ID) when known; placeholders are written `<SITE_ID>` and highlighted.
- Inline code: `raised` fill, `radius-tag`, mono at `calc(1em - 1px)`, `fg`.

## ARIA

`<figure>` with a `<figcaption>` for the title; `pre` is focusable (`tabindex="0"`) when it scrolls, with `aria-label="Code: install"`.

## Tokens

`code-bg`, `code-fg`, `code-comment`, `code-keyword`, `code-string`, `border`, `muted`, `accent`, `raised`, `radius-popover`, `radius-tag`, `type-code`, `font-mono`.

## Port from

`site: components/site/CodeBlock.astro`, `styles/ui.css` `.code`, `.code-head`; `proto: js/settings.js` `codeBlock()`, `css/app.css` `.code` (line 736); `docs: styles/code.css` (Shiki selectors).
