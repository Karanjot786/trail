// The one bar rule (plan Global Constraints): bar = value / max(value in this list), clamped to 0–1.
export function bar(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value / max))
}
