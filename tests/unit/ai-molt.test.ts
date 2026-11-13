import { describe, expect, it } from 'vitest'
import { makeRand } from '../../src/ai/random'
import { moltPolicy } from '../../src/ai/scripted'
import { wardenPolicy } from '../../src/ai/warden'
import { chooseMoltAction, TIERS, type Tier } from '../../src/ai/tiers'
import { ACTION_CLASS, DECISION_KINDS, kindOfAction, PENDING_KIND } from '../../src/ai/molt/kinds'
import { stalkerOdds } from '../../src/ai/molt/combat'
import { POLICIES } from '../../src/ai/molt/policies'
import { aiStats, resetAiStats } from '../../src/ai/molt/utility'
import { createGame, legalActions, query, step, view } from '../../src/engine'
import type { Action, Board, Event, PingUnit, Pos, State, StalkerUnit } from '../../src/engine'
import { END, of, ok, start } from './helpers'

/** A frozen clock: the AI never reads the real one. */
const clock = (): number => 0

function pick(s: State, tier: Tier, seed = 1): Action {
  return chooseMoltAction(s, tier, seed, { clock, budgetMs: 1e9 })
}

/** Add stalkers (full AP is set when the Molt phase starts) and set ping stalker counts. */
function withStalkers(s: State, at: Pos[]): State {
  const units = [...s.units]
  at.forEach((p, i) => units.push({ id: `t${i + 1}`, kind: 'stalker', at: p, ap: 6 } as StalkerUnit))
  return { ...s, units, nextId: s.nextId + at.length }
}
function withPingCount(s: State, id: string, n: number): State {
  return { ...s, units: s.units.map((u) => (u.id === id && u.kind === 'ping' ? ({ ...u, stalkers: n } as PingUnit) : u)) }
}
function carrying(s: State, id: string): State {
  return { ...s, core: { where: 'carried', at: null, carrier: id }, coreRound: 1 }
}

/** Play the Molt phase with the AI until it ends the phase (or `max` actions). */
function moltPhase(s0: State, tier: Tier, max = 60): { s: State; ev: Event[]; acts: Action[] } {
  let s = s0
  const ev: Event[] = []
  const acts: Action[] = []
  for (let i = 0; i < max && s.toAct === 'molt' && !s.result; i++) {
    const a = pick(s, tier, 7 + i)
    acts.push(a)
    const r = ok(s, a)
    s = r.s
    ev.push(...r.ev)
    if (a.type === 'endPhase') break
  }
  return { s, ev, acts }
}

/** an open room with the console on the east wall, so the squad has a route to walk */
const roomX = [
  '#############',
  '#...........#',
  '#...........#',
  '#..........X#',
  '#...........#',
  '#...........#',
  '#...........#',
  '#############',
]
const room = [
  '#############',
  '#...........#',
  '#...........#',
  '#...........#',
  '#...........#',
  '#...........#',
  '#...........#',
  '#############',
]

