import { roles, rules } from '../data'
import type { RoleFlag } from '../data/types'
import {
  ahead,
  behind,
  doorAt,
  enterable,
  FACING_DELTA,
  geoOf,
  isAlive,
  isBurning,
  isDoorSquare,
  keyOf,
  LEFT,
  makeSight,
  manhattan,
  ORTHO,
  pathDistances,
  posKey,
  RIGHT,
  samePos,
  sectionOf,
  terrainAt,
  unitAt,
  unitById,
  type Geo,
} from './grid'
import { randInt, seedRng, shuffle } from './rng'
import type {
  Action,
  Board,
  Event,
  Facing,
  Pos,
  State,
  StalkerUnit,
  Unit,
  ViewUnit,
  WardenUnit,
  PingUnit,
} from './types'

export const hasFlag = (w: { role: WardenUnit['role'] }, f: RoleFlag): boolean => roles[w.role].flags.includes(f)
export const hasRepeater = (w: { role: WardenUnit['role'] }): boolean => roles[w.role].weapon === 'repeater'

const isPos = (p: unknown): p is Pos =>
  Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isInteger(p[1])

export interface Pay {
  ap: number
  cp: number
}

/** C-2: AP first, shortfall from CP, plus any flat CP (terminals). Null when it cannot be paid. */
export function payment(w: { ap: number }, cp: number, base: number, extraCp = 0): Pay | null {
  const ap = Math.min(w.ap, base)
  const cpUse = base - ap + extraCp
  return cpUse <= cp ? { ap, cp: cpUse } : null
}

export interface BaseCost {
  base: number
  extraCp: number
}

/** The listed cost of a Warden action, before paying it. */
export function baseCost(w: WardenUnit, a: Action): BaseCost | null {
  const c = rules.cost
  switch (a.type) {
    case 'move': {
      const f = ahead(w)
      return { base: isPos(a.to) && samePos(a.to, f) ? c.forward : c.back, extraCp: 0 }
    }
    case 'turn':
      return { base: c.turn, extraCp: 0 }
    case 'door':
      return { base: c.door, extraCp: 0 }
    case 'fire':
      return { base: c.fire, extraCp: 0 }
    case 'vent':
      return { base: c.vent, extraCp: 0 }
    case 'watch':
      return { base: c.watch, extraCp: 0 }
    case 'scorch':
      return { base: c.scorch, extraCp: 0 }
    case 'melee':
      return { base: c.melee, extraCp: 0 }
    case 'terminal':
      return { base: c.terminal, extraCp: hasFlag(w, 'freeTerminal') ? 0 : rules.terminalCp }
    case 'takeCore':
      return { base: c.takeCore, extraCp: 0 }
    default:
      return null
  }
}

export function isLit(b: Board, g: Geo, p: Pos): boolean {
  for (const s of b.lit) if (sectionOf(g, s, p)) return true
  return false
}

/** Number a die must reach for this shot (F-2, SYS-4). */
export function targetNumber(b: Board, g: Geo, shooter: WardenUnit, target: { at: Pos }): number {
  const r = rules.repeater
  const base = manhattan(shooter.at, target.at) <= r.closeRange ? r.closeTarget : r.farTarget
  return base - (isLit(b, g, target.at) ? rules.litBonus : 0)
}

/** P-2: ducts a ping may arrive on. */
export function openDuctsOf(b: Board, g: Geo): Pos[] {
  const sight = makeSight(b, g)
  const living = b.units.filter((u): u is WardenUnit => u.kind === 'warden' && u.alive)
  const out: Pos[] = []
  for (const d of g.ducts) {
    if (b.purgedDucts.some((p) => samePos(p, d))) continue
    if (unitAt(b, d[0], d[1])) continue
    if (sight.seen(d)) continue
    const dist = pathDistances(b, g, d, rules.ductWatchRadius)
    if (living.some((w) => dist.has(posKey(w.at)))) continue
    out.push(d)
  }
  return out
}

const NOT_YOUR_TURN = 'It is not that side’s turn.'

