import { expect } from 'vitest'
import { registerMission } from '../../src/data'
import type { Mission, Rect, Role, TerminalDef } from '../../src/data'
import { createGame, step } from '../../src/engine'
import type { Action, Event, Facing, Pos, State, WardenUnit } from '../../src/engine'

export type SquadSpec = [id: string, role: Role, x: number, y: number, facing: Facing]

export interface Spec {
  grid: string[]
  squad?: SquadSpec[]
  pings?: Pos[]
  bag?: number[]
  arrivals?: [number, number]
  terminals?: TerminalDef[]
  sections?: Record<string, Rect[]>
  sealed?: Pos[]
  roundLimit?: number
}

let counter = 0

/** Register a tiny ad-hoc mission through the data registry and start it. Quiet by default: no arrivals. */
export function start(spec: Spec, opts: { seed?: number; cp?: number } = {}): State {
  const id = `test-${++counter}`
  const m: Mission = {
    id,
    name: id,
    wreck: 'test hulk',
    brief: 'test',
    objective: { item: 'core', place: 'vault', exit: 'airlock' },
    legend: { '#': 'wall', '.': 'floor', A: 'airlock', V: 'duct', D: 'door', B: 'bulkhead', T: 'terminal', X: 'console' },
    grid: spec.grid.map((row) => row.replace(/[a-z]/g, '.')),
    sealed: spec.sealed ?? [],
    terminals: spec.terminals ?? [],
    sections: spec.sections ?? {},
    squad: (spec.squad ?? [['a', 'warden', 1, 1, 'E']]).map(([sid, role, x, y, facing]) => ({
      id: sid,
      name: sid.toUpperCase(),
      role,
      at: [x, y],
      facing,
    })),
    startPings: spec.pings ?? [],
    arrivals: { normal: spec.arrivals?.[0] ?? 0, alarm: spec.arrivals?.[1] ?? 0 },
    roundLimit: spec.roundLimit ?? 16,
    pingBag: spec.bag ?? [1],
  }
  registerMission(m)
  const s = createGame({ mission: id, seed: opts.seed ?? 1 })
  if (opts.cp !== undefined) return { ...s, cp: opts.cp }
  return s
}

export function ok(s: State, a: Action): { s: State; ev: Event[] } {
  const r = step(s, a)
  if (!r.ok) throw new Error(`expected ${JSON.stringify(a)} to be accepted: ${r.error}`)
  return { s: r.state, ev: r.events }
}

export function run(s: State, ...actions: Action[]): { s: State; ev: Event[] } {
  let cur = s
  const ev: Event[] = []
  for (const a of actions) {
    const r = ok(cur, a)
    cur = r.s
    ev.push(...r.ev)
  }
  return { s: cur, ev }
}

export function refused(s: State, a: Action): string {
  const r = step(s, a)
  expect(r.ok).toBe(false)
  if (r.ok) throw new Error('unreachable')
  expect(r.state).toBe(s)
  expect(r.error.length).toBeGreaterThan(3)
  return r.error
}

/** Queue the next dice (consumed before the generator). */
export function withDice(s: State, dice: number[]): State {
  return { ...s, rng: { ...s.rng, queue: [...dice] } }
}
export function withBag(s: State, bag: number[]): State {
  return { ...s, bag: [...bag] }
}
export function withCp(s: State, cp: number): State {
  return { ...s, cp }
}

export const W = (s: State, id: string): WardenUnit => s.units.find((u) => u.id === id && u.kind === 'warden') as WardenUnit
export const U = (s: State, id: string) => s.units.find((u) => u.id === id)
export const stalkers = (s: State) => s.units.filter((u) => u.kind === 'stalker')
export const pings = (s: State) => s.units.filter((u) => u.kind === 'ping')
export const types = (ev: Event[]): string[] => ev.map((e) => e.type)
export const of = <T extends Event['type']>(ev: Event[], t: T): Extract<Event, { type: T }>[] =>
  ev.filter((e): e is Extract<Event, { type: T }> => e.type === t)

export const END: Action = { type: 'endPhase' }

/** Finish the Warden phase and, with no arrivals pending, the Molt phase too. */
export function nextRound(s: State, dice: number[] = []): State {
  let cur = ok(s, END).s
  if (dice.length) cur = withDice(cur, dice)
  return ok(cur, END).s
}
