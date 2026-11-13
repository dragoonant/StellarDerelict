/** Difficulty tiers (spec 40) and the one entry point the client, the worker and the bench share. */
import { view } from '../engine'
import type { Action, Board, State } from '../engine'
import { makeRand } from './random'
import { moltPolicy } from './scripted'
import { RECRUIT, utilityAction, VETERAN, type UtilityOpts } from './molt/utility'

export type Tier = 'recruit' | 'regular' | 'veteran'
export const TIERS: readonly Tier[] = ['recruit', 'regular', 'veteran']
export const DEFAULT_TIER: Tier = 'regular'

export const TIER_LABEL: Record<Tier, string> = { recruit: 'Recruit', regular: 'Regular', veteran: 'Veteran' }

export function isTier(v: unknown): v is Tier {
  return v === 'recruit' || v === 'regular' || v === 'veteran'
}

/**
 * The next Molt action. `state` may be the full state or the Molt view (the AI only ever reads the Molt view).
 * `seed` is a number or a generator; a generator is drawn once per call.
 */
export function chooseMoltAction(state: State | Board, tier: Tier, seed: number | (() => number), opts?: UtilityOpts): Action {
  const b: Board = 'rng' in state ? view(state as State, 'molt') : state
  const s = typeof seed === 'number' ? seed >>> 0 : Math.floor(seed() * 4294967296) >>> 0
  switch (tier) {
    case 'regular':
      return moltPolicy(b, makeRand(s))
    case 'veteran':
      return utilityAction(b, VETERAN, s, opts)
    case 'recruit':
      return utilityAction(b, RECRUIT, s, opts)
  }
}

/** The tier a mission was set up with (`setup.options.difficulty`), Regular when absent or unknown. */
export function tierOfSetup(setup: { options?: Record<string, unknown> } | null | undefined): Tier {
  const d = setup?.options?.difficulty
  return isTier(d) ? d : DEFAULT_TIER
}
