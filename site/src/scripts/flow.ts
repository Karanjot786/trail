// How it works: plays the install → track → understand story once, when the stage is mostly in view.
// The markup ships in its final state; the pre-state is set only just before the sequence plays.
import { onView, sleep, reduceMotion, EIO, EOUT } from './reveal'

const flow = document.getElementById('flow')
if (flow) {
  const $ = (s: string) => flow.querySelector(s) as HTMLElement
  const $$ = (s: string) => [...flow.querySelectorAll<HTMLElement>(s)]
  const segs = $$('.trail-seg')
  const lightAll = () => segs.forEach((s) => (s.dataset.on = ''))

  const countUp = (node: HTMLElement, to: number, ms: number) => {
    const dec = String(to).includes('.') ? 1 : 0, suf = dec ? '%' : '', t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms), e = 1 - (1 - p) ** 3
      node.textContent = (to * e).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  // A trail segment reveals dot by dot (CSS steps); wait for it to finish.
  const walk = async (seg: HTMLElement) => {
    seg.dataset.on = ''
    await sleep(Number(seg.style.getPropertyValue('--n')) * 55)
  }

  const prepare = () => {
    if (flow.dataset.seq) return
    flow.dataset.seq = 'pre'
    for (const s of segs) s.style.setProperty('--n', String(Math.max(3, Math.round(Math.max(s.offsetWidth, s.offsetHeight) / 20))))
    $('#check').classList.remove('on')
    for (const n of $$('#goals .v .num')) n.textContent = n.textContent!.includes('%') ? '0.0%' : '0'
  }

  const play = async () => {
    prepare()
    const check = $('#check'), okt = $('.okt'), cur = $('#cur'), btn = $('.inst .copy'), shot = cur.parentElement!
    const ring = (i: number) => $(`.wpt[data-wp="${i}"]`).classList.add('on')
    ring(0)
    await sleep(350)
    // a cursor copies the snippet
    const b = btn.getBoundingClientRect(), s = shot.getBoundingClientRect()
    const tx = b.left - s.left + b.width / 2 - 6, ty = b.top - s.top + b.height / 2 - 4
    const at = (x: number, y: number, k = '') => `translate(${x}px,${y}px)${k}`
    await cur.animate(
      [{ opacity: 0, transform: at(tx - 150, ty + 170) }, { opacity: 1, transform: at(tx - 120, ty + 140), offset: 0.15 }, { opacity: 1, transform: at(tx, ty) }],
      { duration: 900, easing: EIO, fill: 'forwards' },
    ).finished
    cur.animate([{ transform: at(tx, ty, ' scale(1)') }, { transform: at(tx, ty, ' scale(.86)') }, { transform: at(tx, ty, ' scale(1)') }], { duration: 220, easing: 'ease-out', fill: 'forwards' })
    btn.classList.add('done')
    await sleep(350)
    cur.animate([{ opacity: 1, transform: at(tx, ty) }, { opacity: 0, transform: at(tx + 30, ty + 60) }], { duration: 300, easing: EOUT, fill: 'forwards' })
    setTimeout(() => btn.classList.remove('done'), 1200)
    // the live check: waiting, then green, then counting the seconds since the event
    await sleep(600)
    const final = okt.textContent
    okt.textContent = final!.replace(/\d+s ago$/, 'just now')
    check.classList.add('on')
    let sec = 0
    const id = setInterval(() => {
      okt.textContent = final!.replace(/\d+s ago$/, `${++sec}s ago`)
      if (sec >= 4) clearInterval(id)
    }, 1000)
    await sleep(500)
    await walk(segs[0])
    ring(1)
    await sleep(200)
    // events arrive in order
    for (const li of $$('#feed li')) {
      li.classList.add('in')
      await sleep(280)
    }
    await walk(segs[1])
    ring(2)
    await sleep(200)
    // the goals count up
    $$('#goals .bar').forEach((bar, i) =>
      setTimeout(() => {
        bar.classList.add('in')
        bar.querySelectorAll<HTMLElement>('.num').forEach((n) => countUp(n, +n.dataset.n!, 700))
      }, i * 90),
    )
    await sleep(760)
    $('#goals .reached').classList.add('in')
    await sleep(250)
    flow.dataset.seq = 'done'
  }

  if (reduceMotion()) lightAll()
  else {
    // Set the pre-state as the stage starts to enter, so the reader never sees the final state snap back.
    onView(flow, prepare, 0)
    onView(flow, () => void document.fonts.ready.then(play), 0.45)
  }
}
