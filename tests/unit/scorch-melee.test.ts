import { describe, expect, it } from 'vitest'
import { query } from '../../src/engine'
import type { State } from '../../src/engine'
import { END, of, ok, refused, run, start, stalkers, types, W, withDice } from './helpers'

const hall = ['###########', '#r........#', '###########']
const st = (s: State): string => stalkers(s)[0]?.id ?? ''
const scorcher = (spec: Partial<Parameters<typeof start>[0]> = {}) => start({ grid: hall, squad: [['r', 'scorcher', 1, 1, 'E']], ...spec })

describe('scorcher', () => {
  it('SC-1 scorch costs 2 and a charge, hits any seen square in range, not walls or terminals', () => {
    const s = scorcher()
    const r = ok(s, { type: 'scorch', unit: 'r', at: [4, 1] })
    expect(W(r.s, 'r').ap).toBe(2)
    expect(W(r.s, 'r').charges).toBe(5)
    refused(s, { type: 'scorch', unit: 'r', at: [8, 1] }) // 7 away
    refused(s, { type: 'scorch', unit: 'r', at: [4, 0] }) // wall
    refused(s, { type: 'scorch', unit: 'r', at: [0, 1] }) // behind
    const t = start({ grid: ['#######', '#r.T..#', '#######'], squad: [['r', 'scorcher', 1, 1, 'E']] })
    refused(t, { type: 'scorch', unit: 'r', at: [3, 1] })
    // empty squares are fine, and the scorcher runs dry
    let dry = start({ grid: hall, squad: [['r', 'scorcher', 1, 1, 'E']] }, { cp: 6 })
    for (let i = 0; i < 6; i++) {
      dry = { ...dry, units: dry.units.map((u) => (u.kind === 'warden' ? { ...u, ap: 4 } : u)) }
      dry = ok(dry, { type: 'scorch', unit: 'r', at: [2, 1] }).s
    }
    dry = { ...dry, units: dry.units.map((u) => (u.kind === 'warden' ? { ...u, ap: 4 } : u)) }
    expect(refused(dry, { type: 'scorch', unit: 'r', at: [2, 1] })).toMatch(/empty/)
  })

  it('SC-2 the burst is the target plus orthogonal neighbours that can be entered', () => {
    const s = scorcher()
    expect(query.burst(s, 'r', [4, 1]).map((p) => p.join(',')).sort()).toEqual(['3,1', '4,1', '5,1'])
    const open = start({ grid: ['#####', '#r.D#', '#...#', '#####'], squad: [['r', 'scorcher', 1, 1, 'E']] })
    const burst = query.burst(open, 'r', [2, 1]).map((p) => p.join(',')).sort()
    expect(burst).toEqual(['1,1', '2,1', '2,2'].sort()) // the closed door is not enterable
    const ev = ok(s, { type: 'scorch', unit: 'r', at: [4, 1] }).ev
    expect(of(ev, 'scorched')[0]?.burst.length).toBe(3)
  })

  it('SC-3 each unit in the burst rolls a d6 and dies on 2+; a ping rolls once; Wardens use plating', () => {
    const s = scorcher({ pings: [[4, 1]] })
    expect(stalkers(s).length).toBe(1)
    const live = ok(withDice(s, [1]), { type: 'scorch', unit: 'r', at: [4, 1] })
    expect(stalkers(live.s).length).toBe(1)
    expect(of(live.ev, 'scorched')[0]?.rolls).toEqual([{ unit: st(s), die: 1, hit: false }])
    const dead = ok(withDice(s, [2]), { type: 'scorch', unit: 'r', at: [4, 1] })
    expect(stalkers(dead.s).length).toBe(0)
    expect(of(dead.ev, 'destroyed')[0]).toMatchObject({ unit: st(s), kind: 'stalker', by: 'r' })
    // a hidden ping with three stalkers is one unit and one roll
    const ping = start({
      grid: ['###########', '#r........#', '####V######'],
      squad: [['r', 'scorcher', 1, 1, 'E']],
      pings: [[4, 2]],
      bag: [3],
    })
    expect(ping.units.filter((u) => u.kind === 'ping').length).toBe(1)
    const r = ok(withDice(ping, [2]), { type: 'scorch', unit: 'r', at: [4, 1] })
    expect(of(r.ev, 'scorched')[0]?.rolls.length).toBe(1)
    expect(of(r.ev, 'destroyed')).toHaveLength(1)
    expect(of(r.ev, 'destroyed')[0]?.kind).toBe('ping')
    expect(r.s.units.filter((u) => u.kind !== 'warden').length).toBe(0)
    // friendly fire: both Wardens are breached, not destroyed
    const fr = start({ grid: hall, squad: [['r', 'scorcher', 1, 1, 'E'], ['b', 'warden', 2, 1, 'E']] })
    const f = ok(withDice(fr, [2, 2]), { type: 'scorch', unit: 'r', at: [2, 1] })
    expect([W(f.s, 'r').breached, W(f.s, 'b').breached, W(f.s, 'r').alive, W(f.s, 'b').alive]).toEqual([true, true, true, true])
  })

  it('SC-4 burning lasts to the next Warden phase, does not block sight, and spares those already in it', () => {
    const s = scorcher({ pings: [[5, 1]] })
    const first = ok(withDice(s, [1]), { type: 'scorch', unit: 'r', at: [4, 1] }).s
    expect(first.burn.length).toBe(3)
    // still standing in the fire: not rolled again
    const again = first.units.map((u) => (u.kind === 'warden' ? { ...u, ap: 4 } : u))
    const second = ok(withDice({ ...first, units: again }, [6]), { type: 'scorch', unit: 'r', at: [4, 1] })
    expect(of(second.ev, 'scorched')[0]?.rolls).toEqual([])
    expect(stalkers(second.s).length).toBe(1)
    // fire does not block sight
    expect(query.sees(ok(scorcher(), { type: 'scorch', unit: 'r', at: [3, 1] }).s, 'r', [8, 1])).toBe(true)
    // the stalker may walk out of the fire in the Molt phase, but not into a burning square
    const m = ok(first, END).s
    const id = st(m)
    refused(m, { type: 'move', unit: id, to: [4, 1] })
    ok(m, { type: 'move', unit: id, to: [6, 1] })
    // it clears at the next Warden phase
    expect(ok(m, END).s.burn).toEqual([])
  })
})

