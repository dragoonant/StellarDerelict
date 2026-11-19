import { describe, expect, it } from 'vitest'
import { makeRand, randomAction } from '../../src/ai/random'
import { moltPolicy, wardenPolicyV1 } from '../../src/ai/scripted'
import { chooseMoltAction } from '../../src/ai/tiers'
import { wardenPolicy } from '../../src/ai/warden'
import { createGame, step, view } from '../../src/engine'
import type { Action, Board, Event, State, StalkerUnit, Pos } from '../../src/engine'
import { END, of, ok, start, W } from './helpers'

const wv = (s: State): Board => view(s, 'warden') as Board
const act = (s: State): Action => wardenPolicy(wv(s), makeRand(1))

function addStalkers(s: State, at: Pos[]): State {
  const units = [...s.units]
  at.forEach((p, i) => units.push({ id: `t${i + 1}`, kind: 'stalker', at: p, ap: 6 } as StalkerUnit))
  return { ...s, units, nextId: s.nextId + at.length }
}

/** Play the Warden phase with the policy until it ends the phase. */
function phase(s0: State, max = 40): { s: State; ev: Event[]; acts: Action[] } {
  let s = s0
  const ev: Event[] = []
  const acts: Action[] = []
  for (let i = 0; i < max && s.toAct === 'warden' && !s.result; i++) {
    const a = act(s)
    acts.push(a)
    if (a.type === 'endPhase') break
    const r = ok(s, a)
    s = r.s
    ev.push(...r.ev)
  }
  return { s, ev, acts }
}

const corridor = ['###############', '#.............#', '###############']
const corridorX = ['###############', '#............X#', '###############']
const roomX = [
  '#############',
  '#AAA........#',
  '#...........#',
  '#..........X#',
  '#...........#',
  '#...........#',
  '#...........#',
  '#############',
]

describe('Warden policy', () => {
  it('AIW-1 shoots a stalker that blocks the route instead of walking into it', () => {
    // a corridor with a way out, so the squad is not behind the clock: the shot at close range outranks the step forward
    let s = start({ grid: ['###############', '#A...........X#', '###############'], squad: [['a', 'warden', 2, 1, 'E']] })
    s = addStalkers(s, [[5, 1]])
    const a = act(s)
    expect(a).toEqual({ type: 'fire', unit: 'a', target: 't1' })
  })

  it('AIW-1b on a map with no formation hints the squad still advances on the console', () => {
    const s = start({ grid: corridorX, squad: [['a', 'warden', 1, 1, 'E']] })
    expect(act(s)).toEqual({ type: 'move', unit: 'a', to: [2, 1] })
  })

  it('AIW-2 turns to bring a contact round a corner into sight when the guns are ready, forcing its reveal', () => {
    let s = start({
      grid: roomX,
      squad: [
        ['a', 'warden', 5, 3, 'E'],
        ['b', 'warden', 3, 3, 'E'],
      ],
      pings: [[5, 6]],
    })
    expect(s.units.some((u) => u.kind === 'ping')).toBe(true)
    const a = act(s)
    expect(a.type).toBe('turn')
    const r = ok(s, a)
    expect(of(r.ev, 'revealed').some((e) => e.forced)).toBe(true)
  })

  it('AIW-3 the rear guard turns to face a threat behind the file', () => {
    let s = start({
      grid: ['#################', '#AAA...........X#', '#################'],
      squad: [
        ['a', 'warden', 7, 1, 'E'],
        ['b', 'warden', 8, 1, 'E'],
        ['c', 'warden', 9, 1, 'E'],
      ],
    })
    s = addStalkers(s, [[4, 1]])
    const a = act(s)
    expect(a).toMatchObject({ type: 'turn', unit: 'a', facing: expect.stringMatching(/^[NS]$/) })
    // two turns bring the rear guard round to face west
    let t = ok(s, a).s
    const a2 = act(t)
    expect(a2).toMatchObject({ type: 'turn', unit: 'a' })
    t = ok(t, a2).s
    expect(W(t, 'a').facing).toBe('W')
  })

  it('AIW-4 the carrier heads for the airlock after taking the core', () => {
    const grid = ['###############', '#AAA.........X#', '###############']
    let s = start({ grid, squad: [['a', 'warden', 12, 1, 'W']] })
    s = { ...s, core: { where: 'carried', at: null, carrier: 'a' }, coreRound: 1 }
    const before = W(s, 'a').at[0]
    const r = phase(s)
    expect(W(r.s, 'a').at[0]).toBeLessThan(before - 3)
  })

  it('AIW-5 someone goes for a dropped core and picks it up', () => {
    const grid = ['###############', '#AAA.........X#', '###############']
    let s = start({ grid, squad: [['a', 'warden', 2, 1, 'E']] })
    s = { ...s, core: { where: 'loose', at: [6, 1], carrier: null }, coreRound: 1 }
    const r = phase(s)
    expect(r.s.core.where).toBe('carried')
    expect(r.s.core.carrier).toBe('a')
  })

  it('AIW-6 a lone Warden with nothing to do ends the phase', () => {
    const s = start({ grid: corridor, squad: [['a', 'warden', 1, 1, 'E']] })
    expect(act(s)).toBeDefined()
    const { acts } = phase(ok(s, END).s.round ? s : s, 30)
    expect(acts[acts.length - 1]).toEqual(END)
  })

  it('AIW-7 deterministic: the same board gives the same action', () => {
    let s = createGame({ mission: 'dead-reckoning', seed: 3 })
    const rand = makeRand(3)
    for (let n = 0; n < 120 && !s.result; n++) {
      if (s.toAct === 'warden') {
        expect(wardenPolicy(wv(s), makeRand(9))).toEqual(wardenPolicy(wv(s), makeRand(9)))
      }
      const a = s.toAct === 'warden' ? wardenPolicy(wv(s), rand) : moltPolicy(view(s, 'molt'), rand)
      s = ok(s, a).s
    }
  })

  it('AIW-8 never returns an illegal action over 12 full games against every kind of Molt', () => {
    for (let g = 0; g < 12; g++) {
      let s = createGame({ mission: 'dead-reckoning', seed: 40 + g })
      const rand = makeRand(40 + g)
      let n = 0
      while (!s.result && n < 3000) {
        let a: Action
        if (s.toAct === 'warden') a = wardenPolicy(wv(s), rand)
        else if (g % 4 === 0) a = randomAction(view(s, 'molt'), 'molt', rand) as Action
        else a = chooseMoltAction(s, g % 4 === 1 ? 'recruit' : g % 4 === 2 ? 'regular' : 'veteran', 40 + g + n)
        const r = step(s, a)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        s = r.state
        n++
      }
      expect(s.result).not.toBeNull()
    }
  }, 120_000)

  it('AIW-9 the first scripted Warden is still available as wardenPolicyV1', () => {
    const s = createGame({ mission: 'dead-reckoning', seed: 1 })
    expect(wardenPolicyV1(wv(s), makeRand(1))).toBeDefined()
  })
})
