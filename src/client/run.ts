// The boarding run (spec 10 section 15, R-1..R-5): the run's missions in order, played by one squad whose survivors board
// the next wreck section. Pure except for the two storage calls at the bottom; no rules arithmetic (the engine decides
// each mission, this only carries the roster and the tally between them).
import { getMission, rules, runDef } from '../data'
import type { GameResult, State } from '../engine'
import type { Tier } from '../ai/tiers'

export const RUN_KEY = 'stellar-derelict-run'

export interface RunResult {
  mission: string
  won: boolean
  reason: GameResult['reason']
  rounds: number
  /** Wardens destroyed in this mission */
  lost: string[]
  kills: number
}

export interface RunState {
  id: string
  name: string
  missions: string[]
  /** index of the mission being played or boarded next */
  index: number
  /** R-2: who boards the next mission */
  roster: string[]
  results: RunResult[]
  difficulty: Tier
  /** R-5: every mission seed derives from this one, so a run replays */
  seed: number
  /** 'open' while missions remain, else how it ended */
  status: 'open' | 'complete' | 'lost' | 'pulled-out'
}

/** R-1: a new run on the first mission with the whole squad. */
export function newRun(difficulty: Tier, seed: number): RunState {
  const first = getMission(runDef.missions[0] ?? '')
  return {
    id: runDef.id,
    name: runDef.name,
    missions: [...runDef.missions],
    index: 0,
    roster: first ? first.squad.map((q) => q.id) : [],
    results: [],
    difficulty,
    seed: seed >>> 0,
    status: 'open',
  }
}

/** R-5: the seed of mission `index` in a run (a small integer hash so the sim can reproduce a run from one number). */
export function missionSeed(run: RunState, index: number): number {
  let h = (run.seed ^ 0x9e3779b9) >>> 0
  for (let i = 0; i <= index; i++) {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
    h = Math.imul(h ^ (h >>> 13), 0x119de1f3) >>> 0
  }
  return (h >>> 1) || 1
}

export const currentMission = (run: RunState): string => run.missions[run.index] ?? run.missions[run.missions.length - 1] ?? ''

/**
 * R-2, R-3, R-4: record a finished mission. A win carries the survivors to the next mission; a loss ends the run; fewer than
 * `rules.run.minSquad` survivors and the squad pulls out; a win on the last mission completes it.
 */
export function afterMission(run: RunState, state: State, kills: number): RunState {
  const result = state.result
  if (!result) return run
  const wardens = state.units.filter((u): u is Extract<typeof u, { kind: 'warden' }> => u.kind === 'warden')
  const alive = wardens.filter((w) => w.alive).map((w) => w.id)
  const lost = wardens.filter((w) => !w.alive).map((w) => w.id)
  const entry: RunResult = { mission: state.mission, won: result.winner === 'warden', reason: result.reason, rounds: state.round, lost, kills }
  const results = [...run.results, entry]
  if (!entry.won) return { ...run, results, roster: alive, status: 'lost' }
  if (run.index + 1 >= run.missions.length) return { ...run, results, roster: alive, status: 'complete' }
  if (alive.length < rules.run.minSquad) return { ...run, results, roster: alive, status: 'pulled-out' }
  return { ...run, results, roster: alive, index: run.index + 1, status: 'open' }
}

export interface RunTally {
  missionsWon: number
  missions: number
  wardensLost: number
  kills: number
  rounds: number
}

export function tally(run: RunState): RunTally {
  return {
    missionsWon: run.results.filter((r) => r.won).length,
    missions: run.missions.length,
    wardensLost: run.results.reduce((n, r) => n + r.lost.length, 0),
    kills: run.results.reduce((n, r) => n + r.kills, 0),
    rounds: run.results.reduce((n, r) => n + r.rounds, 0),
  }
}

const isRun = (v: unknown): v is RunState => {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return Array.isArray(r.missions) && typeof r.index === 'number' && Array.isArray(r.roster) && Array.isArray(r.results) && typeof r.seed === 'number'
}

/** A run parked between missions (the Debrief's "Next" not yet taken), or null. Unknown missions make it null. */
export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY)
    if (!raw) return null
    const v: unknown = JSON.parse(raw)
    if (!isRun(v) || v.status !== 'open') return null
    if (!v.missions.every((m) => getMission(m))) return null
    return v
  } catch {
    return null
  }
}

export function storeRun(run: RunState | null): void {
  try {
    if (run && run.status === 'open') localStorage.setItem(RUN_KEY, JSON.stringify(run))
    else localStorage.removeItem(RUN_KEY)
  } catch {
    /* the mission save carries the run too; the title just will not offer it */
  }
}
