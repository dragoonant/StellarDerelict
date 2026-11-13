import { getMission } from '../data'
import type { Mission, Rect, Terrain, TerminalDef } from '../data/types'
import type { Board, Facing, Pos, ViewUnit, WardenUnit } from './types'

export const keyOf = (x: number, y: number): string => `${x},${y}`
export const posKey = (p: Pos): string => `${p[0]},${p[1]}`
export const samePos = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1]
export const manhattan = (a: Pos, b: Pos): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])

export const FACING_DELTA: Record<Facing, Pos> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }
export const LEFT: Record<Facing, Facing> = { N: 'W', W: 'S', S: 'E', E: 'N' }
export const RIGHT: Record<Facing, Facing> = { N: 'E', E: 'S', S: 'W', W: 'N' }
export const ORTHO: Pos[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]

export interface Geo {
  mission: Mission
  w: number
  h: number
  terrain: Terrain[][]
  terminalAt: Record<string, TerminalDef>
  terminalById: Record<string, TerminalDef>
  ducts: Pos[]
  doorSquares: Pos[]
  consolePos: Pos | null
  airlocks: Set<string>
  sectionSquares: Record<string, Set<string>>
}

const cache = new Map<string, Geo>()

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]
}

export function buildGeo(m: Mission): Geo {
  const h = m.grid.length
  const w = m.grid[0]?.length ?? 0
  const terrain: Terrain[][] = []
  const ducts: Pos[] = []
  const doorSquares: Pos[] = []
  const airlocks = new Set<string>()
  let consolePos: Pos | null = null
  for (let y = 0; y < h; y++) {
    const row: Terrain[] = []
    const line = m.grid[y] ?? ''
    for (let x = 0; x < w; x++) {
      const t = (m.legend[line[x] ?? '#'] ?? 'wall') as Terrain
      row.push(t)
      if (t === 'duct') ducts.push([x, y])
      if (t === 'door' || t === 'bulkhead') doorSquares.push([x, y])
      if (t === 'airlock') airlocks.add(keyOf(x, y))
      if (t === 'console') consolePos = [x, y]
    }
    terrain.push(row)
  }
  const terminalAt: Record<string, TerminalDef> = {}
  const terminalById: Record<string, TerminalDef> = {}
  for (const t of m.terminals) {
    terminalAt[posKey(t.at)] = t
    terminalById[t.id] = t
  }
  const sectionSquares: Record<string, Set<string>> = {}
  for (const [name, rects] of Object.entries(m.sections)) {
    const set = new Set<string>()
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rects.some((r) => inRect(r, x, y))) set.add(keyOf(x, y))
    sectionSquares[name] = set
  }
  return { mission: m, w, h, terrain, terminalAt, terminalById, ducts, doorSquares, consolePos, airlocks, sectionSquares }
}

export function geoOf(missionId: string): Geo {
  const m = getMission(missionId)
  if (!m) throw new Error(`unknown mission ${missionId}`)
  const c = cache.get(missionId)
  if (c && c.mission === m) return c
  const g = buildGeo(m)
  cache.set(missionId, g)
  return g
}

export function terrainAt(g: Geo, x: number, y: number): Terrain {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 'wall'
  return (g.terrain[y] as Terrain[])[x] as Terrain
}

export function isAlive(u: ViewUnit): boolean {
  return u.kind !== 'warden' || u.alive
}

export function unitAt(b: Board, x: number, y: number): ViewUnit | undefined {
  for (const u of b.units) if (u.at[0] === x && u.at[1] === y && isAlive(u)) return u
  return undefined
}

export function unitById(b: Board, id: string): ViewUnit | undefined {
  for (const u of b.units) if (u.id === id) return u
  return undefined
}

export function wardens(b: Board): WardenUnit[] {
  return b.units.filter((u): u is WardenUnit => u.kind === 'warden')
}
export function livingWardens(b: Board): WardenUnit[] {
  return b.units.filter((u): u is WardenUnit => u.kind === 'warden' && u.alive)
}

/** Terrain you can walk on, given door state (burning and units ignored). */
export function enterable(b: Board, g: Geo, x: number, y: number): boolean {
  const t = terrainAt(g, x, y)
  if (t === 'wall' || t === 'terminal' || t === 'console') return false
  if (t === 'door' || t === 'bulkhead') return !!b.doors[keyOf(x, y)]?.open
  return true
}

export function isBurning(b: Board, x: number, y: number): boolean {
  for (const p of b.burn) if (p[0] === x && p[1] === y) return true
  return false
}

export function doorAt(b: Board, p: Pos): { open: boolean; sealed: boolean; torn: boolean } | undefined {
  return b.doors[posKey(p)]
}

export function isDoorSquare(g: Geo, p: Pos): boolean {
  const t = terrainAt(g, p[0], p[1])
  return t === 'door' || t === 'bulkhead'
}

/** G-5 */
export function inArc(from: Pos, facing: Facing, to: Pos): boolean {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  let fwd: number
  let lat: number
  switch (facing) {
    case 'N':
      fwd = -dy
      lat = dx
      break
    case 'S':
      fwd = dy
      lat = dx
      break
    case 'E':
      fwd = dx
      lat = dy
      break
    default:
      fwd = -dx
      lat = dy
  }
  return fwd >= 1 && Math.abs(lat) <= fwd
}

