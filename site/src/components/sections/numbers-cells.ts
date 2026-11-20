// Builds the numbers grid from build-time measurements. A missing measurement drops its cell; nothing is guessed.
import { numbers, facts } from '../../copy/landing'

export type Cell = { dt: string; dd: string }
type Metric = { median: number }
type Bench = { runs: number; results: Record<string, Record<string, Metric | undefined> | undefined> }
type Sizes = { private?: number; full?: number }

const bytes = (n: number) => `${n.toLocaleString('en-US')} B`
// "1.68 ms" with the decimal point set in the mono face, as the prototype does.
const ms = (n: number) => n.toFixed(2).replace('.', '<span class="pt">.</span>') + ' ms'

export function numbersCells(sizes: Sizes, bench: Bench | undefined): { big: Cell[]; small: Cell[] } {
  const labels = numbers.labels
  const t = bench?.results['t.js']
  const big: (Cell | false)[] = [
    !!sizes.private && { dt: labels.private, dd: bytes(sizes.private) },
    !!sizes.full && { dt: labels.full, dd: bytes(sizes.full) },
    !!t?.script && { dt: labels.script, dd: ms(t.script.median) },
    !!t?.heap && { dt: labels.heap, dd: `${Math.max(0, t.heap.median).toFixed(0)} KB` },
  ]
  const small: Cell[] = [
    { dt: labels.requests, dd: String(facts.requestsPerPageview) },
    { dt: labels.binary, dd: facts.binaryMB },
    { dt: labels.ram, dd: facts.serverRamMB },
    { dt: labels.cookies, dd: String(facts.cookiesBeforeConsent) },
  ]
  return { big: big.filter((c): c is Cell => !!c), small }
}
