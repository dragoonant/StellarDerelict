import { describe, expect, it } from 'vitest'
import { createGame, legalActions, query, step } from '../../src/engine'
import { END, nextRound, of, ok, refused, run, start, stalkers, types, U, W, withBag, withCp, withDice } from './helpers'

const corridor = ['###########', '#a........#', '###########']
const lane = ['#############', '#a..........#', '#...........#', '#############']

describe('rounds, phases and command points', () => {
  it('T-1 the mission starts in the Warden phase of round 1', () => {
    const s = start({ grid: corridor })
    expect([s.round, s.phase, s.toAct]).toEqual([1, 'warden', 'warden'])
  })

  it('T-2 Warden phase start runs in order: burn, watch, cooling, CP, AP', () => {
    // a scorcher burns a square, a rifleman fires three shots and holds watch next round
    const s0 = start({
      grid: ['#########', '#rb...V.#', '#########'],
      squad: [
        ['r', 'scorcher', 1, 1, 'E'],
        ['b', 'warden', 2, 1, 'E'],
      ],
      pings: [[6, 1]],
    })
    // b stands in front of r; scorcher cannot see past b, so burn the stalker square from b's side instead
    expect(stalkers(s0).length).toBe(1)
    let s = withDice(s0, [1, 1, 1, 1, 1, 1])
    s = run(s, { type: 'fire', unit: 'b', target: stalkers(s)[0]?.id ?? '' }, { type: 'fire', unit: 'b', target: stalkers(s)[0]?.id ?? '' }, { type: 'fire', unit: 'b', target: stalkers(s)[0]?.id ?? '' }).s
    expect(W(s, 'b').heat).toBe(3)
    s = ok(s, { type: 'watch', unit: 'b' }).s
    expect(W(s, 'b').watch).toBe(true)
    s = ok(s, END).s
    const r = step(withDice(s, [2]), END)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const order = types(r.events)
    expect(order.indexOf('watchEnded')).toBeLessThan(order.indexOf('phaseStarted'))
    expect(W(r.state, 'b').heat).toBe(1)
    expect(W(r.state, 'b').watch).toBe(false)
    expect(W(r.state, 'b').ap).toBe(4)
    expect(r.state.cp).toBe(2 + 2)
    expect(r.state.round).toBe(2)
  })

  it('T-2 burn zones are removed at the start of the Warden phase', () => {
    const s0 = start({ grid: ['#########', '#r.....V#', '#########'], squad: [['r', 'scorcher', 1, 1, 'E']] })
    let s = ok(s0, { type: 'scorch', unit: 'r', at: [3, 1] }).s
    expect(s.burn.length).toBe(3)
    s = ok(s, END).s
    const r = ok(s, END)
    expect(types(r.ev)).toContain('burnCleared')
    expect(r.s.burn).toEqual([])
  })

  it('T-3 any Warden may act in any order, paid from its own AP, and ending is always legal', () => {
    const s = start({
      grid: lane,
      squad: [
        ['a', 'warden', 1, 1, 'E'],
        ['b', 'warden', 1, 2, 'E'],
      ],
    })
    expect(legalActions(s).some((x) => x.type === 'endPhase')).toBe(true)
    const m = run(s, { type: 'move', unit: 'b', to: [2, 2] }, { type: 'move', unit: 'a', to: [2, 1] }, { type: 'move', unit: 'b', to: [3, 2] })
    expect(W(m.s, 'a').ap).toBe(3)
    expect(W(m.s, 'b').ap).toBe(2)
    expect(legalActions(m.s).some((x) => x.type === 'endPhase')).toBe(true)
  })

  it('T-4 Molt phase start: held CP, AP for every stalker and ping, then arrivals', () => {
    const s0 = start({
      grid: ['############', '#a.........#', '##########.#', '##########V#', '##########.#', '##########V#', '############'],
      pings: [[10, 3]],
      arrivals: [1, 1],
      bag: [2],
    }, { cp: 5 })
    const m = ok(s0, END)
    expect(m.s.phase).toBe('molt')
    expect(m.s.heldCp).toBe(2)
    expect(m.s.cp).toBe(0)
    const p = m.s.units.find((u) => u.kind === 'ping')
    expect(p && p.ap).toBe(6)
    expect(m.s.pending).toEqual({ kind: 'arrive', remaining: 1 })
    expect(types(m.ev)[0]).toBe('phaseStarted')
  })

  it('T-5 in the Molt phase only Molt units act, any number of times, then the phase ends', () => {
    const s = start({ grid: ['#########', '#a.....V#', '#########'], pings: [[7, 1]] , arrivals: [0, 0] })
    // the ping at (7,1) is in sight: it was revealed at once, so a stalker exists
    expect(stalkers(s).length).toBe(1)
    const m = ok(s, END).s
    refused(m, { type: 'turn', unit: 'a', facing: 'N' })
    const st = stalkers(m)[0]?.id ?? ''
    const r = run(m, { type: 'move', unit: st, to: [6, 1] }, { type: 'move', unit: st, to: [7, 1] })
    expect(U(r.s, st)?.ap).toBe(4)
    expect(ok(r.s, END).s.phase).toBe('warden')
  })

  it('T-6 the round counter rises after the Molt phase, and the last round ends the mission', () => {
    const s = start({ grid: corridor, roundLimit: 2 })
    const r2 = nextRound(s)
    expect(r2.round).toBe(2)
    const m = ok(r2, END).s
    const last = ok(m, END)
    expect(last.s.result).toEqual({ winner: 'molt', reason: 'time' })
    expect(types(last.ev)).toEqual(['roundEnded', 'gameOver'])
    expect(last.s.toAct).toBeNull()
  })

  it('C-1 CP is the base plus a d3, plus one while the Sergeant lives', () => {
    const plain = start({ grid: corridor })
    expect(nextRound(plain, [3]).cp).toBe(2 + 3)
    const sgt = start({ grid: corridor, squad: [['a', 'sergeant', 1, 1, 'E']] })
    expect(nextRound(sgt, [2]).cp).toBe(2 + 2 + 1)
    const live = createGame({ mission: 'dead-reckoning', seed: 5 })
    expect(live.cp).toBeGreaterThanOrEqual(4)
    expect(live.cp).toBeLessThanOrEqual(6)
  })

  it('C-2 AP pays first, a shortfall is paid from CP, and an action needs AP + CP to cover it', () => {
    let s = start({ grid: corridor }, { cp: 2 })
    s = run(s, { type: 'move', unit: 'a', to: [2, 1] }, { type: 'move', unit: 'a', to: [3, 1] }, { type: 'move', unit: 'a', to: [4, 1] }, { type: 'move', unit: 'a', to: [5, 1] }).s
    expect([W(s, 'a').ap, s.cp]).toEqual([0, 2])
    s = ok(s, { type: 'move', unit: 'a', to: [6, 1] }).s
    expect([W(s, 'a').ap, s.cp]).toEqual([0, 1])
    // a back step costs 2: only 1 CP left
    refused(s, { type: 'move', unit: 'a', to: [5, 1] })
    expect(query.canAfford(s, { type: 'move', unit: 'a', to: [7, 1] })).toBe(true)
    expect(query.canAfford(s, { type: 'move', unit: 'a', to: [5, 1] })).toBe(false)
  })

  it('C-3 CP above the held maximum are lost, the rest are held for the Molt phase only', () => {
    const hi = ok(start({ grid: corridor }, { cp: 5 }), END).s
    expect([hi.heldCp, hi.cp]).toEqual([2, 0])
    const lo = ok(start({ grid: corridor }, { cp: 1 }), END).s
    expect(lo.heldCp).toBe(1)
    const next = ok(lo, END).s
    expect(next.heldCp).toBe(0)
    expect(next.cp).toBeGreaterThanOrEqual(3)
    expect(of(ok(hi, END).ev, 'phaseStarted')[0]?.seat).toBe('warden')
    void withBag
    void withCp
  })
})
