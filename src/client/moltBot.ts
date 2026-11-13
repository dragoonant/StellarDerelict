// The Molt bot's worker client for the page: one shared client, created on first use.
import type { Action, Board } from '../engine'
import { createMoltClient, type BotMode, type MoltClient, type WorkerLike } from '../ai/workerClient'
import type { Tier } from '../ai/tiers'

let client: MoltClient | null = null
let decisions = 0

function get(): MoltClient {
  if (!client) {
    client = createMoltClient(
      typeof Worker === 'undefined'
        ? null
        : () => new Worker(new URL('../ai/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
    )
  }
  return client
}

export function chooseInWorker(board: Board, tier: Tier, seed: number): Promise<Action> {
  decisions++
  return get().choose(board, tier, seed)
}

export function botInfo(): { mode: BotMode; reason: string; decisions: number } {
  return { mode: client ? client.mode() : 'idle', reason: client ? client.reason() : '', decisions }
}
