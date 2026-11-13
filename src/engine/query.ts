import { rules } from '../data'
import {
  ahead,
  enterable,
  FACING_DELTA,
  geoOf,
  isAlive,
  isBurning,
  keyOf,
  LEFT,
  livingWardens,
  makeSight,
  manhattan,
  ORTHO,
  pathDistances,
  posKey,
  RIGHT,
  samePos,
  unitById,
} from './grid'
import { baseCost, hasFlag, isLit, openDuctsOf, payment, targetNumber, validate } from './rules'
import type { Action, Board, Facing, Pos, TerminalOp, WardenUnit } from './types'

export interface Cost {
  /** AP actually spent */
  ap: number
  /** CP actually spent */
  cp: number
  affordable: boolean
}

export interface MeleeOdds {
  attackerWins: number
  tie: number
  defenderWins: number
}

export interface Reach {
  at: Pos
  cost: number
  /** best facing on arrival (Wardens only) */
  facing?: Facing
}

export interface TerminalOption {
  terminal: string
  op: TerminalOp
  door?: Pos
  available: boolean
  why: string | null
  cost: Cost
}

const seenCache = new WeakMap<object, Pos[]>()

function wardenOf(b: Board, id: string): WardenUnit | undefined {
  const u = unitById(b, id)
  return u && u.kind === 'warden' ? u : undefined
}

function cost(b: Board, a: Action): Cost {
  if (a.type === 'endPhase' || a.type === 'arrive' || a.type === 'reveal') return { ap: 0, cp: 0, affordable: true }
  const u = unitById(b, (a as { unit: string }).unit)
  if (!u) return { ap: 0, cp: 0, affordable: false }
  if (u.kind !== 'warden') {
    const n = a.type === 'door' ? rules.stalker.doorCost : a.type === 'tear' ? rules.stalker.tearCost : a.type === 'melee' ? rules.cost.melee : rules.stalker.moveCost
    return { ap: Math.min(n, u.ap), cp: 0, affordable: u.ap >= n }
  }
  const bc = baseCost(u, a)
  if (!bc) return { ap: 0, cp: 0, affordable: false }
  const p = payment(u, b.cp, bc.base, bc.extraCp)
  return p ? { ap: p.ap, cp: p.cp, affordable: true } : { ap: Math.min(u.ap, bc.base), cp: bc.base - Math.min(u.ap, bc.base) + bc.extraCp, affordable: false }
}

function hitChance(b: Board, shooterId: string, targetId: string): number {
  const w = wardenOf(b, shooterId)
  const t = unitById(b, targetId)
  if (!w || !t || t.kind !== 'stalker') return 0
  const g = geoOf(b.mission)
  const need = targetNumber(b, g, w, t)
  const p = Math.max(0, Math.min(6, 7 - need)) / 6
  return 1 - Math.pow(1 - p, rules.repeater.dice)
}

function meleeOdds(b: Board, attackerId: string, defenderId: string): MeleeOdds {
  const a = unitById(b, attackerId)
  const d = unitById(b, defenderId)
  const zero = { attackerWins: 0, tie: 0, defenderWins: 0 }
  if (!a || !d) return zero
  const stalker = a.kind === 'stalker' ? a : d.kind === 'stalker' ? d : null
  const warden = a.kind === 'warden' ? a : d.kind === 'warden' ? d : null
  if (!stalker || !warden) return zero
  const m = rules.melee
  const flank = a.kind === 'stalker' && !samePos(stalker.at, ahead(warden))
  const bonus = hasFlag(warden, 'meleeBonus') ? m.sergeantBonus : 0
  let sW = 0
  let tie = 0
  let wW = 0
  const faces = [1, 2, 3, 4, 5, 6]
  for (const x of faces) {
    for (const y of faces) {
      const sTotal = (m.stalkerDice >= 2 ? Math.max(x, y) : x) + m.stalkerBonus
      for (const wd of faces) {
        const wTotal = wd + bonus - (flank ? m.flankPenalty : 0)
        if (sTotal > wTotal) sW++
        else if (wTotal > sTotal && !flank) wW++
        else tie++
      }
    }
  }
  const n = 36 * 6
  const stalkerIsAttacker = a.kind === 'stalker'
  return {
    attackerWins: (stalkerIsAttacker ? sW : wW) / n,
    tie: tie / n,
    defenderWins: (stalkerIsAttacker ? wW : sW) / n,
  }
}

