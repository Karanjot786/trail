// Avatar (plan §0.10): a seeded, mirrored 3×3 dot face (the mark's dot motif), one hue per seed.
import type { CSSProperties } from 'react'

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Which of the 9 cells are on: columns 0 and 2 mirror; never empty. */
export function avatarCells(seed: string): boolean[] {
  const h = hash(seed)
  const cells: boolean[] = []
  for (let r = 0; r < 3; r++) {
    const left = ((h >> (r * 2)) & 1) === 1
    const mid = ((h >> (r * 2 + 1)) & 1) === 1
    cells.push(left, mid, left)
  }
  if (!cells.some(Boolean)) cells[4] = true
  return cells
}

export function Avatar({ seed, size = 28 }: { seed: string; size?: 20 | 28 | 40 }) {
  const h = hash(seed)
  const cells = avatarCells(seed)
  const inner = Math.round(size * 0.64)
  return (
    <span className="av" data-size={size} data-seed={seed} style={{ '--h': h % 360 } as CSSProperties} aria-hidden="true">
      <svg width={inner} height={inner} viewBox="0 0 18 18">
        {cells.map((on, i) => (on ? <circle key={i} cx={3 + (i % 3) * 6} cy={3 + Math.floor(i / 3) * 6} r={2.2} /> : null))}
      </svg>
    </span>
  )
}
