/** Melee odds for hypothetical positions and the attack-sequence value table (spec 40). Pure arithmetic on rules.json. */
import { rules } from '../../data'

export interface Odds {
  win: number
  tie: number
  lose: number
}

const cache = new Map<number, Odds>()

/** A stalker attacking a Warden (the same enumeration as `query.meleeOdds`, which a unit test compares it with). */
export function stalkerOdds(flank: boolean, sergeant: boolean): Odds {
  const key = (flank ? 1 : 0) + (sergeant ? 2 : 0)
  const hit = cache.get(key)
  if (hit) return hit
  const m = rules.melee
  let win = 0
  let tie = 0
  let lose = 0
  for (let x = 1; x <= 6; x++)
    for (let y = 1; y <= 6; y++) {
      const s = (m.stalkerDice >= 2 ? Math.max(x, y) : x) + m.stalkerBonus
      for (let d = 1; d <= 6; d++) {
        const w = d + (sergeant ? m.sergeantBonus : 0) - (flank ? m.flankPenalty : 0)
        if (s > w) win++
        else if (w > s && !flank) lose++
        else tie++
      }
    }
  const n = 216
  const o = { win: win / n, tie: tie / n, lose: lose / n }
  cache.set(key, o)
  return o
}

export const MAX_ATTACKS = 8

/**
 * Value of a run of attacks by one stalker with `k` attacks left. Index with `idx(k, breached, flank)`.
 * K = value of destroying the Warden, B = value of breaching it, L = cost of losing the stalker.
 * After any attack that leaves the Warden alive it has turned to face the attacker, so later attacks are frontal.
 */
export function attackTable(sergeant: boolean, K: number, B: number, L: number): Float64Array {
  const t = new Float64Array((MAX_ATTACKS + 1) * 4)
  for (let k = 1; k <= MAX_ATTACKS; k++)
    for (let br = 0; br < 2; br++)
      for (let fl = 0; fl < 2; fl++) {
        const o = stalkerOdds(fl === 1, sergeant)
        const win = br === 1 ? K : B + (t[tIdx(k - 1, true, false)] as number)
        const tie = t[tIdx(k - 1, br === 1, false)] as number
        const ev = o.win * win + o.tie * tie - o.lose * L
        t[tIdx(k, br === 1, fl === 1)] = Math.max(0, ev)
      }
  return t
}

export function tIdx(k: number, breached: boolean, flank: boolean): number {
  return Math.min(k, MAX_ATTACKS) * 4 + (breached ? 2 : 0) + (flank ? 1 : 0)
}
