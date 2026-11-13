import { describe, expect, it } from 'vitest'
import { legalActions, query, step, view } from '../../src/engine'
import type { PingUnit, State } from '../../src/engine'
import { END, of, ok, pings, refused, start, stalkers, types, W, withBag, withDice } from './helpers'

const first = (s: State, kind: 'ping' | 'stalker'): string => s.units.find((u) => u.kind === kind)?.id ?? ''
const ap = (s: State, id: string): number => (s.units.find((u) => u.id === id) as { ap: number }).ap

/** Ducts sit in a sealed-off strip, so they are never seen and never near a Warden. */
const ducts = ['###########', '#a........#', '###########', '#V.V.V#####', '###########']

describe('arrivals and pings', () => {
  it('P-1 arrivals come in one at a time, each drawing from the bag; the Warden never sees the count', () => {
    let s = start({ grid: ducts, arrivals: [2, 3] })
    s = withBag(s, [2, 3])
    const m = ok(s, END).s
    expect(m.pending).toEqual({ kind: 'arrive', remaining: 2 })
    const a1 = ok(m, { type: 'arrive', duct: [1, 3] })
    expect(of(a1.ev, 'pingArrived')[0]).toMatchObject({ duct: [1, 3] })
    expect((pings(a1.s)[0] as PingUnit).stalkers).toBe(2)
    expect(a1.s.pending).toEqual({ kind: 'arrive', remaining: 1 })
    const a2 = ok(a1.s, { type: 'arrive', duct: [3, 3] })
    expect((pings(a2.s)[1] as PingUnit).stalkers).toBe(3)
    expect(a2.s.pending).toBeNull()
    expect(JSON.stringify(view(a2.s, 'warden'))).not.toContain('stalkers')
    // the bag refills (reshuffled) when it runs dry
    const dry = withBag(start({ grid: ducts, arrivals: [1, 1] }), [])
    const d = ok(ok(dry, END).s, { type: 'arrive', duct: [1, 3] }).s
    expect([1]).toContain((pings(d)[0] as PingUnit).stalkers)
  })

  it('P-2 the Molt player picks an open duct: not purged, occupied, seen, or within 3 steps of a Warden', () => {
    const s = start({
      grid: [
        '############',
        '#a.......V.#',
        '#.########.#',
        '#V########V#',
        '##########.#',
        '##########V#',
        '############',
      ],
      pings: [[10, 3]],
      arrivals: [1, 1],
    })
    // (9,1) is seen, (1,3) is two steps from the Warden, (10,3) is occupied
    expect(query.openDucts(s)).toEqual([[10, 5]])
    const m = ok(s, END).s
    expect(refused(m, { type: 'arrive', duct: [9, 1] })).toMatch(/not open/)
    refused(m, { type: 'arrive', duct: [1, 3] })
    refused(m, { type: 'arrive', duct: [10, 3] })
    ok(m, { type: 'arrive', duct: [10, 5] })
    expect(legalActions(m)).toEqual([{ type: 'arrive', duct: [10, 5] }])
    refused(m, END) // arrivals must be placed first
  })

  it('P-3 with no open duct the ping is held over to the next round', () => {
    let s = start({ grid: ['###########', '#a.......V#', '###########'], arrivals: [1, 1] })
    const m = ok(s, END)
    expect(of(m.ev, 'pingHeld').length).toBe(1)
    expect(m.s.heldOver).toBe(1)
    expect(m.s.pending).toBeNull()
    // next round the Warden looks away; the held ping joins the arrivals
    s = ok(m.s, END).s
    s = ok(s, { type: 'turn', unit: 'a', facing: 'S' }).s
    const m2 = ok(s, END).s
    expect(m2.pending).toEqual({ kind: 'arrive', remaining: 2 })
    expect(m2.heldOver).toBe(0)
  })

  it('P-4 a ping moves one square for 1 AP, may not enter sight or fire, opens doors, never attacks or tears', () => {
    const s = start({
      grid: ['########', '#a.....#', '######.#', '######.#', '########'],
      pings: [[6, 2]],
    })
    expect(stalkers(s).length).toBe(0)
    const m = ok(s, END).s
    const id = first(m, 'ping')
    expect(refused(m, { type: 'move', unit: id, to: [6, 1] })).toMatch(/sight/)
    const r = ok(m, { type: 'move', unit: id, to: [6, 3] })
    expect(ap(r.s, id)).toBe(5)
    refused(m, { type: 'tear', unit: id, door: [6, 3] })
    refused(m, { type: 'melee', unit: id, target: 'a' })
    // a door
    const d = start({ grid: ['#######', '#a#...#', '#.D...#', '#######'], squad: [['a', 'warden', 1, 1, 'S']], pings: [[3, 2]] })
    const dm = ok(d, END).s
    const pid = first(dm, 'ping')
    const o = ok(dm, { type: 'door', unit: pid, door: [2, 2] })
    expect(ap(o.s, pid)).toBe(5)
    // a burning square is closed to pings too
    const b = start({ grid: ['#########', '#r......#', '###.#####', '###.#####', '#########'], squad: [['r', 'scorcher', 1, 1, 'E']], pings: [[3, 3]] })
    const burned = ok(withDice(b, [1]), { type: 'scorch', unit: 'r', at: [3, 1] }).s
    expect(burned.burn.some((p) => p[0] === 3 && p[1] === 2)).toBe(true)
    const bm = ok(burned, END).s
    expect(refused(bm, { type: 'move', unit: first(bm, 'ping'), to: [3, 2] })).toMatch(/burning/)
  })

  it('P-5 a ping that has spent no AP reveals for free; after moving it cannot', () => {
    const s = start({ grid: ['########', '#a.....#', '######.#', '######.#', '########'], pings: [[6, 2]], bag: [2] })
    const m = ok(s, END).s
    const id = first(m, 'ping')
    const rev = ok(m, { type: 'reveal', unit: id })
    expect(of(rev.ev, 'revealed')[0]).toMatchObject({ ping: id, stalkers: 2, lost: 0, forced: false })
    expect(stalkers(rev.s).length).toBe(2)
    expect(stalkers(rev.s).every((u) => (u as { ap: number }).ap === 6)).toBe(true)
    const moved = ok(m, { type: 'move', unit: id, to: [6, 3] }).s
    expect(refused(moved, { type: 'reveal', unit: id })).toMatch(/spent/)
  })

  it('P-6 extra stalkers take the nearest unseen enterable square, ties by lower y then lower x', () => {
    const open = start({
      grid: ['#########', '#a......#', '#.......#', '#.......#', '#.......#', '#########'],
      squad: [['a', 'warden', 1, 1, 'W']],
      pings: [[5, 3]],
      bag: [3],
    })
    const m = ok(open, END).s
    const r = ok(m, { type: 'reveal', unit: first(m, 'ping') })
    const at = stalkers(r.s).map((u) => u.at.join(','))
    expect(at).toEqual(['5,3', '5,2', '4,3'])
    // seen squares are a last resort
    const pocket = start({ grid: ['#########', '#a......#', '###.#####', '###.#####', '#########'], pings: [[3, 2]], bag: [3] })
    expect(pings(pocket).length).toBe(1)
    const pm = ok(pocket, END).s
    const pr = ok(pm, { type: 'reveal', unit: first(pm, 'ping') })
    expect(stalkers(pr.s).map((u) => u.at.join(','))).toEqual(['3,2', '3,3', '3,1'])
    // no room: the surplus stalker is lost
    const cell = start({ grid: ['########', '#a..#..#', '########'], pings: [[5, 1]], bag: [3] })
    const cm = ok(cell, END).s
    const cr = ok(cm, { type: 'reveal', unit: first(cm, 'ping') })
    expect(of(cr.ev, 'revealed')[0]).toMatchObject({ stalkers: 3, lost: 1 })
    expect(stalkers(cr.s).length).toBe(2)
  })

  it('P-7 a ping on a seen square is revealed at once: turning, moving or opening a door', () => {
    // turning
    const t = start({ grid: ['#####', '#.a.#', '#.V.#', '#####'], squad: [['a', 'warden', 2, 1, 'E']], pings: [[2, 2]], bag: [2] })
    expect(pings(t).length).toBe(1)
    const turned = ok(t, { type: 'turn', unit: 'a', facing: 'S' })
    expect(of(turned.ev, 'revealed')[0]).toMatchObject({ ping: first(t, 'ping'), forced: true, stalkers: 2 })
    expect(pings(turned.s).length).toBe(0)
    expect(types(turned.ev).indexOf('turned')).toBeLessThan(types(turned.ev).indexOf('revealed'))
    // a door
    const d = start({ grid: ['#########', '#.a.D.V.#', '#########'], squad: [['a', 'warden', 2, 1, 'E']], pings: [[6, 1]] })
    const dm = ok(d, { type: 'move', unit: 'a', to: [3, 1] }).s
    expect(pings(dm).length).toBe(1)
    const opened = ok(dm, { type: 'door', unit: 'a', door: [4, 1] })
    expect(of(opened.ev, 'revealed')[0]?.forced).toBe(true)
    // in the Molt phase the stalkers keep the ping's remaining AP
    const m = start({ grid: ['#########', '#a.D.V..#', '#########'], pings: [[4, 1]], bag: [2] })
    const mm = ok(m, END).s
    const pid = first(mm, 'ping')
    const r = ok(mm, { type: 'door', unit: pid, door: [3, 1] })
    expect(of(r.ev, 'revealed')[0]).toMatchObject({ forced: true, stalkers: 2 })
    expect(stalkers(r.s).every((u) => (u as { ap: number }).ap === 5)).toBe(true)
  })
})

