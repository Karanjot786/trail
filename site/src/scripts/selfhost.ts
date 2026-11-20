// Self-host: the terminal plays the real flow once, fast and skippable (port of prototype main.js 294–325),
// and the deploy tabs switch the commands. Without JS or with reduced motion the terminal shows its final state.
import { onView, reduceMotion, sleep } from './reveal'

const stage = document.getElementById('tstage')
if (stage) {
  const lines = [...stage.querySelectorAll<HTMLElement>('.tl')]
  const upcard = document.getElementById('upcard')!
  const anims: Animation[] = []
  let over = false

  const finish = () => {
    if (over) return
    over = true
    for (const a of anims) a.finish()
    stage.dataset.seq = 'done'
  }

  const play = async () => {
    if (reduceMotion()) return
    stage.dataset.seq = 'pre'
    const typed = [0, 1, 3], pause = [0, 200, 320, 260, 140, 380]
    for (let i = 0; i < lines.length && !over; i++) {
      await sleep(pause[i])
      if (over) break
      const l = lines[i]
      l.classList.add('show')
      if (typed.includes(i)) {
        const n = l.textContent!.length
        const a = l.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: n * 11, easing: `steps(${n})` })
        anims.push(a)
        await a.finished.catch(() => {})
      }
      if (i === 4) {
        await sleep(300)
        upcard.classList.add('show')
      }
    }
    finish()
  }

  document.getElementById('tskip')!.addEventListener('click', finish)
  onView(stage, play, 0.45)
}

// Deploy tabs: Docker | Fly | Binary
const shcode = document.getElementById('shcode')
if (shcode) {
  const tabs = [...shcode.querySelectorAll<HTMLButtonElement>('[role=tab]')]
  const pre = document.getElementById('shpre')!
  const pick = (t: HTMLButtonElement, focus = false) => {
    for (const x of tabs) {
      const on = x === t
      x.setAttribute('aria-selected', String(on))
      x.tabIndex = on ? 0 : -1
    }
    pre.querySelector('code')!.textContent = pre.dataset[t.dataset.tab!]!
    pre.setAttribute('aria-labelledby', t.id)
    if (focus) t.focus()
  }
  for (const t of tabs) t.addEventListener('click', () => pick(t))
  shcode.querySelector('[role=tablist]')!.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    const k = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 } as Record<string, number>)[(e as KeyboardEvent).key]
    if (k === undefined) return
    e.preventDefault()
    pick(tabs[(k + tabs.length) % tabs.length], true)
  })
}
