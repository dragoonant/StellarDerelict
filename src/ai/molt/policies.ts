/**
 * The policy table (spec 40): one policy per decision kind, each returning scored candidate actions. The orchestrator
 * (utility.ts) compares candidates of every open kind on one scale.
 */
import { rules } from '../../data'
import { query } from '../../engine'
import type { Action, Board, Pos, StalkerUnit, WardenUnit } from '../../engine'
import { attackTable, stalkerOdds, tIdx } from './combat'
import type { DecisionKind } from './kinds'
import {
  forward,
  firstHop,
  frontOf,
  goalField,
  HOW_DOOR,
  HOW_TEAR,
  idxOf,
  KIND_CLOSED,
  KIND_OPEN,
  KIND_SEALED,
  mdist,
  posOf,
  SV,
  SV_STAY,
  GW,
  type Dyn,
  type Field,
} from './plan'

export interface Profile {
  name: 'veteran' | 'recruit'
  /** pings wait and reveal together; false: a ping reveals alone once a Warden is near */
  groupReveal: boolean
  /** strike squares are valued by their flank odds */
  flankAware: boolean
  /** first hits on a Warden several units can reach are worth more */
  gang: boolean
  /** probability that a unit is idle for a whole phase */
  idleP: number
  /** how much it cares about watch fire and the Warden phase's guns: 1 full, 0 none */
  cover: number
  /** without group reveals: a ping reveals once a Warden is this many steps away */
  revealNear: number
  /** units farther than this from every Warden do nothing (0 = no limit) */
  wake: number
}

export interface Candidate {
  action: Action
  score: number
  kind: DecisionKind
  note?: string
}

export interface Ctx {
  b: Board
  d: Dyn
  profile: Profile
  plan(): Plan
}

export const END_SCORE = 0.05
const REVEAL_T = 1.0
const OFFK = 1.2
const TEAR_W = 0.4

/** deterministic hash in [0,1) */
export function hash01(a: number, b: number, c: number): number {
  let h = (a ^ 0x9e3779b9) | 0
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b)
  h = Math.imul(h ^ (c + 0x165667b1), 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return (h >>> 0) / 4294967296
}
export function idHash(id: string): number {
  let h = 7
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
  return h
}
function idle(c: Ctx, id: string, at: Pos): boolean {
  const p = c.profile
  if (p.wake > 0) {
    const S = c.d.S
    const i = idxOf(S, at)
    let near = 999
    for (const w of S.wardens) near = Math.min(near, mdist(S, i, idxOf(S, w.at)))
    if (near > p.wake) return true
  }
  return p.idleP > 0 && hash01(c.b.seed, c.b.round, idHash(id)) < p.idleP
}

// ---------------------------------------------------------------------------------------------------------------
// The plan: values, tables, fields
// ---------------------------------------------------------------------------------------------------------------

interface WardenPlan {
  w: WardenUnit
  K: number
  front: number
  /** strike squares: enterable neighbours */
  strike: number[]
  gang: boolean
  table: Float64Array
}

interface StalkerBest {
  s: number
  value: number
  /** the attack part of the value (what a strike from there is worth after risks), 0 when none is possible */
  strike: number
  target: WardenUnit | null
}

export interface Plan {
  wp: Map<string, WardenPlan>
  G: Float64Array
  fields: Map<string, Field>
  /** ping id -> hypothetical stalker field for reveal planning */
  reveal: Map<string, { field: Field; n: number }>
}

function killValue(c: Ctx, w: WardenUnit): number {
  const S = c.d.S
  let k = 10
  if (S.carrier && S.carrier.id === w.id) k += 14
  if (S.archiveSealed && w.role === 'tech') k += 3
  if (w.role === 'sergeant') k += 3
  if (w.role === 'scorcher') k += 2
  if (!w.watch) k += 0.5
  return k
}

