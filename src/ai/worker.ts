/**
 * Web Worker entry (spec 40): runs `chooseMoltAction` off the main thread so the board never stutters.
 * Request `{ id, board, tier, seed }` (board is the Molt view), reply `{ id, action }` or `{ id, error }`.
 */
import { chooseMoltAction } from './tiers'
import type { MoltRequest, MoltResponse } from './workerClient'

interface Scope {
  onmessage: ((e: { data: MoltRequest }) => void) | null
  postMessage(m: MoltResponse): void
}
const scope = self as unknown as Scope

scope.onmessage = (e) => {
  const { id, board, tier, seed } = e.data
  try {
    scope.postMessage({ id, action: chooseMoltAction(board, tier, seed) })
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : 'unknown error' })
  }
}