describe('Molt AI: structure', () => {
  it('AI-1 the policy table covers every decision kind, every action type and every pending kind', () => {
    expect(Object.keys(POLICIES).sort()).toEqual([...DECISION_KINDS].sort())
    for (const k of DECISION_KINDS) expect(typeof POLICIES[k]).toBe('function')
    const types: Action['type'][] = ['move', 'turn', 'door', 'fire', 'vent', 'watch', 'scorch', 'melee', 'terminal', 'takeCore', 'reveal', 'tear', 'arrive', 'endPhase']
    expect(Object.keys(ACTION_CLASS).sort()).toEqual([...types].sort())
    expect(PENDING_KIND.arrive).toBe('arrive')
    // classification of live actions
    let s = start({ grid: room, squad: [['a', 'warden', 5, 3, 'E']], pings: [[5, 5]] })
    s = withStalkers(s, [[9, 6]])
    s = ok(s, END).s
    expect(kindOfAction(s, { type: 'reveal', unit: 'p1' })).toBe('pingReveal')
    expect(kindOfAction(s, { type: 'move', unit: 'p1', to: [8, 5] })).toBe('pingMove')
    expect(kindOfAction(s, { type: 'move', unit: 't1', to: [8, 6] })).toBe('stalkerAct')
    expect(kindOfAction(s, { type: 'melee', unit: 't1', target: 'a' })).toBe('stalkerAct')
    expect(kindOfAction(s, { type: 'endPhase' })).toBe('endPhase')
    expect(kindOfAction(s, { type: 'turn', unit: 'a', facing: 'N' })).toBeNull()
  })

  it('AI-2 determinism: the same state and seed give the same action, for every tier', () => {
    let s = createGame({ mission: 'dead-reckoning', seed: 5 })
    const rand = makeRand(5)
    let n = 0
    const seen = new Set<string>()
    while (!s.result && n < 400) {
      if (s.toAct === 'molt') {
        for (const tier of TIERS) {
          const a1 = pick(s, tier, 99)
          const a2 = pick(s, tier, 99)
          expect(a2).toEqual(a1)
          seen.add(`${tier}:${a1.type}`)
        }
      }
      const a = s.toAct === 'warden' ? wardenPolicy(view(s, 'warden') as Board, rand) : pick(s, 'veteran', n)
      s = ok(s, a).s
      n++
    }
    expect(seen.size).toBeGreaterThan(5)
  })

  it('AI-3 the tiers differ in kind: regular is the scripted policy, unchanged', () => {
    let s = createGame({ mission: 'dead-reckoning', seed: 9 })
    const rand = makeRand(9)
    for (let n = 0; n < 150 && !s.result; n++) {
      if (s.toAct === 'molt') expect(chooseMoltAction(s, 'regular', 3)).toEqual(moltPolicy(view(s, 'molt'), makeRand(3)))
      const a = s.toAct === 'warden' ? wardenPolicy(view(s, 'warden') as Board, rand) : pick(s, 'veteran', n)
      s = ok(s, a).s
    }
  })

  it('AI-4 the AI reads only the Molt view: the dice stream and the bag order change nothing', () => {
    let s = createGame({ mission: 'dead-reckoning', seed: 11 })
    const rand = makeRand(11)
    for (let n = 0; n < 200 && !s.result; n++) {
      if (s.toAct === 'molt') {
        const other: State = { ...s, rng: { s: [1, 2, 3, 4], queue: [6, 6, 6] }, bag: [...s.bag].reverse() }
        for (const tier of TIERS) {
          const a = pick(s, tier, 5)
          expect(pick(other, tier, 5)).toEqual(a)
          expect(chooseMoltAction(view(s, 'molt'), tier, 5, { clock })).toEqual(a)
        }
      }
      const a = s.toAct === 'warden' ? wardenPolicy(view(s, 'warden') as Board, rand) : pick(s, 'veteran', n)
      s = ok(s, a).s
    }
  })

  it('AI-5 never returns an illegal action over 30 full games, and the veteran never needs its fallback', () => {
    resetAiStats()
    let molt = 0
    for (let g = 0; g < 30; g++) {
      let s = createGame({ mission: 'dead-reckoning', seed: 100 + g })
      const rand = makeRand(100 + g)
      const tier: Tier = g % 3 === 0 ? 'recruit' : 'veteran'
      let n = 0
      while (!s.result && n < 3000) {
        let a: Action
        if (s.toAct === 'warden') a = wardenPolicy(view(s, 'warden') as Board, rand)
        else {
          a = pick(s, tier, 100 + g + n)
          molt++
          expect(legalActions(s).some((x) => JSON.stringify(x) === JSON.stringify(a))).toBe(true)
        }
        const r = step(s, a)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        s = r.state
        n++
      }
      expect(s.result).not.toBeNull()
    }
    expect(molt).toBeGreaterThan(500)
    expect(aiStats.fallbacks).toBe(0)
  }, 180_000)

  it('AI-6 the melee table is the same arithmetic as query.meleeOdds', () => {
    for (const role of ['warden', 'sergeant'] as const)
      for (const flank of [false, true]) {
        // Warden at (5,3) facing E; stalker in front (6,3) or beside (5,2)
        let s = start({ grid: room, squad: [['a', role, 5, 3, 'E']] })
        s = withStalkers(s, [flank ? [5, 2] : [6, 3]])
        const q = query.meleeOdds(s, 't1', 'a')
        const o = stalkerOdds(flank, role === 'sergeant')
        expect(o.win).toBeCloseTo(q.attackerWins, 10)
        expect(o.tie).toBeCloseTo(q.tie, 10)
        expect(o.lose).toBeCloseTo(q.defenderWins, 10)
      }
  })
})