export function validate(b: Board, a: Action): string | null {
  if (b.result) return 'The mission is already over.'
  if (!a || typeof a !== 'object' || typeof (a as { type?: unknown }).type !== 'string') return 'That is not an action.'
  const g = geoOf(b.mission)
  if (a.type === 'endPhase') return b.pending ? 'Arrivals must be placed first.' : null
  if (a.type === 'arrive') {
    if (!b.pending) return 'No ping is waiting to arrive.'
    if (!isPos(a.duct)) return 'That is not a duct square.'
    return openDuctsOf(b, g).some((d) => samePos(d, a.duct)) ? null : 'That duct is not open.'
  }
  if (b.pending) return 'Arrivals must be placed first.'
  const u = typeof a.unit === 'string' ? unitById(b, a.unit) : undefined
  if (!u) return 'No such unit.'
  if (u.kind === 'warden') return validateWarden(b, g, u, a)
  if (b.toAct !== 'molt') return NOT_YOUR_TURN
  return validateMolt(b, g, u, a)
}

function validateWarden(b: Board, g: Geo, w: WardenUnit, a: Action): string | null {
  if (b.toAct !== 'warden') return NOT_YOUR_TURN
  if (!w.alive) return 'That Warden is down.'
  const bc = baseCost(w, a)
  if (!bc) return 'A Warden cannot do that.'
  const pay = payment(w, b.cp, bc.base, bc.extraCp)
  const broke = 'Not enough action or command points.'
  const sight = () => makeSight(b, g)
  switch (a.type) {
    case 'move': {
      if (!isPos(a.to)) return 'That is not a square.'
      if (!samePos(a.to, ahead(w)) && !samePos(a.to, behind(w))) return 'A Warden moves one square ahead or behind.'
      if (!pay) return broke
      if (!enterable(b, g, a.to[0], a.to[1])) return 'That square cannot be entered.'
      if (unitAt(b, a.to[0], a.to[1])) return 'That square is occupied.'
      if (isBurning(b, a.to[0], a.to[1])) return 'That square is burning.'
      return null
    }
    case 'turn':
      if (a.facing !== LEFT[w.facing] && a.facing !== RIGHT[w.facing]) return 'A turn is a quarter turn.'
      return pay ? null : broke
    case 'door': {
      if (!isPos(a.door) || !samePos(a.door, ahead(w))) return 'A Warden works the door directly ahead.'
      return doorWorkError(b, g, a.door, true) ?? (pay ? null : broke)
    }
    case 'fire': {
      if (!hasRepeater(w)) return 'This Warden carries no repeater.'
      if (w.heat >= rules.repeater.heatLock) return 'The repeater is locked; vent it.'
      const t = typeof a.target === 'string' ? unitById(b, a.target) : undefined
      if (!t || t.kind !== 'stalker') return 'The target must be a stalker.'
      if (manhattan(w.at, t.at) > rules.repeater.maxRange) return 'The target is out of range.'
      if (!sight().sees(w, t.at)) return 'The target is not in sight.'
      return pay ? null : broke
    }
    case 'vent':
      if (!hasRepeater(w)) return 'This Warden carries no repeater.'
      if (w.heat <= 0) return 'The repeater is already cool.'
      return pay ? null : broke
    case 'watch':
      if (hasFlag(w, 'noWatch')) return 'This Warden cannot hold watch.'
      if (!hasRepeater(w)) return 'This Warden carries no repeater.'
      if (w.heat >= rules.repeater.heatLock) return 'A locked repeater cannot hold watch.'
      if (w.watch) return 'Already on watch.'
      return pay ? null : broke
    case 'scorch': {
      if (roles[w.role].weapon !== 'scorcher') return 'This Warden carries no scorcher.'
      if (w.charges <= 0) return 'The scorcher is empty.'
      if (!isPos(a.at)) return 'That is not a square.'
      const t = terrainAt(g, a.at[0], a.at[1])
      if (t === 'wall' || t === 'terminal' || t === 'console') return 'That square cannot be scorched.'
      if (manhattan(w.at, a.at) > rules.scorcher.range) return 'That square is out of range.'
      if (!sight().sees(w, a.at)) return 'That square is not in sight.'
      return pay ? null : broke
    }
    case 'melee': {
      const t = typeof a.target === 'string' ? unitById(b, a.target) : undefined
      if (!t || t.kind !== 'stalker') return 'The target must be a stalker.'
      if (!samePos(t.at, ahead(w))) return 'The stalker must be directly ahead.'
      return pay ? null : broke
    }
    case 'terminal': {
      const f = ahead(w)
      const def = g.terminalAt[posKey(f)]
      if (!def) return 'There is no terminal directly ahead.'
      if (a.terminal !== def.id) return 'That is not the terminal ahead.'
      const err = terminalOpError(b, g, a.terminal, a.op, a.door)
      if (err) return err
      return pay ? null : broke
    }
    case 'takeCore': {
      if (!g.consolePos || !samePos(ahead(w), g.consolePos)) return 'The console must be directly ahead.'
      if (b.core.where !== 'console') return 'The core is no longer in the console.'
      return pay ? null : broke
    }
    default:
      return 'A Warden cannot do that.'
  }
}

