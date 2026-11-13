import { deepStrictEqual } from 'node:assert'
import { rules, getMission } from '../src/data'
import { query } from '../src/engine'
import type { State } from '../src/engine'

/** Checks run after every sim action. Returns a list of violations (empty when clean). */
export function checkInvariants(s: State): string[] {
  const bad: string[] = []
  const m = getMission(s.mission)
  if (!m) return ['unknown mission']
  const seen = new Set<string>()
  for (const u of s.units) {
    if (u.kind === 'warden' && !u.alive) continue
    const k = `${u.at[0]},${u.at[1]}`
    if (seen.has(k)) bad.push(`two units on ${k}`)
    seen.add(k)
    const t = query.terrain(s, u.at)
    if (t === 'wall' || t === 'terminal' || t === 'console') bad.push(`${u.id} inside ${t} at ${k}`)
    if ((t === 'door' || t === 'bulkhead') && !s.doors[k]?.open) bad.push(`${u.id} inside closed door at ${k}`)
    if (u.ap < 0) bad.push(`${u.id} has negative AP`)
    if (u.kind === 'warden') {
      if (u.heat < 0 || u.heat > rules.repeater.heatLock) bad.push(`${u.id} heat ${u.heat} out of range`)
      if (u.charges < 0) bad.push(`${u.id} charges negative`)
      if (u.watch && u.heat >= rules.repeater.heatLock) bad.push(`${u.id} watching with a locked repeater`)
    }
  }
  if (s.cp < 0 || s.heldCp < 0) bad.push('negative command points')
  if (s.heldCp > rules.heldCpMax) bad.push('too many held command points')
  for (const u of s.units) if (u.kind === 'ping' && query.isSeen(s, u.at)) bad.push(`ping ${u.id} on a seen square`)
  if (s.result && s.toAct !== null) bad.push('finished game still has someone to act')
  if (!s.result && s.toAct === null) bad.push('running game has nobody to act')
  if (s.core.where === 'carried') {
    const c = s.units.find((u) => u.id === s.core.carrier)
    if (!c || c.kind !== 'warden' || !c.alive) bad.push('core carried by a missing Warden')
  }
  if (s.round < 1 || s.round > m.roundLimit) bad.push('round out of range')
  try {
    deepStrictEqual(JSON.parse(JSON.stringify(s)), s)
  } catch {
    bad.push('state does not survive a JSON round trip')
  }
  return bad
}
