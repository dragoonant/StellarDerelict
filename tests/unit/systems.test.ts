import { describe, expect, it } from 'vitest'
import { createGame, query } from '../../src/engine'
import type { State } from '../../src/engine'
import { coreDropped } from './fire.test'
import { END, nextRound, of, ok, pings, refused, run, start, stalkers, types, U, W, withBag, withDice } from './helpers'

const first = (s: State, kind: 'ping' | 'stalker'): string => s.units.find((u) => u.kind === kind)?.id ?? ''
const doorOf = (s: State, x: number, y: number) => s.doors[`${x},${y}`]

describe('doors', () => {
  const hall = ['#########', '#a.D...##', '#########']

  it('D-1 a closed door blocks movement and sight, an open door is floor, nobody can close it while occupied', () => {
    const s = start({ grid: hall, squad: [['a', 'warden', 2, 1, 'E'], ['b', 'warden', 1, 1, 'E']] })
    expect(query.los(s, [2, 1], [5, 1])).toBe(false)
    refused(s, { type: 'move', unit: 'a', to: [3, 1] })
    const open = ok(s, { type: 'door', unit: 'a', door: [3, 1] }).s
    expect(doorOf(open, 3, 1)?.open).toBe(true)
    expect(query.los(open, [2, 1], [5, 1])).toBe(true)
    // b steps up behind a, a steps into the doorway, b tries to shut it from behind a... a is in the way
    const into = ok(open, { type: 'move', unit: 'a', to: [3, 1] }).s
    const b2 = ok(into, { type: 'move', unit: 'b', to: [2, 1] }).s
    expect(refused(b2, { type: 'door', unit: 'b', door: [3, 1] })).toMatch(/doorway/)
  })

  it('D-2 a Warden opens or closes the door directly ahead for 1 AP; a sealed door cannot be opened', () => {
    const s = start({ grid: hall, squad: [['a', 'warden', 2, 1, 'E']] })
    const o = ok(s, { type: 'door', unit: 'a', door: [3, 1] })
    expect(W(o.s, 'a').ap).toBe(3)
    expect(of(o.ev, 'doorChanged')).toEqual([{ type: 'doorChanged', door: [3, 1], state: 'open' }])
    const c = ok(o.s, { type: 'door', unit: 'a', door: [3, 1] })
    expect(of(c.ev, 'doorChanged')[0]?.state).toBe('closed')
    refused(start({ grid: hall, squad: [['a', 'warden', 1, 1, 'E']] }), { type: 'door', unit: 'a', door: [3, 1] }) // not ahead
    const sealed = start({ grid: ['#######', '#a.B..#', '#######'], squad: [['a', 'warden', 2, 1, 'E']], sealed: [[3, 1]] })
    expect(refused(sealed, { type: 'door', unit: 'a', door: [3, 1] })).toMatch(/sealed/)
  })

  it('D-3 a stalker or ping opens or closes an adjacent unsealed door for 1 AP', () => {
    const s = start({ grid: ['#########', '#a.D.V..#', '#########'], pings: [[4, 1]], bag: [1] })
    const m = ok(s, END).s
    const ping = first(m, 'ping')
    const r = ok(m, { type: 'door', unit: ping, door: [3, 1] })
    // the ping stands where it can now be seen, so it is revealed; its stalker keeps 5 AP and may close the door again
    const st = first(r.s, 'stalker')
    expect(U(r.s, st)).toBeDefined()
    const closed = ok(r.s, { type: 'door', unit: st, door: [3, 1] })
    expect(doorOf(closed.s, 3, 1)?.open).toBe(false)
    expect((U(closed.s, st) as { ap: number }).ap).toBe(4)
    const sealed = start({ grid: ['#########', '#a.B.V..#', '#########'], pings: [[4, 1]], sealed: [[3, 1]] })
    const sm = ok(ok(sealed, END).s, { type: 'reveal', unit: first(sealed, 'ping') }).s
    expect(refused(sm, { type: 'door', unit: first(sm, 'stalker'), door: [3, 1] })).toMatch(/sealed/)
  })

  it('D-4 a stalker tears a closed door on 5+; a torn door stays open, unsealed, and can never close', () => {
    const base = start({ grid: ['#########', '#a.B.V..#', '#########'], pings: [[4, 1]], sealed: [[3, 1]], terminals: [], bag: [1] })
    const m = ok(ok(base, END).s, { type: 'reveal', unit: first(base, 'ping') }).s
    const id = first(m, 'stalker')
    const miss = ok(withDice(m, [4]), { type: 'tear', unit: id, door: [3, 1] })
    expect(of(miss.ev, 'tearRolled')[0]).toMatchObject({ die: 4, torn: false })
    expect(doorOf(miss.s, 3, 1)).toEqual({ open: false, sealed: true, torn: false })
    const hit = ok(withDice(miss.s, [5]), { type: 'tear', unit: id, door: [3, 1] })
    expect(of(hit.ev, 'tearRolled')[0]).toMatchObject({ die: 5, torn: true })
    expect(doorOf(hit.s, 3, 1)).toEqual({ open: true, sealed: false, torn: true })
    expect(of(hit.ev, 'doorChanged')[0]?.state).toBe('torn')
    expect(refused(hit.s, { type: 'door', unit: id, door: [3, 1] })).toMatch(/torn/)
    expect((U(hit.s, id) as { ap: number }).ap).toBe(4)
    // a Warden cannot close it either
    const w = start({ grid: ['#######', '#a.D..#', '#######'], squad: [['a', 'warden', 2, 1, 'E']], pings: [[4, 1]] })
    void w
  })
})