function terminalOpError(b: Board, g: Geo, id: string, op: string, door: Pos | undefined): string | null {
  const def = g.terminalById[id]
  if (!def) return 'No such terminal.'
  if (def.system === 'bulkheads') {
    if (op !== 'seal' && op !== 'unseal') return 'That terminal runs bulkheads only.'
    if (!door || !isPos(door) || !(def.doors ?? []).some((d) => samePos(d, door))) return 'That door is not on this terminal.'
    const ds = doorAt(b, door)
    if (!ds) return 'That door is not on this terminal.'
    if (op === 'seal') {
      if (ds.torn) return 'A torn door cannot be sealed.'
      if (ds.open) return 'Close the door before sealing it.'
      if (ds.sealed) return 'That door is already sealed.'
      return null
    }
    return ds.sealed ? null : 'That door is not sealed.'
  }
  if (def.system === 'lights') {
    if (op !== 'lights') return 'That terminal runs the lights only.'
    return b.usedTerminals.includes(id) ? 'The lights have already been used.' : null
  }
  if (op !== 'purge') return 'That terminal runs the purge only.'
  return b.usedTerminals.includes(id) ? 'The purge has already been used.' : null
}

/** Open/close a door square. `warden` also forbids touching sealed doors when opening, same as stalkers (D-2, D-3). */
function doorWorkError(b: Board, g: Geo, p: Pos, _warden: boolean): string | null {
  if (!isDoorSquare(g, p)) return 'There is no door there.'
  const ds = doorAt(b, p)
  if (!ds) return 'There is no door there.'
  if (ds.open) {
    if (ds.torn) return 'A torn door cannot close.'
    if (unitAt(b, p[0], p[1])) return 'Something is standing in the doorway.'
    return null
  }
  return ds.sealed ? 'A sealed door cannot be opened.' : null
}

function validateMolt(b: Board, g: Geo, u: ViewUnit, a: Action): string | null {
  if (u.kind === 'warden') return 'Not a Molt unit.'
  const st = rules.stalker
  switch (a.type) {
    case 'move': {
      if (!isPos(a.to) || manhattan(u.at, a.to) !== 1) return 'Move one square, orthogonally.'
      if (u.ap < st.moveCost) return 'Out of action points.'
      if (!enterable(b, g, a.to[0], a.to[1])) return 'That square cannot be entered.'
      if (unitAt(b, a.to[0], a.to[1])) return 'That square is occupied.'
      if (isBurning(b, a.to[0], a.to[1])) return 'That square is burning.'
      if (u.kind === 'ping') {
        const moved = b.units.map((x) => (x.id === u.id ? ({ ...x, at: a.to } as ViewUnit) : x))
        if (makeSight({ ...b, units: moved }, g).seen(a.to)) return 'A ping cannot step into sight.'
      }
      return null
    }
    case 'door': {
      if (!isPos(a.door) || manhattan(u.at, a.door) !== 1) return 'The door must be adjacent.'
      if (u.ap < st.doorCost) return 'Out of action points.'
      return doorWorkError(b, g, a.door, false)
    }
    case 'tear': {
      if (u.kind !== 'stalker') return 'Only stalkers tear doors.'
      if (!isPos(a.door) || manhattan(u.at, a.door) !== 1) return 'The door must be adjacent.'
      if (u.ap < st.tearCost) return 'Out of action points.'
      if (!isDoorSquare(g, a.door)) return 'There is no door there.'
      return doorAt(b, a.door)?.open ? 'That door is already open.' : null
    }
    case 'melee': {
      if (u.kind !== 'stalker') return 'Only stalkers attack.'
      const t = typeof a.target === 'string' ? unitById(b, a.target) : undefined
      if (!t || t.kind !== 'warden' || !t.alive) return 'The target must be a Warden.'
      if (manhattan(u.at, t.at) !== 1) return 'The Warden must be adjacent.'
      return u.ap >= rules.cost.melee ? null : 'Out of action points.'
    }
    case 'reveal':
      if (u.kind !== 'ping') return 'Only pings reveal.'
      return u.ap >= rules.pingAp ? null : 'A ping that has spent action points cannot reveal by choice.'
    default:
      return 'A Molt unit cannot do that.'
  }
}