function seenSquares(b: Board): Pos[] {
  const hit = seenCache.get(b)
  if (hit) return hit
  const g = geoOf(b.mission)
  const sight = makeSight(b, g)
  const out: Pos[] = []
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const t = g.terrain[y]?.[x]
      if (t === 'wall') continue
      if (sight.seen([x, y])) out.push([x, y])
    }
  seenCache.set(b, out)
  return out
}

function sees(b: Board, wardenId: string, sq: Pos): boolean {
  const w = wardenOf(b, wardenId)
  if (!w) return false
  return makeSight(b, geoOf(b.mission)).sees(w, sq)
}

function burst(b: Board, _wardenId: string, sq: Pos): Pos[] {
  const g = geoOf(b.mission)
  const out: Pos[] = [[sq[0], sq[1]]]
  for (const o of ORTHO) if (enterable(b, g, sq[0] + o[0], sq[1] + o[1])) out.push([sq[0] + o[0], sq[1] + o[1]])
  return out
}

function reachable(b: Board, unitId: string): Reach[] {
  const u = unitById(b, unitId)
  if (!u || !isAlive(u)) return []
  const g = geoOf(b.mission)
  const free = (x: number, y: number): boolean => {
    if (!enterable(b, g, x, y) || isBurning(b, x, y)) return false
    for (const o of b.units) if (isAlive(o) && o.at[0] === x && o.at[1] === y && o.id !== u.id) return false
    return true
  }
  if (u.kind === 'warden') {
    const budget = u.ap + b.cp
    const best = new Map<string, { cost: number; facing: Facing }>()
    const dist = new Map<string, number>()
    const start = `${u.at[0]},${u.at[1]},${u.facing}`
    dist.set(start, 0)
    const open: { p: Pos; f: Facing; c: number }[] = [{ p: u.at, f: u.facing, c: 0 }]
    while (open.length) {
      open.sort((a, c) => a.c - c.c)
      const cur = open.shift() as { p: Pos; f: Facing; c: number }
      if (cur.c > (dist.get(`${cur.p[0]},${cur.p[1]},${cur.f}`) ?? 1e9)) continue
      const push = (p: Pos, f: Facing, c: number): void => {
        if (c > budget) return
        const k = `${p[0]},${p[1]},${f}`
        if (c >= (dist.get(k) ?? 1e9)) return
        dist.set(k, c)
        open.push({ p, f, c })
        const pk = posKey(p)
        const prev = best.get(pk)
        if (!prev || c < prev.cost) best.set(pk, { cost: c, facing: f })
      }
      const d = FACING_DELTA[cur.f]
      const fwd: Pos = [cur.p[0] + d[0], cur.p[1] + d[1]]
      const back: Pos = [cur.p[0] - d[0], cur.p[1] - d[1]]
      if (free(fwd[0], fwd[1])) push(fwd, cur.f, cur.c + rules.cost.forward)
      if (free(back[0], back[1])) push(back, cur.f, cur.c + rules.cost.back)
      push(cur.p, LEFT[cur.f], cur.c + rules.cost.turn)
      push(cur.p, RIGHT[cur.f], cur.c + rules.cost.turn)
    }
    const out: Reach[] = []
    for (const [k, v] of best) {
      if (k === posKey(u.at)) continue
      const [x, y] = k.split(',').map(Number) as [number, number]
      out.push({ at: [x, y], cost: v.cost, facing: v.facing })
    }
    return out
  }
  const sight = u.kind === 'ping' ? makeSight(b, g) : null
  const dist = new Map<string, number>([[posKey(u.at), 0]])
  const q: Pos[] = [u.at]
  for (let i = 0; i < q.length; i++) {
    const p = q[i] as Pos
    const c = dist.get(posKey(p)) as number
    if (c + rules.stalker.moveCost > u.ap) continue
    for (const o of ORTHO) {
      const n: Pos = [p[0] + o[0], p[1] + o[1]]
      const k = keyOf(n[0], n[1])
      if (dist.has(k) || !free(n[0], n[1])) continue
      if (sight && sight.seen(n)) continue
      dist.set(k, c + rules.stalker.moveCost)
      q.push(n)
    }
  }
  const out: Reach[] = []
  for (const [k, c] of dist) {
    if (c === 0) continue
    const [x, y] = k.split(',').map(Number) as [number, number]
    out.push({ at: [x, y], cost: c })
  }
  return out
}

