// The hero: dot terrain, sky dots and the user_986 route as footsteps.
// A port of the prototype's drawHero (main.js 41–117) over a fixed frame, so it runs at build time.
// dotsSvg is only ever rasterised; stepsSvg ships inline; waypoints place the HTML labels.
import { makeNoise } from './noise.mjs'
import { loadJourney, heroWaypoints, stepPlan } from './journey.mjs'
import { AVOID_DESKTOP, AVOID_MOBILE, labelBox } from './layout.mjs'

const f1 = (v) => +v.toFixed(1), f2 = (v) => +v.toFixed(2)
const pct = (v, of) => +((v / of) * 100).toFixed(2)

export function renderHero({ W, H, mobile, seed = 7, journey = loadJourney() }) {
  const noise = makeNoise(seed)
  const avoid = mobile ? AVOID_MOBILE : AVOID_DESKTOP
  // The prototype's own geometry. Desktop: the frame is the hero. Mobile: the prototype's 390×1137 hero at
  // 390×844 (horizon 30 px under the art space), later fitted into the 390×480 box by a uniform scale.
  const V = mobile ? { W: 390, H: 1137.6, HZ: 512.1 } : { W, H, HZ: H * .44 }
  const sy = mobile ? (V.H - V.HZ) / 520 : V.H / 900
  const cx = mobile ? V.W * .5 : V.W * .62, wide = mobile ? V.W * 1.05 : V.W * .88, HZv = V.HZ
  const elev = (u, t) => Math.pow(noise(u * 5 + 3, t * 3 + 1), 1.6)
  const projV = (u, t) => {
    const y0 = HZv + Math.pow(t, 1.9) * (V.H - HZv + 160 * sy), spread = .55 + t * 2.4, e = elev(u, t)
    return [cx + (u - .5) * wide * spread, y0 - e * (330 * Math.pow(1 - t, 1.3) + 26) * sy, e]
  }
  const route = mobile ? (s) => [.5 + .08 * Math.sin(s * 8.5) + s * .03, .74 - s * .64] : (s) => [.43 + .095 * Math.sin(s * 8.5) + s * .12, .9 - s * .8]

  // footsteps: the plan's segment sizes put each waypoint where the data says; two more steps walk on past the goal
  const total = mobile ? 46 : 60, plan = stepPlan(journey, total), N = total + 2
  const at = plan.map((_, i) => plan.slice(0, i + 1).reduce((a, b) => a + b, 0))
  const raw = []
  for (let k = 0; k <= N; k++) { const s = k / N, [u, t] = route(s), [x, y] = projV(u, t); raw.push({ s, t, x, y }) }
  // fit: identity on desktop; on mobile, scale the route (plus label room) into the box
  let k = 1, ox = 0, oy = 0
  if (mobile) {
    const ys = raw.slice(1, -1).map((p) => p.y), top = Math.min(...ys) - 34, bot = Math.max(...ys) + 14
    k = Math.min(1, H / (bot - top)); ox = W / 2 - (V.W / 2) * k; oy = -top * k
  }
  const proj = (u, t) => { const [x, y, e] = projV(u, t); return [ox + x * k, oy + y * k, e] }
  const steps = raw.map((p) => ({ ...p, x: ox + p.x * k, y: oy + p.y * k }))
  const HZ = oy + HZv * k
  const fade = (x, y) => { let f = 1; for (const r of avoid) { const dx = Math.max(r.x - 18 - x, 0, x - (r.x + r.w + 18)), dy = Math.max(r.y - 14 - y, 0, y - (r.y + r.h + 14)); const d = Math.hypot(dx, dy); f = Math.min(f, .22 + .78 * Math.min(1, d / 46)) } return f }

  // ground gradient + soft light on the ridge
  const gx = ox + (cx + V.W * .05) * k
  let dots = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a72ef"/><stop offset=".6" stop-color="#0a6ae2"/><stop offset="1" stop-color="#0650b0"/></linearGradient>`
    + `<radialGradient id="l" gradientUnits="userSpaceOnUse" cx="${f1(gx)}" cy="${f1(HZ)}" r="${f1(V.W * .55 * k)}"><stop offset="0" stop-color="rgb(120,180,255)" stop-opacity=".35"/><stop offset="1" stop-color="rgb(120,180,255)" stop-opacity="0"/></radialGradient></defs>`
    + `<rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#l)"/><g fill="#fff">`
  const dot = (x, y, r, a) => { dots += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f2(r)}" fill-opacity="${f2(a)}"/>` }

  // sky: a flat, faint dot grid that the terrain grows out of
  const gs = 18
  for (let y = 9; y < HZ + 40; y += gs) for (let x = 9; x < W; x += gs) {
    const a = .13 * Math.max(0, Math.min(1, y / (HZ + 40))) * fade(x, y); if (a < .015) continue
    dot(x, y, .9 * k, a)
  }
  // terrain: rows of dots in perspective, lit by height; ground near the route is trodden flat and dimmer
  const ROWS = mobile ? 64 : 84, COLS = mobile ? 120 : 180
  for (let i = 0; i <= ROWS; i++) {
    const t = i / ROWS, r0 = (mobile ? .6 : .7) + 2.5 * Math.pow(t, 1.3)
    for (let j = 0; j <= COLS; j++) {
      const u = j / COLS, [x, y, e] = proj(u, t)
      if (x < -10 || x > W + 10 || y > H + 10 || y < 0) continue
      let a = Math.min(1, .2 + e * 1.05) * (.3 + .7 * Math.min(1, t * 3.2)) * fade(x, y)
      let dm = 1e9; for (const p of steps) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < dm) dm = d }
      const carve = (10 + 26 * t) * k; if (dm < carve * carve) a *= .25 + .75 * Math.sqrt(dm) / carve
      if (mobile) a *= Math.min(1, y / 56)               // the phone box starts mid-hero: let the field rise out of the sky
      if (a < .02) continue
      dot(x, y, r0 * k * (.55 + e * .7), a)
    }
  }
  const dotsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${dots}</g></svg>`

  // footsteps, alternating left and right of the route
  const sc = mobile ? .8 * k : Math.max(.8, Math.min(1.15, W / 1440))
  let st = ''
  steps.forEach((p, k) => {
    if (k === 0 || k === steps.length - 1) return
    const a = steps[k - 1], b = steps[k + 1]; let nx = -(b.y - a.y), ny = b.x - a.x; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L
    const side = (k % 2 ? 1 : -1) * (2 + 6 * p.t) * sc, r = (1.3 + 4 * Math.pow(p.t, 1.2)) * sc
    st += `<circle class="st" style="--i:${k}" cx="${f1(p.x + nx * side)}" cy="${f1(p.y + ny * side - 2)}" r="${f2(r)}"/>`
  })

  // waypoint rings and label placement (label side as in the prototype, sizes from Geist Mono)
  const placed = []
  const wps = heroWaypoints(journey).map((w, i) => {
    const k = at[i], p = steps[k], R = (6 + 11 * p.t) * sc, d = k * 38 + 330, y = p.y - 2
    st += `<circle class="ring${w.goal ? ' goal' : ''}" style="--d:${d}ms" cx="${f1(p.x)}" cy="${f1(y)}" r="${f2(R)}" fill="none" stroke="${w.goal ? '#ffd23f' : '#fff'}" stroke-width="${w.goal ? 3 : 2}"/>`
    if (w.goal) st += `<circle class="ring core" style="--d:${d}ms" cx="${f1(p.x)}" cy="${f1(y)}" r="${f2(R * .35)}" fill="#ffd23f"/>`
    const { w: lw, h: lh } = labelBox(w.label, w.sub, mobile)
    let ly = Math.max(4, Math.min(H - lh - 4, p.y - R * .4 - lh / 2))
    const zones = [...avoid, ...placed]
    const hits = (x, top = ly) => zones.some((r) => x < r.x + r.w + 6 && x + lw + 6 > r.x && top < r.y + r.h + 6 && top + lh + 6 > r.y)
    let right = p.x + R + 12 + lw < W - 12 && !hits(p.x + R + 12)
    if (!right && hits(p.x - R - 12 - lw)) right = true
    let lx = Math.max(8, Math.min(W - lw - 8, right ? p.x + R + 12 : p.x - R - 12 - lw))
    // squeezed onto its own ring (narrow frames): hang the label under the ring, or over it
    if (lx < p.x + R + 4 && lx + lw > p.x - R - 4) {
      lx = Math.max(8, Math.min(W - lw - 8, p.x - lw / 2))
      const below = y + R + 8, above = y - R - 8 - lh
      ly = below + lh <= H - 4 && !hits(lx, below) ? below : above
    }
    // still on an earlier label: slide the label up or down (whichever is shorter) until it clears
    for (const q of placed) if (lx < q.x + q.w + 6 && lx + lw + 6 > q.x && ly < q.y + q.h + 6 && ly + lh + 6 > q.y) {
      const up = q.y - lh - 6, down = q.y + q.h + 6
      ly = (Math.abs(up - ly) <= Math.abs(down - ly) && up >= 4) || down > H - lh - 4 ? up : down
    }
    placed.push({ x: lx, y: ly, w: lw, h: lh })
    return { ...w, goal: !!w.goal, k, x: pct(p.x, W), y: pct(y, H), r: pct(R, W), lx: pct(lx, W), ly: pct(ly, H), delay: d, box: { x: lx, y: ly, w: lw, h: lh } }
  })
  const stepsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="#fff" overflow="visible" aria-hidden="true">${st}</svg>\n`
  return { dotsSvg, stepsSvg, waypoints: wps }
}
