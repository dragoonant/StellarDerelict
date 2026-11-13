/**
 * Decision kinds of the Molt AI (spec 40). Every Molt decision is classified into exactly one kind and each kind has one
 * policy in `POLICIES` (policies.ts). The two Record maps below are exhaustive on purpose: adding an action type or a
 * pending kind to the engine does not compile until it is given a kind here.
 */
import type { Action, Board, Pending } from '../../engine'

export const DECISION_KINDS = ['arrive', 'pingMove', 'pingReveal', 'stalkerAct', 'endPhase'] as const
export type DecisionKind = (typeof DECISION_KINDS)[number]

/** 'byUnit': the kind depends on who acts (ping or stalker); 'warden': not a Molt action. */
export type ActionClass = DecisionKind | 'byUnit' | 'warden'

export const ACTION_CLASS: Record<Action['type'], ActionClass> = {
  move: 'byUnit',
  door: 'byUnit',
  tear: 'stalkerAct',
  melee: 'stalkerAct',
  reveal: 'pingReveal',
  arrive: 'arrive',
  endPhase: 'endPhase',
  turn: 'warden',
  fire: 'warden',
  vent: 'warden',
  watch: 'warden',
  scorch: 'warden',
  terminal: 'warden',
  takeCore: 'warden',
}

export const PENDING_KIND: Record<Pending['kind'], DecisionKind> = {
  arrive: 'arrive',
}

/** The kind of an action on this board, or null when it is not a Molt action. */
export function kindOfAction(b: Board, a: Action): DecisionKind | null {
  const c = ACTION_CLASS[a.type]
  if (c === 'warden') return null
  if (c !== 'byUnit') return c
  const id = (a as { unit: string }).unit
  const u = b.units.find((x) => x.id === id)
  if (!u || u.kind === 'warden') return null
  return u.kind === 'ping' ? 'pingMove' : 'stalkerAct'
}

/** The kinds a board can ask for right now. */
export function kindsOpen(b: Board): DecisionKind[] {
  if (b.pending) return [PENDING_KIND[b.pending.kind]]
  return DECISION_KINDS.filter((k) => k !== 'arrive')
}
