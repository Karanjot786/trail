// MCP: the JSON toggle, and the sample conversation played turn by turn once (port of prototype main.js 328–339).
// Without JS or with reduced motion every turn is visible.
import { onView, reduceMotion, sleep } from './reveal'

const convo = document.getElementById('convo')
if (convo) {
  const jt = convo.querySelector<HTMLButtonElement>('.jtog')!
  const json = document.getElementById('cjson')!
  jt.addEventListener('click', () => {
    const open = jt.getAttribute('aria-expanded') !== 'true'
    jt.setAttribute('aria-expanded', String(open))
    json.hidden = !open
  })

  const call = convo.querySelector('.call')!
  const play = async () => {
    if (reduceMotion()) return
    convo.dataset.seq = 'pre'
    convo.querySelector('.you')!.classList.add('show')
    await sleep(650)
    call.classList.add('show')
    await sleep(900)
    call.classList.add('done')
    await sleep(350)
    convo.querySelector('.ans')!.classList.add('show')
    for (const x of convo.querySelectorAll('.stg')) {
      x.classList.add('show')
      await sleep(x.tagName === 'TR' ? 90 : 260)
    }
    convo.dataset.seq = 'done'
  }
  onView(convo, play, 0.45)
}
