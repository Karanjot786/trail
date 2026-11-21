// STUB (P0). F1 owns this file (plan §0.10): a seeded, mirrored 3×3 dot face. Keep the props, replace the body.
export function Avatar({ seed, size = 28 }: { seed: string; size?: 20 | 28 | 40 }) {
  return <svg aria-hidden="true" width={size} height={size} data-seed={seed} />
}
