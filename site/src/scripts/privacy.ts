// Privacy modes switcher. Port of prototype main.js 241–291. The default state is server-rendered;
// this only switches mode and consent, and keeps the tablist's ARIA in step.
import { privacy } from '../copy/landing'
import { reduceMotion, EOUT } from './reveal'

const pm = document.getElementById('pm')
if (pm) {
  const $ = <T extends Element = HTMLElement>(s: string) => pm.querySelector(s) as T
  const tabs = [...pm.querySelectorAll<HTMLButtonElement>('[role=tab]')]
  const thumb = $('.thumb')
  const panel = $('#pm-panel')
  const sayT = $('.say-t'), attr = $('.attr'), note = $('#vnote')
  const rows = [...pm.querySelectorAll<HTMLElement>('.vrow')]
  const accept = $<HTMLButtonElement>('#pm-accept'), undo = $<HTMLButtonElement>('#pm-undo')

  const soft = (n: Element, i = 0) => {
    if (reduceMotion()) return
    n.animate(
      [{ opacity: 0, filter: 'blur(2px)', transform: 'translateY(3px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }],
      { duration: 220, delay: i * 40, easing: EOUT, fill: 'backwards' },
    )
  }

  const render = () => {
    const mode = pm.dataset.mode as keyof typeof privacy.modes
    const key = mode === 'consent' && pm.dataset.consent === 'yes' ? 'consentYes' : mode
    pm.dataset.store = mode === 'full' || key === 'consentYes' ? 'on' : 'off'
    const { say, attr: a } = privacy.modes[mode]
    if (sayT.innerHTML !== say) {
      sayT.innerHTML = say
      attr.innerHTML = `&lt;script … <b>${a.replace(/"/g, '&quot;')}</b>&gt;`
      soft(sayT)
      soft(attr)
    }
    const data = privacy.rows[key]
    rows.forEach((r, i) => {
      const [who, sub, joined] = data[i]
      r.classList.toggle('j', !!joined && i > 0 && !!data[i - 1][2])
      r.classList.toggle('anon', who === 'Anonymous')
      const b = r.querySelector('b')!, sm = r.querySelector('small')!
      if (b.textContent === who && sm.textContent === sub) return
      b.textContent = who
      sm.textContent = sub
      sm.className = sub === 'identified' || sub === 'consent given' ? 'ok' : ''
      soft(r.querySelector('.vwho')!, i)
    })
    if (note.textContent !== privacy.notes[key]) {
      note.textContent = privacy.notes[key]
      soft(note)
    }
  }

  const placeThumb = () => {
    const t = tabs.find((x) => x.getAttribute('aria-selected') === 'true')!
    thumb.style.width = t.offsetWidth + 'px'
    thumb.style.translate = t.offsetLeft + 'px 0'
  }

  const pick = (t: HTMLButtonElement, focus = false) => {
    for (const x of tabs) {
      const on = x === t
      x.setAttribute('aria-selected', String(on))
      x.tabIndex = on ? 0 : -1
    }
    panel.setAttribute('aria-labelledby', t.id)
    pm.dataset.mode = t.dataset.mode
    placeThumb()
    render()
    if (focus) t.focus()
  }

  for (const t of tabs) t.addEventListener('click', () => pick(t))
  $('.segc').addEventListener('keydown', (e: KeyboardEvent) => {
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    const k = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 } as Record<string, number>)[e.key]
    if (k === undefined) return
    e.preventDefault()
    pick(tabs[(k + tabs.length) % tabs.length], true)
  })
  accept.addEventListener('click', () => {
    pm.dataset.consent = 'yes'
    render()
    undo.focus({ preventScroll: true })
  })
  undo.addEventListener('click', () => {
    pm.dataset.consent = 'no'
    render()
    accept.focus({ preventScroll: true })
  })

  // The thumb appears without sliding in, then follows the layout (fonts, resize).
  thumb.style.transition = 'none'
  placeThumb()
  void thumb.offsetWidth // flush, so the first placement does not animate
  if (!reduceMotion()) thumb.style.transition = ''
  document.fonts.ready.then(placeThumb)
  let raf = 0
  addEventListener('resize', () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(placeThumb)
  })
}