function terminalOps(b: Board, wardenId: string): TerminalOption[] {
  const w = wardenOf(b, wardenId)
  if (!w) return []
  const g = geoOf(b.mission)
  const def = g.terminalAt[posKey(ahead(w))]
  if (!def) return []
  const cands: { op: TerminalOp; door?: Pos }[] = []
  if (def.system === 'bulkheads')
    for (const d of def.doors ?? []) {
      cands.push({ op: 'seal', door: d })
      cands.push({ op: 'unseal', door: d })
    }
  else cands.push({ op: def.system === 'lights' ? 'lights' : 'purge' })
  return cands.map((c) => {
    const a: Action = c.door
      ? { type: 'terminal', unit: wardenId, terminal: def.id, op: c.op, door: c.door }
      : { type: 'terminal', unit: wardenId, terminal: def.id, op: c.op }
    const why = validate(b, a)
    const opt: TerminalOption = { terminal: def.id, op: c.op, available: why === null, why, cost: cost(b, a) }
    if (c.door) opt.door = c.door
    return opt
  })
}

export const query = {
  cost,
  canAfford: (b: Board, a: Action): boolean => cost(b, a).affordable,
  /** Why an action is refused, or null when it is legal now. */
  why: (b: Board, a: Action): string | null => validate(b, a),
  hitChance,
  /** The number a die must reach for this shot, lit squares included. */
  targetNumber: (b: Board, shooterId: string, targetId: string): number => {
    const w = wardenOf(b, shooterId)
    const t = unitById(b, targetId)
    return w && t ? targetNumber(b, geoOf(b.mission), w, t) : 0
  },
  meleeOdds,
  seenSquares,
  sees,
  /** Is this square seen by any living Warden. */
  isSeen: (b: Board, sq: Pos): boolean => makeSight(b, geoOf(b.mission)).seen(sq),
  los: (b: Board, a: Pos, c: Pos): boolean => makeSight(b, geoOf(b.mission)).los(a, c),
  burst,
  openDucts: (b: Board): Pos[] => openDuctsOf(b, geoOf(b.mission)),
  reachable,
  timerSeconds: (b: Board): number => rules.timer.base + rules.timer.perWarden * livingWardens(b).length,
  terminalOps,
  isLit: (b: Board, sq: Pos): boolean => isLit(b, geoOf(b.mission), sq),
  distance: (a: Pos, c: Pos): number => manhattan(a, c),
  /** Shortest walk between two squares through enterable terrain (units ignored); null when cut off. */
  pathDistance: (b: Board, a: Pos, c: Pos): number | null => pathDistances(b, geoOf(b.mission), a).get(posKey(c)) ?? null,
  enterable: (b: Board, sq: Pos): boolean => enterable(b, geoOf(b.mission), sq[0], sq[1]),
  terrain: (b: Board, sq: Pos) => geoOf(b.mission).terrain[sq[1]]?.[sq[0]] ?? 'wall',
  carrier: (b: Board): WardenUnit | undefined => (b.core.carrier ? wardenOf(b, b.core.carrier) : undefined),
  livingWardens: (b: Board): WardenUnit[] => livingWardens(b),
  isLocked: (b: Board, wardenId: string): boolean => (wardenOf(b, wardenId)?.heat ?? 0) >= rules.repeater.heatLock,
  /** Arrivals the next Molt phase will bring (before pings held over are added). */
  arrivalsNext: (b: Board): number => {
    const m = geoOf(b.mission).mission
    const alarm = b.coreRound !== null && b.round + (b.phase === 'molt' ? 1 : 0) > b.coreRound
    return (alarm ? m.arrivals.alarm : m.arrivals.normal) + b.heldOver
  },
}

export type Query = typeof query
