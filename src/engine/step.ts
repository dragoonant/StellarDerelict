import { apply, newGameState, settle, validate, type Ctx } from './rules'
import { geoOf } from './grid'
import type { Action, Setup, State, StepResult } from './types'

export function createGame(setup: Setup): State {
  const roster = setup.options?.roster
  return newGameState(setup.mission, setup.seed, Array.isArray(roster) ? roster.filter((x): x is string => typeof x === 'string') : undefined).s
}

export function step(state: State, action: Action): StepResult {
  try {
    const err = validate(state, action)
    if (err) return { ok: false, state, error: err }
    const c: Ctx = { s: structuredClone(state), ev: [], g: geoOf(state.mission) }
    apply(c, action)
    settle(c)
    return { ok: true, state: c.s, events: c.ev }
  } catch (e) {
    return { ok: false, state, error: `The engine could not apply that action (${e instanceof Error ? e.message : 'unknown'}).` }
  }
}

export function replay(setup: Setup, actions: Action[]): State {
  let s = createGame(setup)
  for (const a of actions) {
    const r = step(s, a)
    if (!r.ok) return s
    s = r.state
  }
  return s
}
