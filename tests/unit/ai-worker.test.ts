import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseMoltAction } from '../../src/ai/tiers'
import { createMoltClient, type MoltRequest, type MoltResponse, type WorkerLike } from '../../src/ai/workerClient'
import { createGame, view } from '../../src/engine'
import type { Action, Board } from '../../src/engine'
import { END, ok, start } from './helpers'

class FakeWorker implements WorkerLike {
  posted: MoltRequest[] = []
  terminated = false
  onmessage: ((e: { data: MoltResponse }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  postMessage(m: MoltRequest): void {
    this.posted.push(m)
  }
  terminate(): void {
    this.terminated = true
  }
  reply(r: MoltResponse): void {
    this.onmessage?.({ data: r })
  }
}

const board: Board = view(createGame({ mission: 'dead-reckoning', seed: 3 }), 'molt')
const LOCAL: Action = { type: 'endPhase' }
const MOVED: Action = { type: 'turn', unit: 'x', facing: 'N' }

afterEach(() => vi.useRealTimers())

describe('Molt AI worker client', () => {
  it('AI-12 asks the worker, resolves with its answer and reports the worker mode', async () => {
    const w = new FakeWorker()
    const warn = vi.fn()
    const c = createMoltClient(() => w, { warn, local: () => LOCAL })
    expect(c.mode()).toBe('idle')
    const p = c.choose(board, 'veteran', 42)
    expect(w.posted).toHaveLength(1)
    expect(w.posted[0]).toMatchObject({ tier: 'veteran', seed: 42 })
    expect(w.posted[0]?.board).toBe(board)
    w.reply({ id: (w.posted[0] as MoltRequest).id, action: MOVED })
    await expect(p).resolves.toEqual(MOVED)
    expect(c.mode()).toBe('worker')
    expect(warn).not.toHaveBeenCalled()
  })

  it('AI-13 matches answers to requests by id, in any order', async () => {
    const w = new FakeWorker()
    const c = createMoltClient(() => w, { local: () => LOCAL, timeoutMs: 0 })
    const p1 = c.choose(board, 'regular', 1)
    const p2 = c.choose(board, 'regular', 2)
    const [r1, r2] = w.posted as [MoltRequest, MoltRequest]
    w.reply({ id: r2.id, action: MOVED })
    w.reply({ id: r1.id, action: LOCAL })
    expect(await p1).toEqual(LOCAL)
    expect(await p2).toEqual(MOVED)
  })

  it('AI-14 a worker that fails to start falls back to the main thread with one warning', async () => {
    const warn = vi.fn()
    const local = vi.fn(() => LOCAL)
    const c = createMoltClient(
      () => {
        throw new Error('blocked by policy')
      },
      { warn, local },
    )
    expect(await c.choose(board, 'veteran', 1)).toEqual(LOCAL)
    expect(await c.choose(board, 'veteran', 2)).toEqual(LOCAL)
    expect(c.mode()).toBe('main')
    expect(c.reason()).toBe('blocked by policy')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(local).toHaveBeenCalledTimes(2)
  })

  it('AI-15 no Worker support at all: main thread, one warning', async () => {
    const warn = vi.fn()
    const c = createMoltClient(null, { warn, local: () => LOCAL })
    expect(await c.choose(board, 'regular', 1)).toEqual(LOCAL)
    expect(await c.choose(board, 'regular', 2)).toEqual(LOCAL)
    expect(c.mode()).toBe('main')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('AI-16 a worker error mid-request answers the waiting request locally, stops the worker and warns once', async () => {
    const w = new FakeWorker()
    const warn = vi.fn()
    const c = createMoltClient(() => w, { warn, local: () => LOCAL })
    const p = c.choose(board, 'veteran', 1)
    w.onerror?.(new Error('boom'))
    w.onerror?.(new Error('boom again'))
    expect(await p).toEqual(LOCAL)
    expect(w.terminated).toBe(true)
    expect(c.mode()).toBe('main')
    expect(await c.choose(board, 'veteran', 2)).toEqual(LOCAL)
    expect(w.posted).toHaveLength(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('AI-17 an error reply is answered locally and the worker is not trusted again', async () => {
    const w = new FakeWorker()
    const warn = vi.fn()
    const c = createMoltClient(() => w, { warn, local: () => LOCAL })
    const p = c.choose(board, 'veteran', 1)
    w.reply({ id: (w.posted[0] as MoltRequest).id, error: 'bad board' })
    expect(await p).toEqual(LOCAL)
    expect(c.mode()).toBe('main')
    expect(c.reason()).toBe('bad board')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('AI-18 a worker that never answers is given up on after the timeout', async () => {
    vi.useFakeTimers()
    const w = new FakeWorker()
    const warn = vi.fn()
    const c = createMoltClient(() => w, { warn, local: () => LOCAL, timeoutMs: 500 })
    const p = c.choose(board, 'veteran', 1)
    await vi.advanceTimersByTimeAsync(499)
    expect(c.mode()).toBe('idle')
    await vi.advanceTimersByTimeAsync(2)
    expect(await p).toEqual(LOCAL)
    expect(c.mode()).toBe('main')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('AI-19 the main-thread path is the same function the worker runs', async () => {
    let s = start({ grid: ['#######', '#a....#', '#.....#', '#######'], squad: [['a', 'warden', 1, 1, 'E']] })
    s = ok(s, END).s
    const b = view(s, 'molt')
    const c = createMoltClient(null, { warn: () => undefined })
    expect(await c.choose(b, 'veteran', 5)).toEqual(chooseMoltAction(b, 'veteran', 5))
  })
})
