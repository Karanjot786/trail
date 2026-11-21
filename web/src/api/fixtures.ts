// STUB (P0). F1 owns this file and replaces it with the fixtures transport (plan §0.13, Task F1-8).
import type { Transport } from './transport'

export function createFixturesTransport(): Transport {
  const notRecorded = async () => ({ status: 501, body: 'fixtures transport not implemented yet', headers: {} })
  return { mode: 'fixtures', get: notRecorded, send: notRecorded }
}