function buildPlan(c: Ctx): Plan {
  const { d, profile } = c
  const S = d.S
  const wp = new Map<string, WardenPlan>()
  for (const w of S.wardens) {
    const wi = idxOf(S, w.at)
    const strike: number[] = []
    for (let k = 0; k < 4; k++) {
      const n = S.nbr[wi * 4 + k] as number
      if (n >= 0 && S.kind[n] === KIND_OPEN && d.occ[n] !== 1) strike.push(n)
    }
    wp.set(w.id, { w, K: killValue(c, w), front: frontOf(w, S), strike, gang: false, table: new Float64Array(0) })
  }
  // fields of every stalker and of every ping that could reveal
  const fields = new Map<string, Field>()
  const reveal = new Map<string, { field: Field; n: number }>()
  const attackers = new Map<string, number>()
  const count = (f: Field, ap: number, weight: number): void => {
    for (const p of wp.values()) {
      let can = false
      for (const s of p.strike) if ((f.ap[s] as number) <= ap - 1) can = true
      if (can) attackers.set(p.w.id, (attackers.get(p.w.id) ?? 0) + weight)
    }
  }
  for (const u of d.stalkers) {
    if (u.ap < 1) continue
    const f = forward(d, idxOf(S, u.at), { maxAp: u.ap, ping: false, cover: profile.cover })
    fields.set(u.id, f)
    count(f, u.ap, 1)
  }
  for (const u of d.pings) {
    if (u.ap < rules.pingAp) continue
    const f = forward(d, idxOf(S, u.at), { maxAp: rules.stalkerAp, ping: false, ignoreOccFrom: true, cover: profile.cover })
    const n = u.stalkers ?? 1
    reveal.set(u.id, { field: f, n })
    count(f, rules.stalkerAp - (n > 1 ? 1 : 0), n)
  }
  for (const p of wp.values()) {
    p.gang = profile.gang && (attackers.get(p.w.id) ?? 0) >= 2
    p.table = attackTable(p.w.role === 'sergeant', p.K, (p.gang ? 0.6 : 0.45) * p.K, SV)
  }
  // goal field for stalkers
  const seeds: { idx: number; start: number }[] = []
  for (const p of wp.values())
    for (const s of p.strike) {
      const flank = profile.flankAware && s !== p.front
      const ev = p.table[tIdx(5, p.w.breached, flank)] as number
      seeds.push({ idx: s, start: -OFFK * ev + (d.occ[s] ? 1 : 0) })
    }
  const G = goalField(d, seeds, 0.3 * profile.cover)
  return { wp, G, fields, reveal }
}

/** Value of standing on `s` with `a` AP left: the attack that is possible from there plus the position itself. */
function valueAt(c: Ctx, plan: Plan, s: number, a: number, surv: number, from: number): { v: number; strike: number; target: WardenUnit | null } {
  const d = c.d
  const S = d.S
  let atk = 0
  let target: WardenUnit | null = null
  let adjacent = false
  for (const p of plan.wp.values()) {
    if (mdist(S, idxOf(S, p.w.at), s) !== 1) continue
    adjacent = true
    if (a < 1) continue
    const flank = c.profile.flankAware && s !== p.front
    const ev = p.table[tIdx(a, p.w.breached, flank)] as number
    if (ev > atk) {
      atk = ev
      target = p.w
    }
  }
  const g = plan.G[s] as number
  const gv = Number.isFinite(g) ? g : 999
  const risk = c.profile.cover * (SV_STAY * S.exposure(s) * (adjacent && a >= 1 ? 0.8 : 1) + SV_STAY * (1 - surv))
  let v = atk - GW * gv - risk
  // do not bunch where the scorcher can burst us
  if (S.scorchLos(s)) {
    let friends = 0
    for (let k = 0; k < 4; k++) {
      const n = S.nbr[s * 4 + k] as number
      if (n >= 0 && n !== from && (d.occ[n] === 2 || d.occ[n] === 3)) friends++
    }
    v -= 1.5 * friends
  }
  return { v, strike: atk > 0 ? atk - risk : 0, target }
}

