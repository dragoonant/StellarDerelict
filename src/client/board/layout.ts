// Tile <-> world mapping. The deck is centred on the origin: world x = tile x, world z = tile y (south is +z), y is up.
import { geoOf } from '../../engine/grid'
import type { Pos } from '../../engine'

export interface Dims {
  w: number
  h: number
}

export function dimsOf(mission: string): Dims {
  const g = geoOf(mission)
  return { w: g.w, h: g.h }
}

export const toWorldX = (d: Dims, x: number): number => x - d.w / 2 + 0.5
export const toWorldZ = (d: Dims, y: number): number => y - d.h / 2 + 0.5
export const worldTile = (d: Dims, wx: number, wz: number): Pos => [Math.floor(wx + d.w / 2), Math.floor(wz + d.h / 2)]
export const inBoard = (d: Dims, p: Pos): boolean => p[0] >= 0 && p[1] >= 0 && p[0] < d.w && p[1] < d.h
export const WALL_H = 0.6
