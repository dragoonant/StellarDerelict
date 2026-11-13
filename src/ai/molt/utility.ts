/**
 * The utility Molt AI entry (spec 40): classify the board into decision kinds, ask each kind's policy for scored
 * candidates, take the best legal one. Pure and deterministic given (board, profile, seed); no clock unless injected.
 */
import { legalActions, query, step } from '../../engine'
import type { Action, Board, State } from '../../engine'
import { makeRand } from '../random'
import { kindsOpen } from './kinds'
import { dynOf } from './plan'
import { END_SCORE, hash01, idHash, makeCtx, POLICIES, type Candidate, type Profile } from './policies'

export interface AiStats {
  decisions: number
  /** decisions that fell back to a random legal action */
  fallbacks: number
  /** scored candidates dropped because the engine refused them */
  rejected: number
}

/** Counters the bench reads. They never influence a decision. */
export const aiStats: AiStats = { decisions: 0, fallbacks: 0, rejected: 0 }
export function resetAiStats(): void {
  aiStats.decisions = 0
  aiStats.fallbacks = 0
  aiStats.rejected = 0
}

export interface UtilityOpts {
  /** injected clock (ms); with `budgetMs` it stops the optional lookahead early. Omit for full determinism. */
  clock?: () => number
  budgetMs?: number
}

export const VETERAN: Profile = { name: 'veteran', groupReveal: true, flankAware: true, gang: true, idleP: 0, cover: 1, revealNear: 0, wake: 0 }
export const RECRUIT: Profile = { name: 'recruit', groupReveal: false, flankAware: false, gang: false, idleP: 0.35, cover: 0, revealNear: 5, wake: 8 }

const candKey = (a: Action): string => JSON.stringify(a)

/** What one action does to our own pings, from `step` on a clone with a throwaway dice stream (outcomes of dice are ignored). */
function forcedReveals(b: Board, a: Action): number {
  const fake = { ...b, rng: { s: [1, 2, 3, 4], queue: [] }, bag: [] } as unknown as State
  const r = step(fake, a)
  if (!r.ok) return 0
  let n = 0
  for (const e of r.events) if (e.type === 'revealed' && e.forced) n++
  return n
}

export function utilityAction(b: Board, profile: Profile, seed: number, opts: UtilityOpts = {}): Action {
  aiStats.decisions++
  const t0 = opts.clock ? opts.clock() : 0
  let picked: Action | null = null
  try {
    const d = dynOf(b)
    const c = makeCtx(b, d, profile)
    const cands: Candidate[] = []
    for (const k of kindsOpen(b)) cands.push(...POLICIES[k](c))
    for (const cd of cands) cd.score += 1e-6 * hash01(seed, 17, idHash(candKey(cd.action)))
    cands.sort((x, y) => y.score - x.score)
    // short lookahead on the front runners: a door or a ping step that forces our own pings to reveal in sight is bad
    const top = cands.slice(0, 4)
    for (const cd of top) {
      if (opts.clock && opts.budgetMs !== undefined && opts.clock() - t0 > opts.budgetMs) break
      if (cd.kind === 'endPhase' || cd.kind === 'arrive' || cd.kind === 'pingReveal') continue
      if (cd.action.type !== 'door' && cd.action.type !== 'move') continue
      const n = forcedReveals(b, cd.action)
      if (n > 0) cd.score -= 6 * n
    }
    cands.sort((x, y) => y.score - x.score)
    for (const cd of cands) {
      if (cd.score < END_SCORE - 1e-9 && cd.kind !== 'arrive') continue
      if (query.why(b, cd.action) === null) {
        picked = cd.action
        break
      }
      aiStats.rejected++
    }
  } catch {
    picked = null
  }
  if (picked) return picked
  aiStats.fallbacks++
  const legal = legalActions(b)
  if (legal.length === 0) return { type: 'endPhase' }
  const rand = makeRand(seed >>> 0)
  return legal[Math.floor(rand() * legal.length)] as Action
}
