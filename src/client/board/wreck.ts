// The wreck (spec 70 ART-9): what eleven dead years and the Molt have done to the deck before the squad arrives. Which
// bulkheads burn and which squares carry old claw marks, debris, stains and scorching. Pure and deterministic per mission
// (a square keeps its damage across reloads), and presentation only: nothing here changes a rule, a line of sight or a cost.
import { tileHash } from '../../data'
import type { Pos } from '../../engine'
import { geoOf } from '../../engine/grid'

export interface Dressing {
  at: Pos
  kind: 'claw' | 'debris' | 'stain' | 'scorch'
  /** picks the decal variant and its turn; stable for a square */
  n: number
}

export interface Wreck {
  /** wall squares with a burning breach: at least one of their faces meets the deck */
  fires: Pos[]
  dress: Dressing[]
}

/** No two fires closer than this (in squares, either axis), so the light pools stay apart. */
export const FIRE_GAP = 5
export const FIRE_MAX = 9
/** Out of 100 plain floor squares: how many carry each kind of old damage. */
export const DRESS_SHARE = { claw: 7, debris: 7, stain: 3, scorch: 3 } as const

/** A weighted pick: `n` chooses among variants in proportion to their weights (all 1 when none is given). */
export function variantOf(n: number, weights: readonly number[]): number {
  const total = weights.reduce((a, w) => a + Math.max(0, w), 0)
  if (weights.length === 0 || total <= 0) return 0
  let r = n % total
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i] as number)
    if (r < 0) return i
  }
  return weights.length - 1
}

const cache = new Map<string, Wreck>()

export function wreckOf(mission: string): Wreck {
  const hit = cache.get(mission)
  if (hit) return hit
  const g = geoOf(mission)
  const kind = (x: number, y: number): string => g.terrain[y]?.[x] ?? 'wall'
  const open = (x: number, y: number): boolean => kind(x, y) !== 'wall'

  // fires: wall squares with an open square beside them, taken in hash order while they keep their distance
  const candidates: { at: Pos; h: number }[] = []
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (kind(x, y) !== 'wall') continue
      const faces = [open(x, y - 1), open(x + 1, y), open(x, y + 1), open(x - 1, y)].filter(Boolean).length
      // one or two faces: a stretch of corridor wall, not a pillar and not the airlock's own frame
      if (faces < 1 || faces > 2) continue
      const nearAirlock = [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => kind(x + (dx as number), y + (dy as number)) === 'airlock')
      if (nearAirlock) continue
      candidates.push({ at: [x, y], h: tileHash(x * 7 + 3, y * 13 + 5) })
    }
  candidates.sort((a, b) => a.h - b.h || a.at[1] - b.at[1] || a.at[0] - b.at[0])
  const want = Math.min(FIRE_MAX, Math.max(3, Math.round(candidates.length / 20)))
  const fires: Pos[] = []
  for (const c of candidates) {
    if (fires.length >= want) break
    if (fires.every((f) => Math.max(Math.abs(f[0] - c.at[0]), Math.abs(f[1] - c.at[1])) >= FIRE_GAP)) fires.push(c.at)
  }

  // dressing: plain floor only (never an airlock, a duct, a door, a terminal or the console: those squares say something)
  const dress: Dressing[] = []
  const { claw, debris, stain, scorch } = DRESS_SHARE
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (kind(x, y) !== 'floor') continue
      const h = tileHash(x + 101, y + 57)
      const r = h % 100
      const k: Dressing['kind'] | null = r < claw ? 'claw' : r < claw + debris ? 'debris' : r < claw + debris + stain ? 'stain' : r < claw + debris + stain + scorch ? 'scorch' : null
      if (k) dress.push({ at: [x, y], kind: k, n: h >>> 7 })
    }
  const w: Wreck = { fires, dress }
  cache.set(mission, w)
  return w
}