export function ahead(u: { at: Pos; facing: Facing }): Pos {
  const d = FACING_DELTA[u.facing]
  return [u.at[0] + d[0], u.at[1] + d[1]]
}
export function behind(u: { at: Pos; facing: Facing }): Pos {
  const d = FACING_DELTA[u.facing]
  return [u.at[0] - d[0], u.at[1] - d[1]]
}

// ---- rational helpers for exact line-of-sight -------------------------------------------------

interface Frac {
  n: number
  d: number
}
const lt = (a: Frac, b: Frac): boolean => a.n * b.d < b.n * a.d
const frac = (n: number, d: number): Frac => (d < 0 ? { n: -n, d: -d } : { n, d })

/** [lo, hi] open parameter interval on which the segment lies inside cell column/row `c`. */
function axisInterval(o: number, delta: number, c: number): [Frac, Frac] | null {
  // centre coordinate is o + 0.5; the cell spans (c, c+1)
  if (delta === 0) {
    return o === c ? [frac(-1000000, 1), frac(1000000, 1)] : null
  }
  const a = frac(2 * (c - o) - 1, 2 * delta)
  const b = frac(2 * (c - o) + 1, 2 * delta)
  return lt(b, a) ? [b, a] : [a, b]
}

export interface Sight {
  blocks(x: number, y: number): boolean
  los(a: Pos, b: Pos): boolean
  sees(w: WardenUnit, sq: Pos): boolean
  seen(sq: Pos): boolean
  seenBy(sq: Pos): WardenUnit[]
}

/** Snapshot of blockers for a board; build a fresh one after any change to units or doors. */
export function makeSight(b: Board, g: Geo): Sight {
  const occ = new Set<number>()
  for (const u of b.units) if (isAlive(u)) occ.add(u.at[1] * 256 + u.at[0])
  const blocks = (x: number, y: number): boolean => {
    const t = terrainAt(g, x, y)
    if (t === 'wall' || t === 'terminal' || t === 'console') return true
    if ((t === 'door' || t === 'bulkhead') && !b.doors[keyOf(x, y)]?.open) return true
    return occ.has(y * 256 + x)
  }
  // terrain-only blocking for corner leaks and end squares is the same predicate (G-6 lists units too)
  const los = (a: Pos, c: Pos): boolean => {
    const x0 = a[0]
    const y0 = a[1]
    const x1 = c[0]
    const y1 = c[1]
    if (x0 === x1 && y0 === y1) return true
    const dx = x1 - x0
    const dy = y1 - y0
    const minX = Math.min(x0, x1)
    const maxX = Math.max(x0, x1)
    const minY = Math.min(y0, y1)
    const maxY = Math.max(y0, y1)
    // adjacent squares share an edge: nothing between them
    if (Math.abs(dx) + Math.abs(dy) === 1) return true
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if ((cx === x0 && cy === y0) || (cx === x1 && cy === y1)) continue
        if (!blocks(cx, cy)) continue
        const ix = axisInterval(x0, dx, cx)
        const iy = axisInterval(y0, dy, cy)
        if (!ix || !iy) continue
        const lo = lt(ix[0], iy[0]) ? iy[0] : ix[0]
        const hi = lt(ix[1], iy[1]) ? ix[1] : iy[1]
        if (!lt(lo, hi)) continue
        // overlap with the open segment (0,1)
        if (!lt({ n: 0, d: 1 }, hi)) continue
        if (!lt(lo, { n: 1, d: 1 })) continue
        return false
      }
    }
    if (dx !== 0 && dy !== 0) {
      // corner crossings: blocked only when both squares beside the corner are blocking
      for (let gy = minY + 1; gy <= maxY; gy++) {
        for (let gx = minX + 1; gx <= maxX; gx++) {
          if ((2 * (gx - x0) - 1) * dy !== (2 * (gy - y0) - 1) * dx) continue
          const diag = dx * dy > 0
          const s1 = diag ? blocks(gx, gy - 1) : blocks(gx - 1, gy - 1)
          const s2 = diag ? blocks(gx - 1, gy) : blocks(gx, gy)
          if (s1 && s2) return false
        }
      }
    }
    return true
  }
  const sees = (w: WardenUnit, sq: Pos): boolean => w.alive && inArc(w.at, w.facing, sq) && los(w.at, sq)
  const seenBy = (sq: Pos): WardenUnit[] => {
    const out: WardenUnit[] = []
    for (const u of b.units) if (u.kind === 'warden' && sees(u, sq)) out.push(u)
    return out
  }
  const seen = (sq: Pos): boolean => {
    for (const u of b.units) if (u.kind === 'warden' && sees(u, sq)) return true
    return false
  }
  return { blocks, los, sees, seen, seenBy }
}

/** Shortest walk length from `from` to every enterable square (units and fire ignored), up to `max`. */
export function pathDistances(b: Board, g: Geo, from: Pos, max = 1e9): Map<string, number> {
  const dist = new Map<string, number>()
  dist.set(posKey(from), 0)
  const queue: Pos[] = [from]
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i] as Pos
    const d = dist.get(posKey(p)) as number
    if (d >= max) continue
    for (const o of ORTHO) {
      const nx = p[0] + o[0]
      const ny = p[1] + o[1]
      const k = keyOf(nx, ny)
      if (dist.has(k)) continue
      if (!enterable(b, g, nx, ny)) continue
      dist.set(k, d + 1)
      queue.push([nx, ny])
    }
  }
  return dist
}

export function sectionOf(g: Geo, name: string, p: Pos): boolean {
  return !!g.sectionSquares[name]?.has(posKey(p))
}
