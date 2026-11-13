// Save storage (KB rule 22): one slot under `stellar-derelict-save`; every failure is reported, never silent.
import { getMission } from '../data'
import { SAVE_KEY, readSave, type SaveEnvelope } from '../engine/save'
import type { Settings } from './store'

export const SETTINGS_KEY = 'stellar-derelict-settings'

export type LoadResult = { kind: 'none' } | { kind: 'ok'; save: SaveEnvelope } | { kind: 'bad'; reason: string } | { kind: 'refused'; reason: string }

export function loadSave(): LoadResult {
  let raw: string | null
  try {
    raw = localStorage.getItem(SAVE_KEY)
  } catch {
    return { kind: 'refused', reason: 'This browser will not let the game read its saved mission.' }
  }
  if (raw === null) return { kind: 'none' }
  const r = readSave(raw)
  return r.ok ? { kind: 'ok', save: r.save } : { kind: 'bad', reason: r.reason }
}

/** Returns an error line, or '' when the save was written. */
export function storeSave(json: string): string {
  try {
    localStorage.setItem(SAVE_KEY, json)
    return ''
  } catch {
    return 'This browser refused to store the save: closing the tab will lose this mission.'
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* nothing stored, nothing to clear */
  }
}

export function loadSettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as Partial<Settings>
    const out: Partial<Settings> = {}
    if (o.speed === 'normal' || o.speed === 'fast' || o.speed === 'instant') out.speed = o.speed
    if (o.timer === 'standard' || o.timer === 'relaxed' || o.timer === 'off') out.timer = o.timer
    return out
  } catch {
    return {}
  }
}

export function storeSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* settings are a convenience */
  }
}

export function missionName(id: string): string {
  return getMission(id)?.name ?? id
}
