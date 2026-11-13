import { describe, expect, it } from 'vitest'
import { createGame, legalActions, query } from '../../src/engine'
import type { Pos } from '../../src/engine'
import { ok, refused, start, U, W } from './helpers'

const room = ['#########', '#.......#', '#.......#', '#.......#', '#.......#', '#########']

describe('grid and sight', () => {
  it('G-1 every square kind is read from the mission legend', () => {
    const s = createGame({ mission: 'dead-reckoning', seed: 1 })
    const kinds = (p: Pos) => query.terrain(s, p)
    expect(kinds([0, 0])).toBe('wall')
    expect(kinds([1, 1])).toBe('duct')
    expect(kinds([14, 1])).toBe('console')
    expect(kinds([13, 8])).toBe('terminal')
    expect(kinds([3, 14])).toBe('airlock')
    expect(kinds([5, 14])).toBe('door')
    expect(kinds([14, 4])).toBe('bulkhead')
    expect(kinds([10, 14])).toBe('floor')
  })

  it('G-2 a square holds one unit and walls, terminals, console and closed doors cannot be entered', () => {
    const s = start({
      grid: ['#######', '#..TXD#', '#.....#', '#######'],
      squad: [
        ['a', 'warden', 1, 1, 'E'],
        ['b', 'warden', 2, 1, 'E'],
      ],
    })
    expect(refused(s, { type: 'move', unit: 'a', to: [2, 1] })).toMatch(/occupied/)
    const b2 = ok(s, { type: 'turn', unit: 'b', facing: 'N' }).s
    expect(refused(b2, { type: 'move', unit: 'b', to: [2, 0] })).toMatch(/cannot be entered/)
    const e = start({ grid: ['#####', '#aT.#', '#####'] })
    expect(refused(e, { type: 'move', unit: 'a', to: [2, 1] })).toMatch(/cannot be entered/)
    const x = start({ grid: ['#####', '#aX.#', '#####'] })
    expect(refused(x, { type: 'move', unit: 'a', to: [2, 1] })).toMatch(/cannot be entered/)
    const d = start({ grid: ['#####', '#aD.#', '#####'] })
    expect(refused(d, { type: 'move', unit: 'a', to: [2, 1] })).toMatch(/cannot be entered/)
  })

  it('G-3 adjacency is orthogonal and path distance walks around walls', () => {
    const s = start({ grid: ['#######', '#a#...#', '#.#.#.#', '#.....#', '#######'] })
    expect(query.distance([1, 1], [3, 1])).toBe(2)
    expect(query.pathDistance(s, [1, 1], [3, 1])).toBe(6)
    expect(query.pathDistance(s, [1, 1], [0, 0])).toBeNull()
    // no diagonal step
    const t = start({ grid: ['#####', '#a..#', '#...#', '#####'] })
    expect(refused(t, { type: 'move', unit: 'a', to: [2, 2] })).toMatch(/ahead or behind/)
  })

  it('G-4 Wardens have a facing; stalkers and pings have none', () => {
    const s = start({ grid: ['#######', '#a..V.#', '#######'], pings: [[4, 1]] })
    expect(W(s, 'a').facing).toBe('E')
    const st = s.units.find((u) => u.kind === 'stalker')
    expect(st).toBeDefined()
    expect(st && 'facing' in st).toBe(false)
  })

  it('G-5 the arc is a forward cone: fwd >= 1 and |lat| <= fwd', () => {
    const s = start({ grid: room, squad: [['a', 'warden', 3, 3, 'E']] })
    const sees = (p: Pos) => query.sees(s, 'a', p)
    expect(sees([4, 3])).toBe(true)
    expect(sees([4, 2])).toBe(true) // fwd 1, lat 1
    expect(sees([4, 4])).toBe(true)
    expect(sees([4, 1])).toBe(false) // fwd 1, lat 2
    expect(sees([5, 1])).toBe(true) // fwd 2, lat 2
    expect(sees([3, 2])).toBe(false) // beside
    expect(sees([2, 3])).toBe(false) // behind
    expect(sees([3, 3])).toBe(false) // own square
  })

  it('G-6 walls, closed doors and units block sight; open doors do not; sight is symmetric', () => {
    const wall = start({ grid: ['#######', '#a.#..#', '#######'] })
    expect(query.los(wall, [1, 1], [5, 1])).toBe(false)
    const door = start({ grid: ['#######', '#a.D..#', '#######'] })
    expect(query.los(door, [1, 1], [5, 1])).toBe(false)
    const open = ok(
      start({ grid: ['#######', '#.aD..#', '#######'], squad: [['a', 'warden', 2, 1, 'E']] }),
      { type: 'door', unit: 'a', door: [3, 1] },
    ).s
    expect(query.los(open, [2, 1], [5, 1])).toBe(true)
    const units = start({
      grid: ['#########', '#a.b....#', '#########'],
      squad: [
        ['a', 'warden', 1, 1, 'E'],
        ['b', 'warden', 3, 1, 'E'],
      ],
    })
    expect(query.sees(units, 'a', [6, 1])).toBe(false)
    expect(query.sees(units, 'b', [6, 1])).toBe(true)
    for (const [p, q] of [
      [[1, 1], [6, 1]],
      [[1, 1], [3, 1]],
    ] as [Pos, Pos][])
      expect(query.los(units, p, q)).toBe(query.los(units, q, p))
  })

  it('G-6 a grid corner blocks only when both squares beside it block', () => {
    const both = start({ grid: ['####', '#a##', '##.#', '####'], squad: [['a', 'warden', 1, 1, 'S']] })
    expect(query.los(both, [1, 1], [2, 2])).toBe(false)
    const one = start({ grid: ['####', '#a.#', '##.#', '####'] })
    expect(query.los(one, [1, 1], [2, 2])).toBe(true)
    expect(query.los(one, [2, 2], [1, 1])).toBe(true)
    // a shallow line through a corner: (1,1) to (4,2) crosses the corner at (3,2)
    const shallow = start({ grid: ['######', '#a.#..', '#.#...', '######'] })
    expect(query.los(shallow, [1, 1], [4, 2])).toBe(false)
    const shallowOpen = start({ grid: ['######', '#a.#..', '#....#', '######'] })
    expect(query.los(shallowOpen, [1, 1], [4, 2])).toBe(true)
  })

  it('G-7 a square is seen when any living Warden sees it', () => {
    const s = start({
      grid: ['#########', '#a.....b#', '#########'],
      squad: [
        ['a', 'warden', 1, 1, 'E'],
        ['b', 'warden', 7, 1, 'W'],
      ],
    })
    const seen = query.seenSquares(s)
    const has = (x: number, y: number) => seen.some((p) => p[0] === x && p[1] === y)
    expect(has(3, 1)).toBe(true)
    expect(has(5, 1)).toBe(true)
    const solo = start({ grid: ['#########', '#a.....b#', '#########'], squad: [['a', 'warden', 1, 1, 'W'], ['b', 'warden', 7, 1, 'E']] })
    expect(query.seenSquares(solo).some((p) => p[0] === 4 && p[1] === 1)).toBe(false)
    expect(U(s, 'a')).toBeDefined()
    expect(legalActions(s).length).toBeGreaterThan(0)
  })
})
