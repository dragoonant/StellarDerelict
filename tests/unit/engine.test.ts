import { describe, expect, it } from 'vitest'
import { makeRand, randomAction } from '../../src/ai/random'
import { createGame, legalActions, query, replay, step, view } from '../../src/engine'
import type { Action, Setup, State } from '../../src/engine'
import { END, ok, pings, start, stalkers, W, withBag } from './helpers'

const setup: Setup = { mission: 'dead-reckoning', seed: 77 }

/** Play random legal actions; returns the state and the actions taken. */
function randomGame(seed: number, max: number, mission = 'dead-reckoning'): { s: State; actions: Action[] } {
  let s = createGame({ mission, seed })
  const rand = makeRand(seed)
  const actions: Action[] = []
  for (let i = 0; i < max && !s.result; i++) {
    const a = randomAction(view(s, s.toAct as 'warden'), s.toAct as 'warden', rand) as Action
    const r = step(s, a)
    if (!r.ok) throw new Error(r.error)
    s = r.state
    actions.push(a)
  }
  return { s, actions }
}

describe('engine contract', () => {
  it('E-1 step never mutates its input and never throws on a bad action', () => {
    const s = createGame(setup)
    const frozen = JSON.stringify(s)
    const a = legalActions(s).find((x) => x.type === 'move') as Action
    const r = step(s, a)
    expect(r.ok).toBe(true)
    expect(JSON.stringify(s)).toBe(frozen)
    const junk: unknown[] = [
      null,
      undefined,
      42,
      'move',
      {},
      { type: 'nope' },
      { type: 'move' },
      { type: 'move', unit: 'venn' },
      { type: 'move', unit: 'venn', to: 'x' },
      { type: 'move', unit: 'venn', to: [Number.NaN, 1] },
      { type: 'move', unit: 'venn', to: [1.5, 2] },
      { type: 'terminal', unit: 'venn', terminal: 'zzz', op: 'seal' },
      { type: 'terminal', unit: 'venn', terminal: 'archive-lock', op: 'seal', door: [99, 99] },
      { type: 'fire', unit: 'venn', target: 42 },
      { type: 'arrive', duct: [1, 1] },
      { type: 'door', unit: 'ghost', door: [1, 1] },
    ]
    for (const j of junk) {
      const bad = step(s, j as Action)
      expect(bad.ok).toBe(false)
      expect(bad.state).toBe(s)
      if (!bad.ok) expect(typeof bad.error).toBe('string')
    }
    expect(JSON.stringify(s)).toBe(frozen)
  })

  it('E-2 state is plain JSON: a round trip is deep-equal at every step', () => {
    let s = createGame(setup)
    const rand = makeRand(5)
    for (let i = 0; i < 150 && !s.result; i++) {
      expect(JSON.parse(JSON.stringify(s))).toStrictEqual(s)
      s = (step(s, randomAction(s, s.toAct as 'warden', rand) as Action) as { state: State }).state
    }
    expect(typeof s.rng.s[0]).toBe('number')
  })

  it('E-3 one actor: toAct names the seat, pending is the single open decision, finished games have no actor', () => {
    const s = start({ grid: ['###########', '#a........#', '###########', '#V.V.V#####', '###########'], arrivals: [1, 1] })
    expect(s.toAct).toBe('warden')
    const m = ok(s, END).s
    expect(m.toAct).toBe('molt')
    expect(m.pending).toEqual({ kind: 'arrive', remaining: 1 })
    expect(legalActions(m).every((x) => x.type === 'arrive')).toBe(true)
    const done = start({ grid: ['#####', '#.a.#', '#####'], roundLimit: 1 })
    const over = ok(ok(done, END).s, END).s
    expect(over.toAct).toBeNull()
    expect(over.pending).toBeNull()
    expect(legalActions(over)).toEqual([])
  })

  it('E-4 legalActions is never empty while the game runs and every action it lists is accepted', () => {
    for (const seed of [1, 2, 3]) {
      let s = createGame({ mission: 'dead-reckoning', seed })
      const rand = makeRand(seed)
      for (let i = 0; i < 120 && !s.result; i++) {
        const legal = legalActions(s)
        expect(legal.length).toBeGreaterThan(0)
        if (!s.pending) expect(legal.some((a) => a.type === 'endPhase')).toBe(true)
        for (const a of legal) {
          const r = step(s, a)
          if (!r.ok) throw new Error(`listed but refused: ${JSON.stringify(a)}: ${r.error}`)
        }
        s = (step(s, legal[Math.floor(rand() * legal.length)] as Action) as { state: State }).state
      }
    }
  })

  it('E-5 replay(setup, actions) deep-equals the state reached live', () => {
    for (const seed of [11, 12]) {
      const { s, actions } = randomGame(seed, 400)
      expect(actions.length).toBeGreaterThan(50)
      expect(replay({ mission: 'dead-reckoning', seed }, actions)).toStrictEqual(s)
    }
  })

  it('E-6 query owns the numbers the UI shows', () => {
    const s = start({ grid: ['###########', '#a........#', '###########'], pings: [[4, 1]] })
    const id = stalkers(s)[0]?.id ?? ''
    expect(query.cost(s, { type: 'move', unit: 'a', to: [2, 1] })).toEqual({ ap: 1, cp: 0, affordable: true })
    expect(query.cost(s, { type: 'turn', unit: 'a', facing: 'N' }).ap).toBe(1)
    expect(query.hitChance(s, 'a', id)).toBeCloseTo(1 - (4 / 6) ** 2, 6)
    const o = query.meleeOdds(s, 'a', id)
    expect(o.attackerWins + o.tie + o.defenderWins).toBeCloseTo(1, 9)
    expect(query.sees(s, 'a', [4, 1])).toBe(true)
    expect(query.seenSquares(s).length).toBe(3) // the stalker blocks the rest
    expect(query.timerSeconds(s)).toBe(45 + 15)
    const reach = query.reachable(s, 'a')
    expect(reach.find((r) => r.at[0] === 3 && r.at[1] === 1)?.cost).toBe(2)
    expect(reach.some((r) => r.at[0] === 0)).toBe(false)
    expect(query.burst(s, 'a', [3, 1]).length).toBe(3)
    expect(query.openDucts(createGame(setup))).toEqual([[27, 14], [7, 17], [21, 17]]) // the two start ducts are occupied
    const full = createGame({ mission: 'dead-reckoning', seed: 3 })
    expect(query.timerSeconds(full)).toBe(45 + 15 * 5)
    expect(query.reachable(full, 'venn').length).toBeGreaterThan(0)
    expect(query.terminalOps(full, 'venn')).toEqual([])
  })

  it('E-7 the Warden view hides ping stalker counts, the bag and the RNG, and nothing else', () => {
    let s = start({ grid: ['###########', '#a........#', '###########', '#V.V.V#####', '###########'], pings: [[3, 3]], bag: [3], arrivals: [1, 1] })
    s = withBag(s, [3, 2, 1])
    const m = ok(s, END).s
    const full = m
    const w = view(full, 'warden')
    const json = JSON.stringify(w)
    for (const hidden of ['"stalkers"', '"bag"', '"rng"', '"queue"']) expect(json).not.toContain(hidden)
    const expected = JSON.parse(JSON.stringify(full)) as Record<string, unknown>
    delete expected.rng
    delete expected.bag
    for (const u of expected.units as Record<string, unknown>[]) delete u.stalkers
    expect(JSON.parse(json)).toStrictEqual(expected)
    expect(pings(full).length).toBe(1)
    const molt = view(full, 'molt')
    expect(JSON.stringify(molt)).not.toContain('"rng"')
    expect(JSON.stringify(molt)).toContain('"stalkers"')
    expect((molt as { bag?: number[] }).bag).toEqual([3, 2, 1])
    // the view is a copy: editing it cannot touch the state
    ;(w.units[0] as { ap: number }).ap = 99
    expect(W(full, 'a').ap).not.toBe(99)
  })

  it('K-1 the boarding clock is 45 s plus 15 s per living Warden', () => {
    const s = createGame(setup)
    expect(query.timerSeconds(s)).toBe(45 + 15 * 5)
  })

  it('K-2 the engine never reads a clock: the same state and action always give the same result', () => {
    const s = createGame(setup)
    const a = legalActions(s)[0] as Action
    expect(step(s, a)).toStrictEqual(step(s, a))
    expect(createGame(setup)).toStrictEqual(createGame(setup))
    expect(createGame({ ...setup, seed: 78 })).not.toStrictEqual(createGame(setup))
  })
})
