import { roles, rules } from '../data'
import { ahead, behind, geoOf, LEFT, manhattan, ORTHO, posKey, RIGHT, terrainAt, isDoorSquare } from './grid'
import { openDuctsOf, validate } from './rules'
import type { Action, Board, Pos, WardenUnit } from './types'

export function legalActions(b: Board): Action[] {
  if (b.result || !b.toAct) return []
  const g = geoOf(b.mission)
  const out: Action[] = []
  const add = (a: Action): void => {
    if (validate(b, a) === null) out.push(a)
  }
  if (b.pending) {
    for (const d of openDuctsOf(b, g)) add({ type: 'arrive', duct: d })
    return out
  }
  if (b.toAct === 'warden') {
    for (const u of b.units) {
      if (u.kind !== 'warden' || !u.alive) continue
      wardenCandidates(b, g, u, add)
    }
  } else {
    for (const u of b.units) {
      if (u.kind === 'warden') continue
      for (const o of ORTHO) {
        const p: Pos = [u.at[0] + o[0], u.at[1] + o[1]]
        add({ type: 'move', unit: u.id, to: p })
        if (isDoorSquare(g, p)) {
          add({ type: 'door', unit: u.id, door: p })
          if (u.kind === 'stalker') add({ type: 'tear', unit: u.id, door: p })
        }
      }
      if (u.kind === 'stalker') {
        for (const w of b.units) if (w.kind === 'warden' && w.alive && manhattan(w.at, u.at) === 1) add({ type: 'melee', unit: u.id, target: w.id })
      } else add({ type: 'reveal', unit: u.id })
    }
  }
  out.push({ type: 'endPhase' })
  return out
}

function wardenCandidates(b: Board, g: ReturnType<typeof geoOf>, w: WardenUnit, add: (a: Action) => void): void {
  const f = ahead(w)
  add({ type: 'move', unit: w.id, to: f })
  add({ type: 'move', unit: w.id, to: behind(w) })
  add({ type: 'turn', unit: w.id, facing: LEFT[w.facing] })
  add({ type: 'turn', unit: w.id, facing: RIGHT[w.facing] })
  if (isDoorSquare(g, f)) add({ type: 'door', unit: w.id, door: f })
  const isScorcher = roles[w.role].weapon === 'scorcher'
  if (!isScorcher) {
    for (const t of b.units) {
      if (t.kind !== 'stalker') continue
      add({ type: 'fire', unit: w.id, target: t.id })
      if (t.at[0] === f[0] && t.at[1] === f[1]) add({ type: 'melee', unit: w.id, target: t.id })
    }
    add({ type: 'vent', unit: w.id })
    add({ type: 'watch', unit: w.id })
  } else {
    const r = rules.scorcher.range
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r || (dx === 0 && dy === 0)) continue
        const t = terrainAt(g, w.at[0] + dx, w.at[1] + dy)
        if (t === 'wall' || t === 'terminal' || t === 'console') continue
        add({ type: 'scorch', unit: w.id, at: [w.at[0] + dx, w.at[1] + dy] })
      }
    for (const t of b.units) if (t.kind === 'stalker' && t.at[0] === f[0] && t.at[1] === f[1]) add({ type: 'melee', unit: w.id, target: t.id })
  }
  const def = g.terminalAt[posKey(f)]
  if (def) {
    if (def.system === 'bulkheads')
      for (const d of def.doors ?? []) {
        add({ type: 'terminal', unit: w.id, terminal: def.id, op: 'seal', door: d })
        add({ type: 'terminal', unit: w.id, terminal: def.id, op: 'unseal', door: d })
      }
    else add({ type: 'terminal', unit: w.id, terminal: def.id, op: def.system === 'lights' ? 'lights' : 'purge' })
  }
  if (g.consolePos && g.consolePos[0] === f[0] && g.consolePos[1] === f[1]) add({ type: 'takeCore', unit: w.id })
}
