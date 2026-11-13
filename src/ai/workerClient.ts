/**
 * The client's side of the Molt worker (spec 40). `choose` resolves with the next Molt action; if the worker cannot start,
 * errors, or stops answering, it logs one console warning and runs the same function on the main thread from then on.
 */
import type { Action, Board } from '../engine'
import { chooseMoltAction, type Tier } from './tiers'

export interface MoltRequest {
  id: number
  board: Board
  tier: Tier
  seed: number
}
export type MoltResponse = { id: number; action: Action } | { id: number; error: string }

/** The slice of the Worker interface the client uses (a fake implements it in tests). */
export interface WorkerLike {
  postMessage(m: MoltRequest): void
  terminate(): void
  onmessage: ((e: { data: MoltResponse }) => void) | null
  onerror: ((e: unknown) => void) | null
}
export type WorkerFactory = () => WorkerLike

export type BotMode = 'idle' | 'worker' | 'main'

export interface MoltClient {
  choose(board: Board, tier: Tier, seed: number): Promise<Action>
  /** 'worker' once an answer has come from the worker, 'main' after a fallback (or with no worker), 'idle' before the first call */
  mode(): BotMode
  /** why it fell back, or '' */
  reason(): string
  dispose(): void
}

export interface ClientOpts {
  warn?: (msg: string) => void
  /** the main-thread function; defaults to `chooseMoltAction` */
  local?: (board: Board, tier: Tier, seed: number) => Action
  /** give up on the worker when it has not answered in this many ms (0 = never) */
  timeoutMs?: number
}

export function createMoltClient(factory: WorkerFactory | null, opts: ClientOpts = {}): MoltClient {
  const warn = opts.warn ?? ((m: string) => console.warn(m))
  const local = opts.local ?? ((b: Board, t: Tier, s: number) => chooseMoltAction(b, t, s))
  const timeoutMs = opts.timeoutMs ?? 8000
  let worker: WorkerLike | null = null
  let mode: BotMode = 'idle'
  let reason = ''
  let warned = false
  let nextId = 1
  const pending = new Map<number, { req: MoltRequest; resolve: (a: Action) => void; timer: ReturnType<typeof setTimeout> | null }>()

  const runLocal = (req: MoltRequest): Action => local(req.board, req.tier, req.seed)

  const fallBack = (why: string): void => {
    if (!warned) {
      warned = true
      warn(`Molt AI worker unavailable (${why}); running the AI on the main thread.`)
    }
    mode = 'main'
    reason = why
    const w = worker
    worker = null
    if (w) {
      w.onmessage = null
      w.onerror = null
      try {
        w.terminate()
      } catch {
        /* already gone */
      }
    }
    const waiting = [...pending.values()]
    pending.clear()
    for (const p of waiting) {
      if (p.timer) clearTimeout(p.timer)
      let a: Action
      try {
        a = runLocal(p.req)
      } catch {
        a = { type: 'endPhase' }
      }
      p.resolve(a)
    }
  }

  const start = (): void => {
    if (worker || mode === 'main') return
    if (!factory) {
      fallBack('no Worker support')
      return
    }
    try {
      const w = factory()
      w.onmessage = (e) => {
        const m = e.data
        const p = pending.get(m.id)
        if (!p) return
        pending.delete(m.id)
        if (p.timer) clearTimeout(p.timer)
        if ('error' in m) {
          // a failing worker is not trusted again; this request is answered locally
          pending.set(m.id, p)
          fallBack(m.error)
          return
        }
        mode = 'worker'
        p.resolve(m.action)
      }
      w.onerror = () => fallBack('the worker reported an error')
      worker = w
    } catch (err) {
      fallBack(err instanceof Error ? err.message : 'it did not start')
    }
  }

  return {
    choose(board, tier, seed) {
      const req: MoltRequest = { id: nextId++, board, tier, seed }
      start()
      if (mode === 'main' || !worker) {
        mode = 'main'
        return Promise.resolve(runLocal(req))
      }
      const w = worker
      return new Promise<Action>((resolve) => {
        const timer = timeoutMs > 0 ? setTimeout(() => fallBack('it did not answer in time'), timeoutMs) : null
        pending.set(req.id, { req, resolve, timer })
        try {
          w.postMessage(req)
        } catch (err) {
          fallBack(err instanceof Error ? err.message : 'it refused a message')
        }
      })
    },
    mode: () => mode,
    reason: () => reason,
    dispose() {
      const w = worker
      worker = null
      if (w) {
        w.onmessage = null
        w.onerror = null
        w.terminate()
      }
      for (const p of pending.values()) if (p.timer) clearTimeout(p.timer)
      pending.clear()
    },
  }
}