// ---------------------------------------------------------------------------------------------
// Applying actions (mutating a private clone)
// ---------------------------------------------------------------------------------------------

export interface Ctx {
  s: State
  ev: Event[]
  g: Geo
}

const emit = (c: Ctx, e: Event): void => {
  c.ev.push(e)
}

function rollDie(c: Ctx, n: number): number {
  const q = c.s.rng.queue.shift()
  if (q !== undefined) return q
  return randInt(c.s.rng, n) + 1
}

function wardenOf(c: Ctx, id: string): WardenUnit {
  return c.s.units.find((u) => u.id === id) as WardenUnit
}

function removeUnit(c: Ctx, u: Unit): void {
  c.s.units = c.s.units.filter((x) => x !== u)
}

function endWatch(c: Ctx, w: WardenUnit, why: 'phase' | 'acted' | 'attacked' | 'locked' | 'destroyed'): void {
  if (!w.watch) return
  w.watch = false
  emit(c, { type: 'watchEnded', unit: w.id, why })
}

/** A lethal hit (A-1 for Wardens). */
function lethal(c: Ctx, u: Unit, by: string): void {
  if (u.kind === 'warden') {
    if (!u.alive) return
    if (!u.breached) {
      u.breached = true
      emit(c, { type: 'breached', unit: u.id })
      return
    }
    u.alive = false
    u.watch = false
    emit(c, { type: 'destroyed', unit: u.id, kind: 'warden', at: u.at, by })
    if (c.s.core.carrier === u.id) {
      c.s.core = { where: 'loose', at: [u.at[0], u.at[1]], carrier: null }
      emit(c, { type: 'coreDropped', at: [u.at[0], u.at[1]] })
    }
    return
  }
  removeUnit(c, u)
  emit(c, { type: 'destroyed', unit: u.id, kind: u.kind, at: u.at, by })
}

function shoot(c: Ctx, w: WardenUnit, t: StalkerUnit, watchShot: boolean): void {
  const need = targetNumber(c.s, c.g, w, t)
  const dice: number[] = []
  for (let i = 0; i < rules.repeater.dice; i++) dice.push(rollDie(c, 6))
  const hit = dice.some((d) => d >= need)
  w.heat += 1
  emit(c, { type: 'fired', unit: w.id, target: t.id, dice, need, hit, heat: w.heat, watch: watchShot })
  if (w.heat >= rules.repeater.heatLock) emit(c, { type: 'locked', unit: w.id })
  if (hit) lethal(c, t, w.id)
}

/** O-3 and O-4 */
function overwatch(c: Ctx, stalkerId: string): void {
  for (const w of c.s.units.filter((u): u is WardenUnit => u.kind === 'warden')) {
    const t = c.s.units.find((u) => u.id === stalkerId)
    if (!t || t.kind !== 'stalker') return
    if (!w.alive || !w.watch || w.heat >= rules.repeater.heatLock) continue
    if (manhattan(w.at, t.at) > rules.repeater.maxRange) continue
    if (!makeSight(c.s, c.g).sees(w, t.at)) continue
    shoot(c, w, t, true)
    if (w.heat >= rules.repeater.heatLock) {
      if (c.s.heldCp > 0) {
        c.s.heldCp -= 1
        w.heat = rules.repeater.heldCpHeat
        emit(c, { type: 'vented', unit: w.id, heldCp: true })
      } else endWatch(c, w, 'locked')
    }
  }
}

function facingToward(from: Pos, to: Pos): Facing {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'E' : 'W'
  return dy > 0 ? 'S' : 'N'
}