describe('Molt AI: behaviours', () => {
  it('AI-7 takes the flank square when both the front and a flank square are reachable', () => {
    let s = start({ grid: room, squad: [['a', 'warden', 5, 3, 'E']] })
    s = withStalkers(s, [[6, 6]])
    s = ok(s, END).s
    // both (6,3) in front and (5,4) beside are three steps away
    expect(query.reachable(s, 't1').some((r) => r.at[0] === 6 && r.at[1] === 3 && r.cost === 3)).toBe(true)
    expect(query.reachable(s, 't1').some((r) => r.at[0] === 5 && r.at[1] === 4 && r.cost === 3)).toBe(true)
    const { ev } = moltPhase(s, 'veteran')
    const fights = of(ev, 'meleeFought')
    expect(fights.length).toBeGreaterThan(0)
    expect(fights[0]?.flank).toBe(true)
  })

  it('AI-8 does not step a ping into a seen square, and never proposes one', () => {
    let s = start({ grid: roomX, squad: [['a', 'warden', 5, 3, 'E']], pings: [[1, 6]] })
    s = ok(s, END).s
    resetAiStats()
    expect(query.seenSquares(s).length).toBeGreaterThan(5)
    let cur = s
    let moves = 0
    for (let i = 0; i < 30 && cur.toAct === 'molt'; i++) {
      const a = pick(cur, 'veteran', i)
      cur = ok(cur, a).s
      if (a.type === 'move') {
        moves++
        expect(query.isSeen(cur, a.to)).toBe(false)
      }
      if (a.type === 'endPhase') break
    }
    expect(moves).toBeGreaterThan(0)
    expect(aiStats.rejected).toBe(0)
    expect(aiStats.fallbacks).toBe(0)
    const ping = cur.units.find((u) => u.kind === 'ping')
    expect(ping).toBeDefined()
    expect(query.isSeen(cur, (ping as PingUnit).at)).toBe(false)
  })

  it('AI-9 holds a lone ping out of sight instead of charging a watched corridor at long range', () => {
    const grid = ['###########', '#a........#', '#########.#', '#########.#', '###########']
    let s = start({ grid, squad: [['a', 'warden', 1, 1, 'E']], pings: [[9, 3]] })
    s = { ...s, units: s.units.map((u) => (u.kind === 'warden' ? { ...u, watch: true } : u)) }
    s = withPingCount(s, 'p1', 1)
    s = ok(s, END).s
    // the Warden is watching the corridor the ping would have to cross
    const { s: after, ev, acts } = moltPhase(s, 'veteran')
    expect(acts.some((a) => a.type === 'reveal')).toBe(false)
    expect(of(ev, 'fired').length).toBe(0)
    expect(after.units.some((u) => u.kind === 'ping')).toBe(true)
    // a stalker in the same spot does not walk into the corridor either
    let t = start({ grid, squad: [['a', 'warden', 1, 1, 'E']] })
    t = { ...t, units: t.units.map((u) => (u.kind === 'warden' ? { ...u, watch: true } : u)) }
    t = ok(withStalkers(t, [[9, 3]]), END).s
    const run = moltPhase(t, 'veteran')
    expect(of(run.ev, 'fired').length).toBe(0)
    expect(run.s.units.some((u) => u.kind === 'stalker')).toBe(true)
    // control: the same ping beside the Warden's flank reveals and strikes at once
    let c = start({ grid: room, squad: [['a', 'warden', 5, 3, 'E']], pings: [[5, 4]] })
    c = withPingCount(c, 'p1', 2)
    c = ok(c, END).s
    const strike = moltPhase(c, 'veteran')
    expect(strike.acts[0]?.type).toBe('reveal')
    expect(of(strike.ev, 'meleeFought').length).toBeGreaterThan(0)
  })

  it('AI-10 targets the carrier over a nearer Warden when both are in reach', () => {
    let s = start({
      grid: room,
      squad: [
        ['n', 'warden', 4, 2, 'E'],
        ['c', 'warden', 10, 2, 'W'],
      ],
    })
    s = carrying(withStalkers(s, [[6, 2]]), 'c')
    s = ok(s, END).s
    const { ev } = moltPhase(s, 'veteran')
    const fights = of(ev, 'meleeFought')
    expect(fights.length).toBeGreaterThan(0)
    expect(fights[0]?.defender).toBe('c')
  })

  it('AI-11 picks the arrival duct nearer the squad route, whichever side that is', () => {
    const mk = (flip: boolean): State => {
      // a corridor y=1 from the airlock-side squad to the console; ducts hang off it near the console or far behind
      const rows = [
        '#################',
        '#a..............X#',
        '#.#############.##',
        '#.#############.##',
        '#V#############V##',
        '#################',
      ]
      const squad: [string, 'warden', number, number, 'E'][] = [['a', 'warden', 1, 1, 'E']]
      const s0 = start({ grid: rows, squad, arrivals: [1, 1] })
      return flip ? s0 : s0
    }
    // duct (15,4) sits under the route's far end, duct (1,4) is under the squad itself (within 3 steps: not open)
    const rows2 = [
      '###################',
      '#a...............X#',
      '#.#######.#########',
      '#.#######.#######.#',
      '#V#######V#######V#',
      '###################',
    ]
    void mk
    let s = start({ grid: rows2, squad: [['a', 'warden', 1, 1, 'E']], arrivals: [1, 1] })
    s = ok(s, END).s
    expect(s.pending).not.toBeNull()
    const open = query.openDucts(s).map((p) => p.join(','))
    expect(open).toContain('9,4')
    expect(open).toContain('17,4')
    const a = pick(s, 'veteran')
    expect(a).toEqual({ type: 'arrive', duct: [9, 4] })
    // after the core is taken the way home matters: the squad carries it back west, so the east duct is no longer the closer one
    let h = start({ grid: rows2, squad: [['a', 'warden', 15, 1, 'W']], arrivals: [1, 1] })
    h = carrying(h, 'a')
    h = ok(h, END).s
    const home = pick(h, 'veteran')
    expect(home.type).toBe('arrive')
    const d = (home as { duct: Pos }).duct
    expect(query.openDucts(h).some((p) => p[0] === d[0] && p[1] === d[1])).toBe(true)
  })
})
