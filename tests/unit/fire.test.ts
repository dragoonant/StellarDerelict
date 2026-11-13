import { describe, expect, it } from 'vitest'
import { query, step } from '../../src/engine'
import type { State } from '../../src/engine'
import { END, of, ok, refused, run, start, stalkers, types, U, W, withCp, withDice } from './helpers'

const line = (len: number) => ['#'.repeat(len), '#a' + '.'.repeat(len - 3) + '#', '#'.repeat(len)]
const target = (s: State): string => stalkers(s)[0]?.id ?? ''
const shoot = (s: State, dice: number[]) => ok(withDice(s, dice), { type: 'fire', unit: 'a', target: target(s) })

describe('movement', () => {
  it('W-1 forward costs 1, backward costs 2 and keeps facing, no sidestep', () => {
    let s = start({ grid: ['#####', '#.a.#', '#...#', '#####'], squad: [['a', 'warden', 2, 1, 'E']] })
    s = ok(s, { type: 'move', unit: 'a', to: [3, 1] }).s
    expect(W(s, 'a').ap).toBe(3)
    s = ok(s, { type: 'move', unit: 'a', to: [2, 1] }).s
    expect([W(s, 'a').ap, W(s, 'a').facing]).toEqual([1, 'E'])
    refused(s, { type: 'move', unit: 'a', to: [2, 2] })
    refused(s, { type: 'move', unit: 'a', to: [4, 1] })
  })

  it('W-2 a turn is a quarter turn for 1 AP; an about-face takes two', () => {
    let s = start({ grid: ['#####', '#.a.#', '#...#', '#####'], squad: [['a', 'warden', 2, 1, 'E']] })
    refused(s, { type: 'turn', unit: 'a', facing: 'W' })
    refused(s, { type: 'turn', unit: 'a', facing: 'E' })
    s = ok(s, { type: 'turn', unit: 'a', facing: 'S' }).s
    expect([W(s, 'a').facing, W(s, 'a').ap]).toEqual(['S', 3])
    s = ok(s, { type: 'turn', unit: 'a', facing: 'W' }).s
    expect(W(s, 'a').facing).toBe('W')
  })

  it('W-3 a Warden may not enter a burning square', () => {
    const s0 = start({
      grid: ['#######', '#r....#', '#...b.#', '#######'],
      squad: [
        ['r', 'scorcher', 1, 1, 'E'],
        ['b', 'warden', 4, 2, 'W'],
      ],
    })
    const s = ok(withDice(s0, []), { type: 'scorch', unit: 'r', at: [3, 1] }).s
    expect(s.burn.some((p) => p[0] === 3 && p[1] === 2)).toBe(true)
    expect(refused(s, { type: 'move', unit: 'b', to: [3, 2] })).toMatch(/burning/)
  })

  it('W-4 a Warden entering the loose core picks it up for no AP', () => {
    const s = coreDropped()
    const w = ok(withDice(s, [6, 6]), { type: 'fire', unit: 'b', target: target(s) })
    const before = W(w.s, 'b').ap
    const r = ok(w.s, { type: 'move', unit: 'b', to: [3, 1] })
    expect(of(r.ev, 'corePicked')).toEqual([{ type: 'corePicked', unit: 'b' }])
    expect(r.s.core).toEqual({ where: 'carried', at: null, carrier: 'b' })
    expect(W(r.s, 'b').ap).toBe(before - 1)
  })
})

/** The carrier is killed in melee; the core lies on its square. */
export function coreDropped(): State {
  let s = start({
    grid: ['#########', '#V.aX..A#', '#..b...##', '#########'],
    squad: [
      ['a', 'warden', 3, 1, 'E'],
      ['b', 'warden', 3, 2, 'N'],
    ],
    pings: [[1, 1]],
  })
  s = ok(s, { type: 'takeCore', unit: 'a' }).s
  s = ok(s, END).s
  const ping = s.units.find((u) => u.kind === 'ping')?.id ?? ''
  s = ok(s, { type: 'reveal', unit: ping }).s
  const st = target(s)
  s = ok(s, { type: 'move', unit: st, to: [2, 1] }).s
  s = ok(withDice(s, [6, 6, 1]), { type: 'melee', unit: st, target: 'a' }).s
  s = ok(withDice(s, [6, 6, 1]), { type: 'melee', unit: st, target: 'a' }).s
  s = ok(s, { type: 'move', unit: st, to: [3, 1] }).s
  return ok(s, END).s
}