/** The stalker created at game start strikes `a` once the Molt phase begins. */
const strike = (s: State, dice: number[]) => {
  const id = st(s)
  return ok(withDice(ok(s, END).s, dice), { type: 'melee', unit: id, target: 'a' })
}

const duel = (opts: { role?: 'warden' | 'sergeant'; ping: [number, number] }) =>
  start({
    grid: ['#######', '#.....#', '#.....#', '#######'],
    squad: [['a', opts.role ?? 'warden', 3, 1, 'E']],
    pings: [opts.ping],
  })

describe('melee', () => {
  it('M-1 a stalker attacks an adjacent Warden for 1 AP; a Warden strikes the square ahead for 1 AP', () => {
    const s = duel({ ping: [4, 1] })
    const w = ok(withDice(s, [1, 1, 6]), { type: 'melee', unit: 'a', target: st(s) })
    expect(W(w.s, 'a').ap).toBe(3)
    expect(stalkers(w.s).length).toBe(0)
    refused(s, { type: 'melee', unit: 'a', target: 'nobody' })
    // sideways stalker: the Warden cannot strike it
    const side = duel({ ping: [3, 2] })
    expect(side.units.filter((u) => u.kind === 'stalker').length).toBe(0)
    const m = ok(side, END).s
    const ping = m.units.find((u) => u.kind === 'ping')?.id ?? ''
    const rev = ok(m, { type: 'reveal', unit: ping }).s
    const hit = ok(withDice(rev, [1, 1, 6]), { type: 'melee', unit: st(rev), target: 'a' })
    expect((hit.s.units.find((u) => u.id === st(rev)) as { ap: number }).ap).toBe(5)
  })

  it('M-2 the stalker keeps the higher of two dice plus its bonus; the Warden rolls one die, the Sergeant adds 2', () => {
    const s = duel({ ping: [4, 1] })
    const r = strike(s, [3, 5, 4])
    expect(of(r.ev, 'meleeFought')[0]).toMatchObject({ attackerRoll: 5, defenderRoll: 4, attackerDice: [3, 5], defenderDice: [4] })
    const sg = duel({ role: 'sergeant', ping: [4, 1] })
    const q = strike(sg, [3, 5, 3]).ev
    expect(of(q, 'meleeFought')[0]).toMatchObject({ attackerRoll: 5, defenderRoll: 5, outcome: 'tie' })
    // the Warden striking: the stalker's dice are rolled first, then the Warden's
    const w = ok(withDice(sg, [2, 3, 5]), { type: 'melee', unit: 'a', target: st(sg) }).ev
    expect(of(w, 'meleeFought')[0]).toMatchObject({ attackerRoll: 7, defenderRoll: 3, defenderDice: [2, 3], attackerDice: [5] })
  })

  it('M-3 the higher total wins and the loser takes a lethal hit; a tie does nothing', () => {
    const s = duel({ role: 'sergeant', ping: [4, 1] })
    const tie = strike(s, [3, 5, 3])
    expect(W(tie.s, 'a').breached).toBe(false)
    expect(stalkers(tie.s).length).toBe(1)
    const lose = strike(s, [6, 6, 1])
    expect(of(lose.ev, 'meleeFought')[0]?.outcome).toBe('attacker')
    expect(W(lose.s, 'a').breached).toBe(true)
    const win = strike(s, [1, 1, 6])
    expect(of(win.ev, 'meleeFought')[0]?.outcome).toBe('defender')
    expect(stalkers(win.s).length).toBe(0)
  })

  it('M-4 from the flank the Warden is 2 down, cannot win, and turns to face the attacker', () => {
    const s = duel({ ping: [3, 2] })
    const m = ok(s, END).s
    const ping = m.units.find((u) => u.kind === 'ping')?.id ?? ''
    const rev = ok(m, { type: 'reveal', unit: ping }).s
    const lucky = ok(withDice(rev, [1, 1, 6]), { type: 'melee', unit: st(rev), target: 'a' })
    // 6 - 2 = 4 beats the stalker's 1, but a flanked Warden cannot win: a tie
    expect(of(lucky.ev, 'meleeFought')[0]).toMatchObject({ flank: true, attackerRoll: 1, defenderRoll: 4, outcome: 'tie' })
    expect(stalkers(lucky.s).length).toBe(1)
    expect(of(lucky.ev, 'turned')).toEqual([{ type: 'turned', unit: 'a', facing: 'S' }])
    expect(W(lucky.s, 'a').facing).toBe('S')
    // from the front the same dice destroy the stalker
    const front = duel({ ping: [4, 1] })
    expect(stalkers(strike(front, [1, 1, 6]).s).length).toBe(0)
  })

  it('M-5 a melee attack ends the target Warden watch', () => {
    const s = duel({ ping: [4, 1] })
    const w = ok(ok(s, { type: 'watch', unit: 'a' }).s, END).s
    const r = ok(withDice(w, [1, 1, 6]), { type: 'melee', unit: st(w), target: 'a' })
    expect(of(r.ev, 'watchEnded')[0]?.why).toBe('attacked')
    expect(W(r.s, 'a').watch).toBe(false)
  })

  it('A-1 the first lethal hit breaches the hardsuit; the next one destroys the Warden', () => {
    let s = start({
      grid: ['#######', '#.....#', '#######'],
      squad: [['a', 'warden', 3, 1, 'E'], ['b', 'warden', 1, 1, 'E']],
      pings: [[5, 1]],
    })
    // b faces east too, so the stalker arrives unseen behind a? it is in sight of a: forced reveal
    expect(stalkers(s).length).toBe(1)
    s = ok(s, END).s
    const id = st(s)
    const hit1 = ok(withDice(s, [6, 6, 1]), { type: 'move', unit: id, to: [4, 1] })
    s = hit1.s
    const r1 = ok(withDice(s, [6, 6, 1]), { type: 'melee', unit: id, target: 'a' })
    expect(types(r1.ev)).toContain('breached')
    expect(W(r1.s, 'a')).toMatchObject({ breached: true, alive: true })
    const r2 = ok(withDice(r1.s, [6, 6, 1]), { type: 'melee', unit: id, target: 'a' })
    expect(types(r2.ev)).toContain('destroyed')
    expect(W(r2.s, 'a').alive).toBe(false)
    expect(r2.s.result).toBeNull() // b still stands
    void run
  })
})