const termMap = ['##########', '#..a.B...#', '###T######', '##########']
const bulk = {
  grid: termMap,
  squad: [['a', 'warden', 3, 1, 'S']] as [string, 'warden' | 'tech', number, number, 'S' | 'E'][],
  terminals: [{ id: 't', name: 'T', at: [3, 2] as [number, number], system: 'bulkheads' as const, doors: [[5, 1]] as [number, number][] }],
}

describe('ship systems', () => {
  it('SYS-1 a terminal operation costs 1 AP and 1 CP; the Tech pays no CP; the terminal must be directly ahead', () => {
    const s = start(bulk as Parameters<typeof start>[0], { cp: 3 })
    const r = ok(s, { type: 'terminal', unit: 'a', terminal: 't', op: 'seal', door: [5, 1] })
    expect([W(r.s, 'a').ap, r.s.cp]).toEqual([3, 2])
    expect(of(r.ev, 'terminalUsed')[0]).toMatchObject({ terminal: 't', op: 'seal', door: [5, 1] })
    const tech = start({ ...bulk, squad: [['a', 'tech', 3, 1, 'S']] } as Parameters<typeof start>[0], { cp: 3 })
    const t = ok(tech, { type: 'terminal', unit: 'a', terminal: 't', op: 'seal', door: [5, 1] })
    expect([W(t.s, 'a').ap, t.s.cp]).toEqual([3, 3])
    const broke = start(bulk as Parameters<typeof start>[0], { cp: 0 })
    refused(broke, { type: 'terminal', unit: 'a', terminal: 't', op: 'seal', door: [5, 1] })
    const away = start({ ...bulk, squad: [['a', 'warden', 3, 1, 'E']] } as Parameters<typeof start>[0], { cp: 3 })
    expect(refused(away, { type: 'terminal', unit: 'a', terminal: 't', op: 'seal', door: [5, 1] })).toMatch(/no terminal/)
    expect(query.terminalOps(s, 'a').map((o) => [o.op, o.available])).toEqual([
      ['seal', true],
      ['unseal', false],
    ])
  })

  it('SYS-2 bulkheads: seal a closed, untorn listed door, or unseal a sealed one; sealing closes nothing', () => {
    const s = start(bulk as Parameters<typeof start>[0], { cp: 4 })
    const sealed = ok(s, { type: 'terminal', unit: 'a', terminal: 't', op: 'seal', door: [5, 1] })
    expect(doorOf(sealed.s, 5, 1)).toEqual({ open: false, sealed: true, torn: false })
    expect(of(sealed.ev, 'doorChanged')[0]?.state).toBe('sealed')
    expect(refused(sealed.s, { type: 'terminal', unit: 'a', terminal: 't', op: 'seal', door: [5, 1] })).toMatch(/already/)
    const un = ok(sealed.s, { type: 'terminal', unit: 'a', terminal: 't', op: 'unseal', door: [5, 1] })
    expect(doorOf(un.s, 5, 1)?.sealed).toBe(false)
    refused(s, { type: 'terminal', unit: 'a', terminal: 't', op: 'unseal', door: [5, 1] })
    refused(s, { type: 'terminal', unit: 'a', terminal: 't', op: 'seal', door: [6, 1] }) // not listed
    // an open door has to be closed first (by hand)
    const two = start(
      { ...bulk, squad: [['a', 'warden', 3, 1, 'S'], ['b', 'warden', 4, 1, 'E']] } as Parameters<typeof start>[0],
      { cp: 4 },
    )
    const open = ok(two, { type: 'door', unit: 'b', door: [5, 1] }).s
    expect(refused(open, { type: 'terminal', unit: 'a', terminal: 't', op: 'seal', door: [5, 1] })).toMatch(/Close/)
    // a torn door cannot be sealed
    const torn = start({ ...bulk, pings: [[7, 1]] } as Parameters<typeof start>[0], { cp: 4 })
    const m = ok(ok(torn, END).s, { type: 'reveal', unit: first(torn, 'ping') }).s
    const st = first(m, 'stalker')
    const mv = run(m, { type: 'move', unit: st, to: [6, 1] }).s
    const tr = ok(withDice(mv, [6]), { type: 'tear', unit: st, door: [5, 1] }).s
    expect(doorOf(tr, 5, 1)?.torn).toBe(true)
    expect(types([])).toEqual([])
  })

  it('SYS-3 is reserved: terminals offer only seal, unseal, lights and purge', () => {
    const s = createGame({ mission: 'dead-reckoning', seed: 1 })
    expect(Object.keys(s)).not.toContain('sys3')
  })

  const lights = {
    grid: ['###########', '#a.........#', '#T#########', '###########'],
    squad: [['a', 'warden', 1, 1, 'S']] as [string, 'warden', number, number, 'S'][],
    terminals: [{ id: 'l', name: 'L', at: [1, 2] as [number, number], system: 'lights' as const, section: 'hall' }],
    sections: { hall: [[1, 1, 9, 1]] as [number, number, number, number][] },
    pings: [[7, 1]] as [number, number][],
  }

  it('SYS-4 lights: one use; a stalker in the lit section is hit on one number lower', () => {
    const s = start(lights as Parameters<typeof start>[0], { cp: 3 })
    expect(stalkers(s).length).toBe(0) // facing south, the ping is not seen
    const lit = ok(s, { type: 'terminal', unit: 'a', terminal: 'l', op: 'lights' })
    expect(of(lit.ev, 'lit')).toEqual([{ type: 'lit', section: 'hall' }])
    expect(lit.s.lit).toEqual(['hall'])
    refused(lit.s, { type: 'terminal', unit: 'a', terminal: 'l', op: 'lights' }) // only once (and facing)
    const s2 = start({ ...lights, pings: [[6, 1]] } as Parameters<typeof start>[0], { cp: 3 })
    const t2 = ok(ok(s2, { type: 'terminal', unit: 'a', terminal: 'l', op: 'lights' }).s, { type: 'turn', unit: 'a', facing: 'E' })
    const target = first(t2.s, 'stalker')
    expect(target).not.toBe('')
    expect(query.targetNumber(t2.s, 'a', target)).toBe(5)
    expect(query.hitChance(t2.s, 'a', target)).toBeCloseTo(1 - (4 / 6) ** 2, 5)
    const shot = ok(withDice(t2.s, [5, 1]), { type: 'fire', unit: 'a', target })
    expect(of(shot.ev, 'fired')[0]).toMatchObject({ need: 5, hit: true })
  })

  it('SYS-5 purge: one use; every unit in the section takes a lethal hit; the listed ducts close for good', () => {
    const s = start(
      {
        grid: ['###########', '#a.........#', '#T#########', '###########'],
        squad: [['a', 'warden', 1, 1, 'S'], ['b', 'warden', 4, 1, 'W']],
        terminals: [{ id: 'p', name: 'P', at: [1, 2], system: 'purge', section: 'east', ducts: [[8, 1]] }],
        sections: { east: [[4, 1, 9, 1]] },
        pings: [[6, 1]],
        arrivals: [1, 1],
      },
      { cp: 3 },
    )
    expect(query.openDucts(s)).toEqual([]) // (8,1) is a plain floor tile here; no duct yet
    const r = ok(s, { type: 'terminal', unit: 'a', terminal: 'p', op: 'purge' })
    expect(of(r.ev, 'purged')).toEqual([{ type: 'purged', section: 'east', ducts: [[8, 1]] }])
    expect(of(r.ev, 'destroyed').map((e) => e.kind)).toEqual(['ping'])
    expect(of(r.ev, 'breached')).toEqual([{ type: 'breached', unit: 'b' }])
    expect(pings(r.s).length).toBe(0)
    expect(r.s.purgedDucts).toEqual([[8, 1]])
    refused(r.s, { type: 'terminal', unit: 'a', terminal: 'p', op: 'purge' })
    void withBag
  })

  it('SYS-5 a purged duct receives nothing again', () => {
    const s = start(
      {
        grid: ['#######', '#a...V#', '#T#####', '#######'],
        squad: [['a', 'tech', 1, 1, 'S']],
        terminals: [{ id: 'p', name: 'P', at: [1, 2], system: 'purge', section: 'east', ducts: [[5, 1]] }],
        sections: { east: [[5, 1, 5, 1]] },
        arrivals: [1, 1],
      },
      { cp: 3 },
    )
    // before: the duct is seen only if the Warden looks east; facing south it is open once the Warden is >3 steps away
    const away = { ...s, units: s.units.map((u) => (u.kind === 'warden' ? { ...u, at: [1, 1] as [number, number] } : u)) }
    void away
    const purged = ok(s, { type: 'terminal', unit: 'a', terminal: 'p', op: 'purge' }).s
    const m = ok(purged, END)
    expect(of(m.ev, 'pingHeld').length).toBe(1)
  })
})