/** M-1..M-5. The stalker's dice are always rolled before the Warden's. */
function fight(c: Ctx, attacker: WardenUnit | StalkerUnit, defender: WardenUnit | StalkerUnit): void {
  const stalker = (attacker.kind === 'stalker' ? attacker : defender) as StalkerUnit
  const warden = (attacker.kind === 'warden' ? attacker : defender) as WardenUnit
  const m = rules.melee
  const sd: number[] = []
  for (let i = 0; i < m.stalkerDice; i++) sd.push(rollDie(c, 6))
  const wd = rollDie(c, 6)
  const flank = attacker.kind === 'stalker' && !samePos(stalker.at, ahead(warden))
  const sTotal = Math.max(...sd) + m.stalkerBonus
  const wTotal = wd + (hasFlag(warden, 'meleeBonus') ? m.sergeantBonus : 0) - (flank ? m.flankPenalty : 0)
  let who: 'stalker' | 'warden' | 'tie'
  if (sTotal > wTotal) who = 'stalker'
  else if (wTotal > sTotal && !flank) who = 'warden'
  else who = 'tie'
  const attackerIsStalker = attacker.kind === 'stalker'
  const outcome: 'attacker' | 'defender' | 'tie' =
    who === 'tie' ? 'tie' : (who === 'stalker') === attackerIsStalker ? 'attacker' : 'defender'
  emit(c, {
    type: 'meleeFought',
    attacker: attacker.id,
    defender: defender.id,
    attackerRoll: attackerIsStalker ? sTotal : wTotal,
    defenderRoll: attackerIsStalker ? wTotal : sTotal,
    attackerDice: attackerIsStalker ? sd : [wd],
    defenderDice: attackerIsStalker ? [wd] : sd,
    flank,
    outcome,
  })
  if (who === 'stalker') lethal(c, warden, stalker.id)
  else if (who === 'warden') lethal(c, stalker, warden.id)
  if (attackerIsStalker && warden.alive) {
    if (flank) {
      const f = facingToward(warden.at, stalker.at)
      if (f !== warden.facing) {
        warden.facing = f
        emit(c, { type: 'turned', unit: warden.id, facing: f })
      }
    }
    endWatch(c, warden, 'attacked')
  }
}

/** P-6 placement of the second and later stalkers. */
function placeExtra(c: Ctx, from: Pos): Pos | null {
  const dist = pathDistances(c.s, c.g, from, rules.revealRadius)
  const sight = makeSight(c.s, c.g)
  const cands: { p: Pos; seen: number; d: number }[] = []
  for (const [k, d] of dist) {
    if (d === 0) continue
    const [xs, ys] = k.split(',')
    const p: Pos = [Number(xs), Number(ys)]
    if (unitAt(c.s, p[0], p[1]) || isBurning(c.s, p[0], p[1])) continue
    cands.push({ p, seen: sight.seen(p) ? 1 : 0, d })
  }
  cands.sort((a, b) => a.seen - b.seen || a.d - b.d || a.p[1] - b.p[1] || a.p[0] - b.p[0])
  return cands[0]?.p ?? null
}

function reveal(c: Ctx, ping: PingUnit, forced: boolean): void {
  const n = ping.stalkers
  const ap = forced ? ping.ap : rules.stalkerAp
  removeUnit(c, ping)
  const placed: { id: string; at: Pos }[] = []
  let lost = 0
  for (let i = 0; i < n; i++) {
    const at = i === 0 ? ping.at : placeExtra(c, ping.at)
    if (!at) {
      lost += 1
      continue
    }
    const st: StalkerUnit = { id: `s${c.s.nextId++}`, kind: 'stalker', at: [at[0], at[1]], ap }
    c.s.units.push(st)
    placed.push({ id: st.id, at: [at[0], at[1]] })
  }
  emit(c, { type: 'revealed', ping: ping.id, at: ping.at, stalkers: n, lost, forced, units: placed })
}

function drawBag(c: Ctx): number {
  if (c.s.bag.length === 0) c.s.bag = shuffle(c.s.rng, c.g.mission.pingBag)
  return c.s.bag.shift() as number
}

function resolveArrivals(c: Ctx): void {
  const p = c.s.pending
  if (!p) return
  if (p.remaining <= 0) {
    c.s.pending = null
    return
  }
  if (openDuctsOf(c.s, c.g).length === 0) {
    for (let i = 0; i < p.remaining; i++) emit(c, { type: 'pingHeld' })
    c.s.heldOver += p.remaining
    c.s.pending = null
  }
}

