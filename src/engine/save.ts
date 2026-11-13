import { getMission } from '../data'
import type { Action, Setup, State } from './types'

export const SAVE_GAME_ID = 'stellar-derelict'
export const SAVE_VERSION = 1
export const SAVE_KEY = 'stellar-derelict-save'

export interface SaveEnvelope {
  game: 'stellar-derelict'
  version: 1
  savedAt: string
  setup: Setup
  actions: Action[]
  snapshot: State
  ui: Record<string, unknown>
}

export type ReadSave = { ok: true; save: SaveEnvelope } | { ok: false; reason: string }

export function makeSave(
  setup: Setup,
  actions: Action[],
  snapshot: State,
  ui: Record<string, unknown> = {},
  savedAt = '',
): SaveEnvelope {
  return { game: SAVE_GAME_ID, version: SAVE_VERSION, savedAt, setup, actions, snapshot, ui }
}

export function writeSave(save: SaveEnvelope): string {
  return JSON.stringify(save)
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function readSave(json: string): ReadSave {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'The saved game is not valid JSON.' }
  }
  if (!isObj(raw)) return { ok: false, reason: 'The saved game is not a save file.' }
  if (raw.game !== SAVE_GAME_ID) return { ok: false, reason: 'This save belongs to a different game.' }
  if (raw.version !== SAVE_VERSION) return { ok: false, reason: 'This save is from a version this build cannot read.' }
  const setup = raw.setup
  if (!isObj(setup) || typeof setup.mission !== 'string' || typeof setup.seed !== 'number')
    return { ok: false, reason: 'The saved setup is damaged.' }
  const snap = raw.snapshot
  if (!isObj(snap) || !Array.isArray(snap.units) || typeof snap.mission !== 'string')
    return { ok: false, reason: 'The saved position is damaged.' }
  if (!Array.isArray(raw.actions)) return { ok: false, reason: 'The saved action list is damaged.' }
  if (!getMission(setup.mission) || !getMission(snap.mission)) return { ok: false, reason: 'That mission is no longer in the game.' }
  if (snap.result !== null) return { ok: false, reason: 'That mission was already finished.' }
  return { ok: true, save: raw as unknown as SaveEnvelope }
}
