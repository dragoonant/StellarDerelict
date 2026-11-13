import { legalActions } from '../engine'
import type { Action, Seat, View } from '../engine'

/** mulberry32: a small seeded generator for bots and the bench. */
export function makeRand(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A uniformly random legal action for `seat`, or null when it is not that seat's turn. */
export function randomAction(view: View, seat: Seat, rng: () => number): Action | null {
  if (view.toAct !== seat) return null
  const legal = legalActions(view)
  if (legal.length === 0) return null
  return legal[Math.floor(rng() * legal.length)] as Action
}