export function startWardenPhase(c: Ctx): void {
  const s = c.s
  if (s.burn.length) {
    s.burn = []
    emit(c, { type: 'burnCleared' })
  }
  for (const w of s.units) {
    if (w.kind !== 'warden' || !w.alive) continue
    endWatch(c, w, 'phase')
    w.heat = Math.max(0, w.heat - rules.repeater.coolPerRound)
    w.ap = rules.wardenAp
  }
  let cp = rules.cpBase + rollDie(c, rules.cpDie)
  if (s.units.some((u) => u.kind === 'warden' && u.alive && hasFlag(u, 'cpBonus'))) cp += rules.cpSergeant
  s.cp = cp
  s.heldCp = 0
  s.phase = 'warden'
  s.toAct = 'warden'
  emit(c, { type: 'phaseStarted', seat: 'warden', round: s.round, cp })
}

function startMoltPhase(c: Ctx): void {
  const s = c.s
  s.heldCp = Math.min(s.cp, rules.heldCpMax)
  s.cp = 0
  s.phase = 'molt'
  s.toAct = 'molt'
  for (const u of s.units) {
    if (u.kind === 'stalker') u.ap = rules.stalkerAp
    else if (u.kind === 'ping') u.ap = rules.pingAp
  }
  emit(c, { type: 'phaseStarted', seat: 'molt', round: s.round })
  const alarm = s.coreRound !== null && s.round > s.coreRound
  const n = (alarm ? c.g.mission.arrivals.alarm : c.g.mission.arrivals.normal) + s.heldOver
  s.heldOver = 0
  s.pending = n > 0 ? { kind: 'arrive', remaining: n } : null
  resolveArrivals(c)
}

function gameOver(c: Ctx, winner: 'warden' | 'molt', reason: 'core-out' | 'squad-lost' | 'time'): void {
  c.s.result = { winner, reason }
  c.s.toAct = null
  c.s.pending = null
  emit(c, { type: 'gameOver', winner, reason })
}

/** P-7 forced reveals, then V-4 / V-5. Runs after every change. */
export function settle(c: Ctx): void {
  if (c.s.result) return
  for (let guard = 0; guard < 64; guard++) {
    const sight = makeSight(c.s, c.g)
    const p = c.s.units.find((u): u is PingUnit => u.kind === 'ping' && sight.seen(u.at))
    if (!p) break
    reveal(c, p, true)
  }
  const carrier = c.s.core.carrier ? wardenOf(c, c.s.core.carrier) : undefined
  if (carrier && carrier.alive && c.g.airlocks.has(posKey(carrier.at))) return gameOver(c, 'warden', 'core-out')
  if (!c.s.units.some((u) => u.kind === 'warden' && u.alive)) return gameOver(c, 'molt', 'squad-lost')
}

function pay(c: Ctx, w: WardenUnit, a: Action): void {
  const bc = baseCost(w, a) as BaseCost
  const p = payment(w, c.s.cp, bc.base, bc.extraCp) as Pay
  w.ap -= p.ap
  c.s.cp -= p.cp
  if (p.cp > 0) emit(c, { type: 'cpSpent', unit: w.id, cp: p.cp, left: c.s.cp })
}

function toggleDoor(c: Ctx, p: Pos): void {
  const ds = c.s.doors[posKey(p)] as { open: boolean; sealed: boolean; torn: boolean }
  ds.open = !ds.open
  emit(c, { type: 'doorChanged', door: [p[0], p[1]], state: ds.open ? 'open' : 'closed' })
}

export function apply(c: Ctx, a: Action): void {
  const s = c.s
  switch (a.type) {
    case 'endPhase': {
      if (s.phase === 'warden') startMoltPhase(c)
      else {
        emit(c, { type: 'roundEnded', round: s.round })
        if (s.round >= c.g.mission.roundLimit) return gameOver(c, 'molt', 'time')
        s.round += 1
        startWardenPhase(c)
      }
      return
    }
    case 'arrive': {
      const ping: PingUnit = {
        id: `p${s.nextId++}`,
        kind: 'ping',
        at: [a.duct[0], a.duct[1]],
        ap: rules.pingAp,
        stalkers: drawBag(c),
      }
      s.units.push(ping)
      emit(c, { type: 'pingArrived', unit: ping.id, duct: [a.duct[0], a.duct[1]] })
      ;(s.pending as { remaining: number }).remaining -= 1
      resolveArrivals(c)
      return
    }
  }
  const u = s.units.find((x) => x.id === (a as { unit: string }).unit) as Unit
  if (u.kind === 'warden') return applyWarden(c, u, a)
  applyMolt(c, u, a)
}

