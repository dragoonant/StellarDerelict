import rulesJson from './rules.json'
import unitsJson from './units.json'
import deadReckoning from './missions/dead-reckoning.json'
import type { Mission, Role, RoleDef, Rules } from './types'

export * from './types'

export const rules = rulesJson as unknown as Rules
export const roles = unitsJson as unknown as Record<Role, RoleDef>

const registry = new Map<string, Mission>()

/** Add (or replace) a mission. Tests use this to register tiny ad-hoc maps. */
export function registerMission(m: Mission): void {
  registry.set(m.id, m)
}
export function unregisterMission(id: string): void {
  registry.delete(id)
}
export function getMission(id: string): Mission | undefined {
  return registry.get(id)
}
export function listMissions(): Mission[] {
  return [...registry.values()]
}

registerMission(deadReckoning as unknown as Mission)
