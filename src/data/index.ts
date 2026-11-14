import rulesJson from './rules.json'
import unitsJson from './units.json'
import deadReckoning from './missions/dead-reckoning.json'
import coldBerth from './missions/cold-berth.json'
import lastLight from './missions/last-light.json'
import runJson from './run.json'
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
registerMission(coldBerth as unknown as Mission)
registerMission(lastLight as unknown as Mission)

/** The boarding run (spec 10 section 15): the missions in order, played by one squad. */
export interface RunDef {
  id: string
  name: string
  missions: string[]
}
export const runDef = runJson as RunDef

export * from './assets'