function applyWarden(c: Ctx, w: WardenUnit, a: Action): void {
  const s = c.s
  if (a.type !== 'watch') endWatch(c, w, 'acted')
  pay(c, w, a)
  switch (a.type) {
    case 'move': {
      const from: Pos = [w.at[0], w.at[1]]
      w.at = [a.to[0], a.to[1]]
      emit(c, { type: 'moved', unit: w.id, from, to: [a.to[0], a.to[1]] })
      if (s.core.where === 'loose' && s.core.at && samePos(s.core.at, w.at)) {
        s.core = { where: 'carried', at: null, carrier: w.id }
        emit(c, { type: 'corePicked', unit: w.id })
      }
      break
    }
    case 'turn':
      w.facing = a.facing
      emit(c, { type: 'turned', unit: w.id, facing: a.facing })
      break
    case 'door':
      toggleDoor(c, a.door)
      break
    case 'fire':
      shoot(c, w, s.units.find((x) => x.id === a.target) as StalkerUnit, false)
      break
    case 'vent':
      w.heat = 0
      emit(c, { type: 'vented', unit: w.id, heldCp: false })
      break
    case 'watch':
      w.watch = true
      emit(c, { type: 'watchSet', unit: w.id })
      break
    case 'scorch':
      scorch(c, w, a.at)
      break
    case 'melee':
      fight(c, w, s.units.find((x) => x.id === a.target) as StalkerUnit)
      break
    case 'terminal':
      useTerminal(c, w, a)
      break
    case 'takeCore':
      s.core = { where: 'carried', at: null, carrier: w.id }
      s.coreRound = s.round
      emit(c, { type: 'coreTaken', unit: w.id })
      emit(c, { type: 'alarm' })
      break
    default:
      break
  }
}

function scorch(c: Ctx, w: WardenUnit, at: Pos): void {
  const s = c.s
  w.charges -= 1
  const burst: Pos[] = [[at[0], at[1]]]
  for (const o of ORTHO) {
    const nx = at[0] + o[0]
    const ny = at[1] + o[1]
    if (enterable(s, c.g, nx, ny)) burst.push([nx, ny])
  }
  const alreadyBurning = (p: Pos) => isBurning(s, p[0], p[1])
  const rolls: { unit: string; die: number; hit: boolean }[] = []
  const victims: Unit[] = []
  for (const u of s.units) {
    if (u.kind === 'warden' && !u.alive) continue
    if (!burst.some((p) => samePos(p, u.at))) continue
    if (alreadyBurning(u.at)) continue
    victims.push(u)
  }
  for (const u of victims) {
    const die = rollDie(c, 6)
    rolls.push({ unit: u.id, die, hit: die >= rules.scorcher.killOn })
  }
  // new fire first, so the event order reads: scorched (with rolls), then the casualties
  for (const p of burst) if (!alreadyBurning(p)) s.burn.push([p[0], p[1]])
  emit(c, { type: 'scorched', unit: w.id, at: [at[0], at[1]], burst, rolls })
  for (const r of rolls) {
    if (!r.hit) continue
    const u = s.units.find((x) => x.id === r.unit)
    if (u) lethal(c, u, w.id)
  }
}

function useTerminal(c: Ctx, w: WardenUnit, a: Extract<Action, { type: 'terminal' }>): void {
  const s = c.s
  const def = c.g.terminalById[a.terminal]
  if (!def) return
  const e: Event = { type: 'terminalUsed', unit: w.id, terminal: a.terminal, op: a.op }
  if (a.door) (e as { door?: Pos }).door = [a.door[0], a.door[1]]
  emit(c, e)
  if (a.op === 'seal' && a.door) {
    ;(s.doors[posKey(a.door)] as { sealed: boolean }).sealed = true
    emit(c, { type: 'doorChanged', door: [a.door[0], a.door[1]], state: 'sealed' })
  } else if (a.op === 'unseal' && a.door) {
    ;(s.doors[posKey(a.door)] as { sealed: boolean }).sealed = false
    emit(c, { type: 'doorChanged', door: [a.door[0], a.door[1]], state: 'closed' })
  } else if (a.op === 'lights') {
    s.usedTerminals.push(def.id)
    const section = def.section ?? ''
    s.lit.push(section)
    emit(c, { type: 'lit', section })
  } else if (a.op === 'purge') {
    s.usedTerminals.push(def.id)
    const section = def.section ?? ''
    for (const u of [...s.units]) {
      if (u.kind === 'warden' && !u.alive) continue
      if (sectionOf(c.g, section, u.at)) lethal(c, u, 'purge')
    }
    const ducts = (def.ducts ?? []).map((d): Pos => [d[0], d[1]])
    for (const d of ducts) if (!s.purgedDucts.some((p) => samePos(p, d))) s.purgedDucts.push(d)
    emit(c, { type: 'purged', section, ducts })
  }
}