describe('fire', () => {
  const sc = () => start({ grid: line(20), pings: [[4, 1]] })

  it('F-1 firing costs 1 AP and needs an unlocked repeater and a seen stalker within range', () => {
    const s = sc()
    expect(stalkers(s).length).toBe(1)
    const r = shoot(s, [1, 1])
    expect(W(r.s, 'a').ap).toBe(3)
    // out of range: 13 squares away
    const far = start({ grid: line(20), pings: [[14, 1]] })
    expect(refused(far, { type: 'fire', unit: 'a', target: target(far) })).toMatch(/range/)
    // not in sight: a closed door in the way
    const door = start({ grid: ['#########', '#a.D.V..#', '#########'], pings: [[5, 1]] })
    const m = ok(door, END).s
    const ping = m.units.find((u) => u.kind === 'ping')?.id ?? ''
    const rev = ok(ok(m, { type: 'reveal', unit: ping }).s, END).s
    expect(stalkers(rev).length).toBe(1)
    expect(refused(rev, { type: 'fire', unit: 'a', target: target(rev) })).toMatch(/sight/)
    // the scorcher carries no repeater
    const sc2 = start({ grid: line(10), squad: [['a', 'scorcher', 1, 1, 'E']], pings: [[4, 1]] })
    expect(refused(sc2, { type: 'fire', unit: 'a', target: target(sc2) })).toMatch(/repeater/)
    // a pinged target is not a stalker
    const hidden = start({ grid: ['#######', '#a.#..#', '#######'], pings: [[4, 1]] })
    refused(hidden, { type: 'fire', unit: 'a', target: hidden.units.find((u) => u.kind === 'ping')?.id ?? '' })
  })

  it('F-2 two dice, a hit needs one at 5+ in close range and 6 further out', () => {
    const near = sc()
    const close = shoot(near, [4, 5])
    expect(of(close.ev, 'fired')[0]).toMatchObject({ dice: [4, 5], need: 5, hit: true, watch: false })
    expect(stalkers(close.s).length).toBe(0)
    expect(of(shoot(near, [4, 4]).ev, 'fired')[0]?.hit).toBe(false)
    const far = start({ grid: line(20), pings: [[6, 1]] })
    expect(of(shoot(far, [5, 5]).ev, 'fired')[0]).toMatchObject({ need: 6, hit: false })
    expect(of(shoot(far, [5, 6]).ev, 'fired')[0]).toMatchObject({ need: 6, hit: true })
    // range 3 is still close, range 4 is far
    expect(of(shoot(start({ grid: line(20), pings: [[4, 1]] }), [5, 1]).ev, 'fired')[0]?.need).toBe(5)
    expect(of(shoot(start({ grid: line(20), pings: [[5, 1]] }), [5, 1]).ev, 'fired')[0]?.need).toBe(6)
  })

  it('F-3 every shot, hit or miss, adds one heat', () => {
    const s = sc()
    const miss = shoot(s, [1, 1])
    expect(W(miss.s, 'a').heat).toBe(1)
    expect(of(miss.ev, 'fired')[0]?.heat).toBe(1)
    expect(W(shoot(s, [6, 6]).s, 'a').heat).toBe(1)
  })

  it('F-4 a repeater at the heat limit is locked and cannot fire', () => {
    let s = withDice(withCp(sc(), 3), [1, 1, 1, 1, 1, 1, 1, 1])
    const ev = []
    for (let i = 0; i < 4; i++) {
      const r = ok(s, { type: 'fire', unit: 'a', target: target(s) })
      s = r.s
      ev.push(...r.ev)
    }
    expect(types(ev).filter((t) => t === 'locked').length).toBe(1)
    expect(W(s, 'a').heat).toBe(4)
    expect(query.isLocked(s, 'a')).toBe(true)
    expect(refused(s, { type: 'fire', unit: 'a', target: target(s) })).toMatch(/locked/)
  })

  it('F-5 vent clears the heat for 1 AP and heat also falls each Warden phase', () => {
    let s = withDice(sc(), [1, 1, 1, 1, 1, 1])
    s = run(s, { type: 'fire', unit: 'a', target: target(s) }, { type: 'fire', unit: 'a', target: target(s) }, { type: 'fire', unit: 'a', target: target(s) }).s
    expect(W(s, 'a').heat).toBe(3)
    const v = ok(s, { type: 'vent', unit: 'a' })
    expect(W(v.s, 'a').heat).toBe(0)
    expect(W(v.s, 'a').ap).toBe(0)
    expect(of(v.ev, 'vented')[0]).toEqual({ type: 'vented', unit: 'a', heldCp: false })
    const next = ok(ok(s, END).s, END).s
    expect(W(next, 'a').heat).toBe(1)
  })
})

