# Input

Text fields, selects built on native `<select>` styling, textareas, checkboxes, radios and the switch.

## Anatomy

`label` (`label`, `muted`) above → field (`[icon] input [suffix]`) → helper or error line (`caption`).

## Props

`label` (required, may be visually hidden), `hint`, `error`, `size` (`md` 34, `lg` 40), `icon`, `suffix`, `disabled`, plus native input props.

## Look

| Part | Token |
|---|---|
| Field fill | `bg` inside panels (a well), `surface` on the page |
| Edge | 1px `border-strong`; `control` under `prefers-contrast: more` |
| Focus | Edge turns `ring`, plus the ring outline at offset 0 |
| Text / placeholder | `fg` / `subtle` |
| Error | Edge `danger`, message `danger` with a warn icon |
| Radius | `radius-control` |
| Size | 14px (`body`); 16px on `(pointer: coarse)` so iOS does not zoom |

Checkbox and radio: 16px, 1.5px `control` edge (3:1), checked fill `accent` with a white check, radius 4 (checkbox). Switch: 36 x 22 pill, off track `control`, on track `accent`, 16px white knob moving 14px in 200ms `--ease-out`.

## States

rest, hover (edge `control`), focus, filled, invalid, disabled (opacity .5), read-only (no edge, `raised` fill).

## Keyboard and ARIA

Native controls. `aria-invalid="true"` and `aria-describedby` pointing at the error. Errors validate inline on blur, not on every keystroke. Switch is `role="switch"` with `aria-checked`. Values survive a failed submit.

## Do / don't

- Do keep a visible label for every field outside the search pattern.
- Do keep the error line's space reserved so the form does not jump.
- Don't use placeholder text as the label.
- Don't make inputs smaller than 16px text on phones.

## Port from

`proto: css/app.css` `.input`, `.field`, `.switch` (lines 444-470, 755-765), `.add-site` and `.token-form` (v3 forms). `lib: ui/input.tsx`, `ui/field.tsx`, `ui/checkbox.tsx`, `ui/switch.tsx` (structure only; drop react-aria). `web: components/GoalDialog.tsx` (aria-invalid pattern).