function applyMolt(c: Ctx, u: Unit, a: Action): void {
  const s = c.s
  const st = rules.stalker
  if (u.kind === 'warden') return
  switch (a.type) {
    case 'move': {
      const from: Pos = [u.at[0], u.at[1]]
      u.ap -= st.moveCost
      u.at = [a.to[0], a.to[1]]
      emit(c, { type: 'moved', unit: u.id, from, to: [a.to[0], a.to[1]] })
      if (u.kind === 'stalker') overwatch(c, u.id)
      break
    }
    case 'door':
      u.ap -= st.doorCost
      toggleDoor(c, a.door)
      if (u.kind === 'stalker') overwatch(c, u.id)
      break
    case 'tear': {
      u.ap -= st.tearCost
      const die = rollDie(c, 6)
      const torn = die >= st.tearOn
      emit(c, { type: 'tearRolled', unit: u.id, door: [a.door[0], a.door[1]], die, torn })
      if (torn) {
        s.doors[posKey(a.door)] = { open: true, sealed: false, torn: true }
        emit(c, { type: 'doorChanged', door: [a.door[0], a.door[1]], state: 'torn' })
      }
      overwatch(c, u.id)
      break
    }
    case 'melee':
      u.ap -= rules.cost.melee
      fight(c, u as StalkerUnit, s.units.find((x) => x.id === a.target) as WardenUnit)
      break
    case 'reveal':
      reveal(c, u as PingUnit, false)
      break
    default:
      break
  }
}

/** R-2: the squad that boards is the mission's squad, or the listed members of it (unknown ids ignored; never empty). */
export function boardingSquad(m: { squad: { id: string }[] }, roster?: string[]): string[] {
  const ids = m.squad.map((q) => q.id)
  if (!roster) return ids
  const picked = ids.filter((id) => roster.includes(id))
  return picked.length > 0 ? picked : ids
}

export function newGameState(mission: string, seed: number, roster?: string[]): Ctx {
  const g = geoOf(mission)
  const m = g.mission
  const rng = seedRng(seed)
  const bag = shuffle(rng, m.pingBag)
  const doors: State['doors'] = {}
  for (const d of g.doorSquares) doors[posKey(d)] = { open: false, sealed: false, torn: false }
  for (const d of m.sealed) if (doors[posKey(d)]) (doors[posKey(d)] as { sealed: boolean }).sealed = true
  const boarding = boardingSquad(m, roster)
  const units: Unit[] = m.squad.filter((q) => boarding.includes(q.id)).map((q) => ({
    id: q.id,
    kind: 'warden',
    name: q.name,
    role: q.role,
    at: [q.at[0], q.at[1]],
    facing: q.facing,
    ap: 0,
    heat: 0,
    watch: false,
    breached: false,
    alive: true,
    charges: roles[q.role].weapon === 'scorcher' ? rules.scorcher.charges : 0,
  }))
  const s: State = {
    mission,
    seed,
    round: 1,
    phase: 'warden',
    toAct: 'warden',
    pending: null,
    cp: 0,
    heldCp: 0,
    units,
    doors,
    burn: [],
    lit: [],
    purgedDucts: [],
    usedTerminals: [],
    core: { where: 'console', at: g.consolePos ? [g.consolePos[0], g.consolePos[1]] : null, carrier: null },
    coreRound: null,
    heldOver: 0,
    bag,
    nextId: 1,
    rng,
    result: null,
  }
  const c: Ctx = { s, ev: [], g }
  for (const p of m.startPings) {
    s.units.push({ id: `p${s.nextId++}`, kind: 'ping', at: [p[0], p[1]], ap: rules.pingAp, stalkers: drawBag(c) })
  }
  startWardenPhase(c)
  settle(c)
  return c
}

export { FACING_DELTA, keyOf, isAlive }