/** One-ply over the squares a stalker can reach: the best one, and what doing nothing is worth. */
function bestFor(c: Ctx, plan: Plan, f: Field, apTotal: number): { best: StalkerBest; null0: number; maxStrike: number } {
  const S = c.d.S
  const null0 = valueAt(c, plan, f.from, 0, 1, f.from).v
  const v0 = valueAt(c, plan, f.from, apTotal, 1, f.from)
  let best: StalkerBest = { s: f.from, value: v0.v, strike: v0.strike, target: null }
  let maxStrike = v0.strike
  for (let s = 0; s < S.N; s++) {
    const apS = f.ap[s] as number
    if (s === f.from || apS > apTotal || !Number.isFinite(f.cost[s] as number)) continue
    if (S.kind[s] !== KIND_OPEN) continue
    const r = valueAt(c, plan, s, apTotal - apS, f.surv[s] as number, f.from)
    if (r.v > best.value) best = { s, value: r.v, strike: r.strike, target: r.target }
    if (r.strike > maxStrike) maxStrike = r.strike
  }
  return { best, null0, maxStrike }
}

function hop(u: { id: string }, S: { W: number }, h: { next: number; how: number }): Action {
  const to = posOf(S, h.next)
  if (h.how === HOW_DOOR) return { type: 'door', unit: u.id, door: to }
  if (h.how === HOW_TEAR) return { type: 'tear', unit: u.id, door: to }
  return { type: 'move', unit: u.id, to }
}

// ---------------------------------------------------------------------------------------------------------------
// The policies
// ---------------------------------------------------------------------------------------------------------------

type Policy = (c: Ctx) => Candidate[]

const arrivePolicy: Policy = (c) => {
  const { b, d } = c
  const S = d.S
  const out: Candidate[] = []
  const others: number[] = []
  for (const u of b.units) if (u.kind !== 'warden') others.push(idxOf(S, u.at))
  for (const duct of query.openDucts(b)) {
    const i = idxOf(S, duct)
    const rd = S.routeDist[i] as number
    let score = 100 - (rd >= 9999 ? 60 : rd)
    let near = 12
    for (const o of others) near = Math.min(near, mdist(S, i, o))
    score -= 0.25 * near
    if (S.wardenLos(i)) score -= 1.5
    out.push({ action: { type: 'arrive', duct }, score, kind: 'arrive' })
  }
  return out
}

const stalkerPolicy: Policy = (c) => {
  const { b, d } = c
  const S = d.S
  const plan = c.plan()
  const out: Candidate[] = []
  for (const u of d.stalkers) {
    if (u.ap < 1 || idle(c, u.id, u.at)) continue
    const here = idxOf(S, u.at)
    // melee
    for (const p of plan.wp.values()) {
      if (mdist(S, idxOf(S, p.w.at), here) !== 1) continue
      const o = query.meleeOdds(b, u.id, p.w.id)
      const after = p.table[tIdx(u.ap - 1, true, false)] as number
      const tieV = p.table[tIdx(u.ap - 1, p.w.breached, false)] as number
      const win = p.w.breached ? p.K : (p.gang ? 0.6 : 0.45) * p.K + after
      const ev = o.attackerWins * win + o.tie * tieV - o.defenderWins * SV
      if (ev > END_SCORE) out.push({ action: { type: 'melee', unit: u.id, target: p.w.id }, score: ev, kind: 'stalkerAct', note: 'melee' })
    }
    // move, open or tear toward the best square
    const f = plan.fields.get(u.id)
    if (!f) continue
    const { best, null0 } = bestFor(c, plan, f, u.ap)
    if (best.s !== here) {
      const h = firstHop(f, best.s)
      const gain = best.value - null0
      if (h && gain > END_SCORE) out.push({ action: hop(u, S, h), score: gain, kind: 'stalkerAct', note: 'move' })
    }
    // a sealed door on the way: tear it
    const g0 = plan.G[here] as number
    for (let k = 0; k < 4; k++) {
      const n = S.nbr[here * 4 + k] as number
      if (n < 0 || S.kind[n] !== KIND_SEALED || d.occ[n]) continue
      const gn = plan.G[n] as number
      if (!Number.isFinite(gn) || !(gn < g0 - 0.5)) continue
      const sc = TEAR_W * (g0 - gn) - SV_STAY * S.watchKill(here)
      if (sc > END_SCORE) out.push({ action: { type: 'tear', unit: u.id, door: posOf(S, n) }, score: sc, kind: 'stalkerAct', note: 'tear' })
    }
  }
  return out
}