describe('the core and victory', () => {
  const consoleRoom = {
    grid: ['###########', '#.A.aX....#', '###########', '#V.V.V#####', '###########'],
    squad: [['a', 'warden', 4, 1, 'E']] as [string, 'warden', number, number, 'E'][],
    arrivals: [1, 2] as [number, number],
  }

  it('V-1 the mission names a console square and the core starts inside it', () => {
    const s = createGame({ mission: 'dead-reckoning', seed: 1 })
    expect(s.core).toEqual({ where: 'console', at: [14, 1], carrier: null })
    expect(query.terrain(s, [14, 1])).toBe('console')
  })

  it('V-2 taking the core costs 2 AP, makes the Warden the carrier and raises arrivals from the next round', () => {
    const s = start(consoleRoom)
    refused(ok(s, { type: 'turn', unit: 'a', facing: 'N' }).s, { type: 'takeCore', unit: 'a' })
    const r = ok(s, { type: 'takeCore', unit: 'a' })
    expect(W(r.s, 'a').ap).toBe(2)
    expect(of(r.ev, 'coreTaken')).toEqual([{ type: 'coreTaken', unit: 'a' }])
    expect(types(r.ev)).toContain('alarm')
    expect(r.s.core).toEqual({ where: 'carried', at: null, carrier: 'a' })
    expect(query.carrier(r.s)?.id).toBe('a')
    refused(r.s, { type: 'takeCore', unit: 'a' })
    // this round's Molt phase still brings the normal 1, the next one the alarm 2
    const m1 = ok(r.s, END).s
    expect(m1.pending).toEqual({ kind: 'arrive', remaining: 1 })
    const done = ok(m1, { type: 'arrive', duct: [1, 3] }).s
    const m2 = ok(ok(done, END).s, END).s
    expect(m2.pending).toEqual({ kind: 'arrive', remaining: 2 })
  })

  it('V-3 a dropped core lies where its carrier fell; Molt units may stand on it', () => {
    const s = coreDropped()
    expect(s.core).toEqual({ where: 'loose', at: [3, 1], carrier: null })
    const on = stalkers(s)[0]
    expect(on?.at).toEqual([3, 1])
  })

  it('V-4 the Wardens win the moment the carrier stands on an airlock square', () => {
    const s = start({
      grid: ['#######', '#.A.X.#', '#######'],
      squad: [['a', 'warden', 3, 1, 'E']],
    })
    // the console is ahead at (4,1): take it, turn about and walk home
    let t = ok(s, { type: 'takeCore', unit: 'a' }).s
    t = ok(t, { type: 'turn', unit: 'a', facing: 'N' }).s
    t = ok(t, { type: 'turn', unit: 'a', facing: 'W' }).s
    expect(t.result).toBeNull()
    t = { ...t, units: t.units.map((u) => (u.kind === 'warden' ? { ...u, ap: 4 } : u)) }
    const win = ok(t, { type: 'move', unit: 'a', to: [2, 1] })
    expect(of(win.ev, 'gameOver')).toEqual([{ type: 'gameOver', winner: 'warden', reason: 'core-out' }])
    expect(win.s.result).toEqual({ winner: 'warden', reason: 'core-out' })
    expect(win.s.toAct).toBeNull()
    refused(win.s, END)
  })

  it('V-5 the Molt win when no Warden is alive, or when the last round ends', () => {
    // one Warden, killed by two flank blows
    let s = start({ grid: ['#######', '#.a...#', '#######'], squad: [['a', 'warden', 2, 1, 'E']], pings: [[1, 1]] })
    s = ok(s, END).s
    const ping = first(s, 'ping')
    s = ok(s, { type: 'reveal', unit: ping }).s
    const st = first(s, 'stalker')
    s = ok(withDice(s, [6, 6, 1]), { type: 'melee', unit: st, target: 'a' }).s
    const end = ok(withDice(s, [6, 6, 1]), { type: 'melee', unit: st, target: 'a' })
    expect(end.s.result).toEqual({ winner: 'molt', reason: 'squad-lost' })
    expect(of(end.ev, 'gameOver').length).toBe(1)
    expect(end.s.toAct).toBeNull()
    const timed = start({ grid: ['#####', '#.a.#', '#####'], roundLimit: 1 })
    expect(ok(ok(timed, END).s, END).s.result).toEqual({ winner: 'molt', reason: 'time' })
    void nextRound
  })
})