describe('stalkers', () => {
  const hall = ['###########', '#a........#', '###########']

  it('S-1 a stalker moves one square for 1 AP and never into a burning square', () => {
    const s = start({ grid: hall, pings: [[5, 1]] })
    const m = ok(s, END).s
    const id = first(m, 'stalker')
    const r = ok(m, { type: 'move', unit: id, to: [4, 1] })
    expect(ap(r.s, id)).toBe(5)
    refused(m, { type: 'move', unit: id, to: [3, 1] })
    const sc = start({ grid: hall, squad: [['r', 'scorcher', 1, 1, 'E']], pings: [[5, 1]] })
    const burned = ok(withDice(sc, [1]), { type: 'scorch', unit: 'r', at: [4, 1] }).s
    expect(refused(ok(burned, END).s, { type: 'move', unit: first(burned, 'stalker'), to: [4, 1] })).toMatch(/burning/)
  })

  it('S-2 a stalker attacks as in M-1: 1 AP, adjacent Warden only', () => {
    const s = start({ grid: hall, pings: [[2, 1]] })
    const m = ok(s, END).s
    const id = first(m, 'stalker')
    const r = ok(withDice(m, [1, 1, 1]), { type: 'melee', unit: id, target: 'a' })
    expect(ap(r.s, id)).toBe(5)
    const far = start({ grid: hall, pings: [[6, 1]] })
    refused(ok(far, END).s, { type: 'melee', unit: first(far, 'stalker'), target: 'a' })
  })

  it('S-3 stalkers have one wound: a single hit destroys them', () => {
    const s = start({ grid: hall, pings: [[3, 1]] })
    const r = ok(withDice(s, [6, 1]), { type: 'fire', unit: 'a', target: first(s, 'stalker') })
    expect(stalkers(r.s).length).toBe(0)
    expect(of(r.ev, 'destroyed')[0]).toMatchObject({ kind: 'stalker', by: 'a' })
  })
})

void step
void W
void withBag