/** How good a square is to wait on for a ping: near the squad's route, out of its sights. */
function hold(c: Ctx, s: number): number {
  const S = c.d.S
  const D = S.routeDist[s] as number
  const prox = D >= 9999 ? -60 : 4 - 0.9 * Math.abs(D - 3)
  return prox - 2.5 * Math.min(3, S.routeSeen(s)) - (S.wardenLos(s) ? 2 : 0)
}

const pingMovePolicy: Policy = (c) => {
  const { d } = c
  const S = d.S
  const out: Candidate[] = []
  for (const u of d.pings) {
    if (u.ap < 1 || idle(c, u.id, u.at)) continue
    const here = idxOf(S, u.at)
    const f = forward(d, here, { maxAp: u.ap, ping: true, avoidSeen: true })
    const h0 = hold(c, here)
    let bestS = here
    let bestV = h0
    for (let s = 0; s < S.N; s++) {
      if (s === here || (f.ap[s] as number) > u.ap || !Number.isFinite(f.cost[s] as number) || S.kind[s] !== KIND_OPEN) continue
      const v = hold(c, s) - 0.1 * (f.ap[s] as number)
      if (v > bestV) {
        bestV = v
        bestS = s
      }
    }
    if (bestS === here) continue
    const h = firstHop(f, bestS)
    const gain = bestV - h0 - (u.ap >= rules.pingAp ? 0.3 : 0)
    if (h && gain > END_SCORE) out.push({ action: hop(u, S, h), score: gain, kind: 'pingMove' })
  }
  return out
}

const pingRevealPolicy: Policy = (c) => {
  const { b, d, profile } = c
  const S = d.S
  const plan = c.plan()
  const out: Candidate[] = []
  const limit = (S.g.mission.roundLimit as number) ?? 16
  const homeStretch = S.carrier !== null && (S.toObj[idxOf(S, S.carrier.at)] as number) <= 10
  const release = b.round >= limit - 1 || homeStretch
  for (const u of d.pings) {
    if (u.ap < rules.pingAp || idle(c, u.id, u.at)) continue
    const r = plan.reveal.get(u.id)
    if (!r) continue
    const here = idxOf(S, u.at)
    if (!profile.groupReveal) {
      let near = 999
      for (const w of S.wardens) near = Math.min(near, query.pathDistance(b, u.at, w.at) ?? 999)
      if (near <= profile.revealNear) out.push({ action: { type: 'reveal', unit: u.id }, score: 6, kind: 'pingReveal' })
      continue
    }
    const full = bestFor(c, plan, r.field, rules.stalkerAp)
    const less = r.n > 1 ? bestFor(c, plan, r.field, rules.stalkerAp - 1) : full
    let total = Math.max(0, full.maxStrike)
    for (let i = 1; i < r.n; i++) total += 0.85 * Math.max(0, less.maxStrike)
    void here
    if (total >= (release ? 1 : REVEAL_T)) out.push({ action: { type: 'reveal', unit: u.id }, score: total + 0.5, kind: 'pingReveal' })
  }
  return out
}

const endPhasePolicy: Policy = () => [{ action: { type: 'endPhase' }, score: END_SCORE, kind: 'endPhase' }]

/** Exhaustive on DecisionKind: a new kind is a compile error until it has a policy. */
export const POLICIES: Record<DecisionKind, Policy> = {
  arrive: arrivePolicy,
  pingMove: pingMovePolicy,
  pingReveal: pingRevealPolicy,
  stalkerAct: stalkerPolicy,
  endPhase: endPhasePolicy,
}

export function makeCtx(b: Board, d: Dyn, profile: Profile): Ctx {
  let plan: Plan | null = null
  const c: Ctx = {
    b,
    d,
    profile,
    plan() {
      if (!plan) plan = buildPlan(c)
      return plan
    },
  }
  return c
}

void stalkerOdds
export type { StalkerUnit, Pos }

