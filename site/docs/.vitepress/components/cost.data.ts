// Build-time numbers for CostTable. Runs in Node, so it can read the built
// tracker files and tracker/bench/last.json through src/lib/numbers.ts, which
// finds the repo from process.cwd()/.. (build from site/).
import { benchData, sizes } from '../../../src/lib/numbers'

export interface CostData {
  sizes: typeof sizes
  bench: typeof benchData
}

declare const data: CostData
export { data }

export default {
  load(): CostData {
    return { sizes, bench: benchData }
  },
}