describe('watch', () => {
  const sc = () => start({ grid: line(20), pings: [[4, 1]] })

  it('O-1 watch costs 2; the scorcher and a locked repeater cannot hold it', () => {
    const s = ok(sc(), { type: 'watch', unit: 'a' })
    expect(W(s.s, 'a').ap).toBe(2)
    expect(W(s.s, 'a').watch).toBe(true)
    expect(of(s.ev, 'watchSet').length).toBe(1)
    refused(s.s, { type: 'watch', unit: 'a' })
    const scorcher = start({ grid: line(10), squad: [['a', 'scorcher', 1, 1, 'E']] })
    refused(scorcher, { type: 'watch', unit: 'a' })
    let locked = withDice(withCp(sc(), 4), Array(8).fill(1))
    for (let i = 0; i < 4; i++) locked = ok(locked, { type: 'fire', unit: 'a', target: target(locked) }).s
    expect(refused(locked, { type: 'watch', unit: 'a' })).toMatch(/locked/)
  })

  it('O-2 watch ends at the next Warden phase, when the Warden acts, or when attacked', () => {
    const s = ok(sc(), { type: 'watch', unit: 'a' }).s
    const acted = ok(s, { type: 'turn', unit: 'a', facing: 'N' })
    expect(of(acted.ev, 'watchEnded')[0]).toEqual({ type: 'watchEnded', unit: 'a', why: 'acted' })
    expect(W(acted.s, 'a').watch).toBe(false)
    const phase = ok(ok(s, END).s, END)
    expect(of(phase.ev, 'watchEnded')[0]?.why).toBe('phase')
    // attacked in melee
    const m = start({ grid: ['#######', '#..a..#', '#.....#', '#######'], squad: [['a', 'warden', 3, 1, 'E']], pings: [[3, 2]] })
    const w = ok(m, { type: 'watch', unit: 'a' }).s
    const mm = ok(w, END).s
    const ping = mm.units.find((u) => u.kind === 'ping')?.id ?? ''
    const rev = ok(mm, { type: 'reveal', unit: ping }).s
    const hit = ok(withDice(rev, [1, 1, 6]), { type: 'melee', unit: target(rev), target: 'a' })
    expect(of(hit.ev, 'watchEnded')[0]?.why).toBe('attacked')
  })

  it('O-2 watch ends when the repeater locks with no held CP left', () => {
    const { s, ev } = watchDuel(0)
    expect(of(ev, 'watchEnded').map((e) => e.why)).toContain('locked')
    expect(W(s, 'a').watch).toBe(false)
  })

  it('O-3 a stalker finishing a move in a square a watcher sees fires one shot at it', () => {
    // the door hides the ping; once the stalker opens it, the watcher shoots
    let s = start({ grid: ['#########', '#a.D..V.#', '#########'], pings: [[5, 1]] })
    s = ok(s, { type: 'watch', unit: 'a' }).s
    s = ok(s, END).s
    const ping = s.units.find((u) => u.kind === 'ping')?.id ?? ''
    let r = ok(s, { type: 'reveal', unit: ping })
    expect(of(r.ev, 'fired').length).toBe(0) // a placed stalker does not trigger watch
    s = r.s
    const st = target(s)
    r = ok(s, { type: 'move', unit: st, to: [4, 1] })
    expect(of(r.ev, 'fired').length).toBe(0) // behind the closed door
    r = ok(withDice(r.s, [1, 1]), { type: 'door', unit: st, door: [3, 1] })
    expect(of(r.ev, 'fired')[0]).toMatchObject({ unit: 'a', target: st, watch: true, hit: false })
    // a melee attack does not trigger watch
    const m = start({ grid: ['#######', '#a.b..#', '#.....#', '#######'], squad: [['a', 'warden', 1, 1, 'E'], ['b', 'warden', 3, 1, 'E']], pings: [[3, 2]] })
    const t = ok(ok(m, { type: 'watch', unit: 'a' }).s, END).s
    const hit = ok(withDice(t, [1, 1, 1]), { type: 'melee', unit: target(t), target: 'b' })
    expect(of(hit.ev, 'meleeFought').length).toBe(1)
    expect(of(hit.ev, 'fired').length).toBe(0)
  })

  it('O-3 watch reaches only as far as the repeater range', () => {
    let s = start({ grid: line(20), pings: [[16, 1]] })
    s = ok(s, { type: 'watch', unit: 'a' }).s
    s = ok(s, END).s
    const st = target(s)
    const a = ok(withDice(s, [1, 1]), { type: 'move', unit: st, to: [15, 1] })
    const b = ok(withDice(a.s, [1, 1]), { type: 'move', unit: st, to: [14, 1] })
    expect(of(a.ev, 'fired').length + of(b.ev, 'fired').length).toBe(0)
    const c = ok(withDice(b.s, [1, 1]), { type: 'move', unit: st, to: [13, 1] })
    expect(of(c.ev, 'fired').length).toBe(1) // 12 squares
  })

  it('O-4 a watcher that locks spends a held CP, drops to 2 heat and keeps watching', () => {
    const { s, ev } = watchDuel(3)
    expect(of(ev, 'locked').length).toBe(1)
    expect(of(ev, 'vented')).toEqual([{ type: 'vented', unit: 'a', heldCp: true }])
    expect(W(s, 'a').heat).toBe(2)
    expect(W(s, 'a').watch).toBe(true)
    expect(s.heldCp).toBe(1)
  })
})

/** Two misses, then watch; the stalker walks two squares in sight and draws two more shots. */
function watchDuel(cp: number): { s: State; ev: ReturnType<typeof run>['ev'] } {
  let s = withCp(withDice(start({ grid: line(20), pings: [[4, 1]] }), Array(8).fill(1)), cp)
  const st = target(s)
  s = run(s, { type: 'fire', unit: 'a', target: st }, { type: 'fire', unit: 'a', target: st }, { type: 'watch', unit: 'a' }).s
  s = ok(s, END).s
  return run(s, { type: 'move', unit: st, to: [3, 1] }, { type: 'move', unit: st, to: [2, 1] })
}

export { U, step }
