/**
 * Scripted policies for the sim and the balance record. They are decent, not clever: the real AI is a later milestone.
 * Both policies read the mission's terminals, sealed doors and optional `aiHints` slots through `missionPlan`, so they play any mission.
 */
import { getMission, type Slot } from '../data'
import { query } from '../engine'
import type { Action, Board, Facing, Pos, StalkerUnit, ViewUnit, WardenUnit } from '../engine'

export type Policy = (b: Board, rand: () => number) => Action

export const DX: Record<Facing, number> = { N: 0, E: 1, S: 0, W: -1 }
export const DY: Record<Facing, number> = { N: -1, E: 0, S: 1, W: 0 }
export const FACINGS: Facing[] = ['N', 'E', 'S', 'W']
const LEFT: Record<Facing, Facing> = { N: 'W', W: 'S', S: 'E', E: 'N' }
const RIGHT: Record<Facing, Facing> = { N: 'E', E: 'S', S: 'W', W: 'N' }
const ORTHO: Pos[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]
const key = (p: Pos): string => `${p[0]},${p[1]}`
const eq = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1]
const manh = (a: Pos, b: Pos): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])
const END: Action = { type: 'endPhase' }

// ---------------------------------------------------------------------------------------------
// Shared board helpers
// ---------------------------------------------------------------------------------------------

type DoorKind = 'open' | 'closed' | 'sealed' | 'wall'

export function squareKind(b: Board, x: number, y: number): DoorKind | 'floor' {
  const t = query.terrain(b, [x, y])
  if (t === 'wall' || t === 'terminal' || t === 'console') return 'wall'
  if (t === 'door' || t === 'bulkhead') {
    const d = b.doors[`${x},${y}`]
    if (!d) return 'wall'
    return d.open ? 'open' : d.sealed ? 'sealed' : 'closed'
  }
  return 'floor'
}

function alive(u: ViewUnit): boolean {
  return u.kind !== 'warden' || u.alive
}
function wardensOf(b: Board): WardenUnit[] {
  return b.units.filter((u): u is WardenUnit => u.kind === 'warden' && u.alive)
}
function stalkersOf(b: Board): StalkerUnit[] {
  return b.units.filter((u): u is StalkerUnit => u.kind === 'stalker')
}
export function occupied(b: Board, x: number, y: number, except?: string): ViewUnit | undefined {
  return b.units.find((u) => alive(u) && u.at[0] === x && u.at[1] === y && u.id !== except)
}
export function burning(b: Board, x: number, y: number): boolean {
  return b.burn.some((p) => p[0] === x && p[1] === y)
}

interface Walk {
  dist: Map<string, number>
  prev: Map<string, string>
}

/**
 * Cheapest walks for a Molt unit. Floor 1, closed door 2 (open it), sealed door 4 (tear, stalkers only).
 * Friendly units and Wardens block; `avoid` squares are never entered.
 */
function moltWalk(b: Board, u: ViewUnit, avoid: (p: Pos) => boolean): Walk {
  const dist = new Map<string, number>([[key(u.at), 0]])
  const prev = new Map<string, string>()
  const buckets: Pos[][] = [[u.at]]
  for (let c = 0; c < buckets.length; c++) {
    const list = buckets[c]
    if (!list) continue
    for (const p of list) {
      if ((dist.get(key(p)) as number) !== c) continue
      for (const o of ORTHO) {
        const n: Pos = [p[0] + o[0], p[1] + o[1]]
        const k = squareKind(b, n[0], n[1])
        if (k === 'wall' || (k === 'sealed' && u.kind === 'ping')) continue
        if (occupied(b, n[0], n[1], u.id) || burning(b, n[0], n[1]) || avoid(n)) continue
        const step = k === 'closed' ? 2 : k === 'sealed' ? 4 : 1
        const nc = c + step
        const old = dist.get(key(n))
        if (old !== undefined && old <= nc) continue
        dist.set(key(n), nc)
        prev.set(key(n), key(p))
        while (buckets.length <= nc) buckets.push([])
        buckets[nc]?.push(n)
      }
    }
  }
  return { dist, prev }
}

/** The first square on the walk from the unit to `goal`. */
function firstStep(u: ViewUnit, walk: Walk, goal: Pos): Pos | null {
  let k = key(goal)
  if (!walk.dist.has(k)) return null
  const start = key(u.at)
  for (let i = 0; i < 400; i++) {
    const p = walk.prev.get(k)
    if (p === undefined) return null
    if (p === start) {
      const [x, y] = k.split(',').map(Number) as [number, number]
      return [x, y]
    }
    k = p
  }
  return null
}

/** Move, open or tear toward the square `next`. */
function stepInto(b: Board, u: ViewUnit, next: Pos): Action | null {
  const k = squareKind(b, next[0], next[1])
  if (k === 'closed') return { type: 'door', unit: u.id, door: next }
  if (k === 'sealed') return u.kind === 'stalker' ? { type: 'tear', unit: u.id, door: next } : null
  if (k === 'open' || k === 'floor') return { type: 'move', unit: u.id, to: next }
  return null
}

// ---------------------------------------------------------------------------------------------
// Warden policy
// ---------------------------------------------------------------------------------------------

export type { Slot } from '../data'

/**
 * What the Warden policies need to know about a mission, read from its data (spec 40 "Any mission"): the terminal that
 * unseals the doors that start sealed (the lock), the other bulkhead terminal nearest the airlock and its doors (the
 * flanks), and the optional formation slots from `aiHints`. Cached per mission id.
 */
export interface MissionPlan {
  lockTerminal: string | null
  sealedDoors: Pos[]
  flankTerminal: string | null
  flankDoors: Pos[]
  staging: Slot[]
  arms: Slot[]
  core: Slot[]
  deep: Slot[]
}

const planCache = new Map<string, MissionPlan>()

export function missionPlan(b: Board): MissionPlan {
  const hit = planCache.get(b.mission)
  if (hit) return hit
  const m = getMission(b.mission)
  const empty: MissionPlan = { lockTerminal: null, sealedDoors: [], flankTerminal: null, flankDoors: [], staging: [], arms: [], core: [], deep: [] }
  if (!m) return empty
  const sealedDoors: Pos[] = m.sealed.map((d) => [d[0], d[1]])
  const isSealed = (d: Pos): boolean => sealedDoors.some((q) => eq(q, d))
  const bulkheads = m.terminals.filter((t) => t.system === 'bulkheads')
  let lock: (typeof bulkheads)[number] | null = null
  let lockN = 0
  for (const t of bulkheads) {
    const n = (t.doors ?? []).filter(isSealed).length
    if (n > lockN) {
      lock = t
      lockN = n
    }
  }
  const airD = airDistances(b)
  let flank: (typeof bulkheads)[number] | null = null
  let flankD = Infinity
  for (const t of bulkheads) {
    if (lock && t.id === lock.id) continue
    const d = Math.min(...ORTHO.map((o) => airD.get(`${t.at[0] + o[0]},${t.at[1] + o[1]}`) ?? Infinity))
    if (d < flankD) {
      flankD = d
      flank = t
    }
  }
  const plan: MissionPlan = {
    lockTerminal: lock?.id ?? null,
    sealedDoors,
    flankTerminal: flank?.id ?? null,
    flankDoors: (flank?.doors ?? []).filter((d) => !isSealed(d)).map((d): Pos => [d[0], d[1]]),
    staging: (m.aiHints?.staging ?? []).map((x) => [x[0], x[1], x[2]] as Slot),
    arms: (m.aiHints?.arms ?? []).map((x) => [x[0], x[1], x[2]] as Slot),
    core: (m.aiHints?.core ?? m.aiHints?.arms ?? []).map((x) => [x[0], x[1], x[2]] as Slot),
    deep: (m.aiHints?.deep ?? []).map((x) => [x[0], x[1], x[2]] as Slot),
  }
  planCache.set(b.mission, plan)
  return plan
}

export type GoalFn = (x: number, y: number, f: Facing) => boolean

function spare(b: Board): number {
  return Math.max(0, b.cp - 2)
}
function canSpend(b: Board, w: WardenUnit, n: number, useCp: boolean): boolean {
  if (w.ap >= n) return true
  return useCp && n - w.ap <= (useCp ? b.cp : 0)
}
function canSpendSpare(b: Board, w: WardenUnit, n: number): boolean {
  return w.ap >= n || n - w.ap <= spare(b)
}

export interface Plan {
  cost: number
  action: Action | null
}

/** Cheapest way for a Warden to reach any (x, y, facing) the goal accepts; friends are ignored, Molt units block. */
export function planWarden(b: Board, w: WardenUnit, goal: GoalFn, blockFriends = false): Plan | null {
  const mission = getMission(b.mission)
  if (!mission) return null
  const H = mission.grid.length
  const W = mission.grid[0]?.length ?? 0
  const idx = (x: number, y: number, f: number): number => (y * W + x) * 4 + f
  const N = W * H * 4
  const dist = new Float64Array(N).fill(Infinity)
  const parent = new Int32Array(N).fill(-1)
  const kind: string[] = new Array(N).fill('')
  const blockedByMolt = new Set<string>()
  for (const u of b.units) if ((u.kind !== 'warden' || (blockFriends && u.id !== w.id && u.alive)) ) blockedByMolt.add(key(u.at))
  const startF = FACINGS.indexOf(w.facing)
  const start = idx(w.at[0], w.at[1], startF)
  dist[start] = 0
  const buckets: number[][] = [[start]]
  let found = -1
  for (let c = 0; c < buckets.length && found < 0; c++) {
    const list = buckets[c]
    if (!list) continue
    for (const s of list) {
      if (dist[s] !== c) continue
      const f = s % 4
      const cell = (s - f) / 4
      const x = cell % W
      const y = Math.floor(cell / W)
      const fa = FACINGS[f] as Facing
      if (goal(x, y, fa)) {
        found = s
        break
      }
      const relax = (t: number, nc: number, kd: string): void => {
        if (nc < (dist[t] as number)) {
          dist[t] = nc
          parent[t] = s
          kind[t] = kd
          while (buckets.length <= nc) buckets.push([])
          buckets[nc]?.push(t)
        }
      }
      const fx = x + DX[fa]
      const fy = y + DY[fa]
      const fk = squareKind(b, fx, fy)
      if ((fk === 'floor' || fk === 'open' || fk === 'closed') && !blockedByMolt.has(`${fx},${fy}`) && !burning(b, fx, fy))
        relax(idx(fx, fy, f), c + (fk === 'closed' ? 2 : 1), fk === 'closed' ? 'door' : 'fwd')
      const bx = x - DX[fa]
      const by = y - DY[fa]
      const bk = squareKind(b, bx, by)
      if ((bk === 'floor' || bk === 'open') && !blockedByMolt.has(`${bx},${by}`) && !burning(b, bx, by))
        relax(idx(bx, by, f), c + 2, 'back')
      relax(idx(x, y, FACINGS.indexOf(LEFT[fa])), c + 1, 'turnL')
      relax(idx(x, y, FACINGS.indexOf(RIGHT[fa])), c + 1, 'turnR')
    }
  }
  if (found < 0) return null
  const cost = dist[found] as number
  if (found === start) return { cost: 0, action: null }
  let cur = found
  while (parent[cur] !== start) cur = parent[cur] as number
  const kd = kind[cur]
  const ahead: Pos = [w.at[0] + DX[w.facing], w.at[1] + DY[w.facing]]
  const behind: Pos = [w.at[0] - DX[w.facing], w.at[1] - DY[w.facing]]
  let action: Action | null = null
  if (kd === 'fwd') action = { type: 'move', unit: w.id, to: ahead }
  else if (kd === 'door') action = { type: 'door', unit: w.id, door: ahead }
  else if (kd === 'back') action = { type: 'move', unit: w.id, to: behind }
  else if (kd === 'turnL') action = { type: 'turn', unit: w.id, facing: LEFT[w.facing] }
  else if (kd === 'turnR') action = { type: 'turn', unit: w.id, facing: RIGHT[w.facing] }
  return { cost, action }
}

export function adjacentGoal(target: Pos, b: Board): GoalFn {
  return (x, y, f) => x + DX[f] === target[0] && y + DY[f] === target[1] && squareKind(b, x, y) !== 'wall'
}
export function slotGoal(s: Slot): GoalFn {
  return (x, y, f) => x === s[0] && y === s[1] && f === s[2]
}

export function terminalPos(b: Board, id: string): Pos | null {
  return getMission(b.mission)?.terminals.find((t) => t.id === id)?.at ?? null
}
export function consolePos(b: Board): Pos | null {
  const m = getMission(b.mission)
  if (!m) return null
  for (let y = 0; y < m.grid.length; y++)
    for (let x = 0; x < (m.grid[y]?.length ?? 0); x++) if (m.legend[m.grid[y]?.[x] ?? '#'] === 'console') return [x, y]
  return null
}

export type Stage = 'flanks' | 'unlock' | 'core' | 'carry' | 'pickup'

export function stageOf(b: Board): Stage {
  if (b.core.where === 'carried') return 'carry'
  if (b.core.where === 'loose') return 'pickup'
  const P = missionPlan(b)
  const doorsDone = P.flankDoors.every((d) => {
    const s = b.doors[key(d)]
    return !s || s.sealed || s.open || s.torn
  })
  if (!doorsDone && b.round <= 4) return 'flanks'
  if (lockSealed(b)) return 'unlock'
  return 'core'
}

/** Any door that started sealed is still sealed (the lock terminal has work left). */
export function lockSealed(b: Board): boolean {
  return missionPlan(b).sealedDoors.some((d) => b.doors[key(d)]?.sealed)
}

export function airDistances(b: Board): Map<string, number> {
  const m = getMission(b.mission)
  const dist = new Map<string, number>()
  if (!m) return dist
  const q: Pos[] = []
  for (let y = 0; y < m.grid.length; y++)
    for (let x = 0; x < (m.grid[y]?.length ?? 0); x++)
      if (m.legend[m.grid[y]?.[x] ?? '#'] === 'airlock') {
        dist.set(`${x},${y}`, 0)
        q.push([x, y])
      }
  for (let i = 0; i < q.length; i++) {
    const p = q[i] as Pos
    const d = dist.get(key(p)) as number
    for (const o of ORTHO) {
      const n: Pos = [p[0] + o[0], p[1] + o[1]]
      const k = squareKind(b, n[0], n[1])
      if (k === 'wall' || dist.has(key(n))) continue
      dist.set(key(n), d + 1)
      q.push(n)
    }
  }
  return dist
}

function combat(b: Board, w: WardenUnit): Action | null {
  const enemies = b.units.filter((u) => u.kind !== 'warden')
  if (enemies.length === 0) return null
  const near = enemies.filter((e) => manh(e.at, w.at) <= 12)
  if (near.length === 0) return null
  const stalkers = near.filter((e): e is StalkerUnit => e.kind === 'stalker')
  const useCp = (n: number): boolean => canSpend(b, w, n, stalkers.some((s) => manh(s.at, w.at) <= 2) || spare(b) > 0)
  if (w.role === 'scorcher') return scorch(b, w, near)
  if (stalkers.length === 0) return null
  const locked = query.isLocked(b, w.id)
  if (locked && useCp(1)) {
    const a: Action = { type: 'vent', unit: w.id }
    if (query.why(b, a) === null) return a
  }
  let best: { a: Action; score: number } | null = null
  for (const s of stalkers) {
    const a: Action = { type: 'fire', unit: w.id, target: s.id }
    if (query.why(b, a) !== null || !useCp(1)) continue
    const d = manh(s.at, w.at)
    const p = query.hitChance(b, w.id, s.id)
    if (!(p >= 0.5 || d <= 4 || (w.heat <= 1 && p >= 0.3))) continue
    if (w.heat >= 3 && d > 3) continue
    const score = p + (d <= 2 ? 1 : 0) - d * 0.01
    if (!best || score > best.score) best = { a, score }
  }
  if (best) return best.a
  // melee when the stalker is directly ahead and the odds favour us
  for (const s of stalkers) {
    const a: Action = { type: 'melee', unit: w.id, target: s.id }
    if (query.why(b, a) !== null || !useCp(1)) continue
    const o = query.meleeOdds(b, w.id, s.id)
    if (o.attackerWins > o.defenderWins) return a
  }
  // an adjacent stalker outside the arc: turn to it
  for (const s of stalkers) {
    if (manh(s.at, w.at) !== 1) continue
    if (query.why(b, { type: 'fire', unit: w.id, target: s.id }) === null) continue
    const dx = s.at[0] - w.at[0]
    const dy = s.at[1] - w.at[1]
    const want: Facing = dx > 0 ? 'E' : dx < 0 ? 'W' : dy > 0 ? 'S' : 'N'
    if (want === w.facing) continue
    const t: Facing = LEFT[w.facing] === want ? LEFT[w.facing] : RIGHT[w.facing]
    const a: Action = { type: 'turn', unit: w.id, facing: t }
    if (query.why(b, a) === null && useCp(1)) return a
  }
  return null
}

function scorch(b: Board, w: WardenUnit, near: ViewUnit[]): Action | null {
  if (w.charges <= 0 || !canSpend(b, w, 2, spare(b) > 0 || near.some((e) => manh(e.at, w.at) <= 3))) return null
  const r = 6
  let best: { a: Action; score: number } | null = null
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > r || (dx === 0 && dy === 0)) continue
      const at: Pos = [w.at[0] + dx, w.at[1] + dy]
      // cheap pre-filter: only squares at or beside an enemy
      if (!near.some((e) => manh(e.at, at) <= 1)) continue
      const a: Action = { type: 'scorch', unit: w.id, at }
      if (query.why(b, a) !== null) continue
      let score = 0
      for (const p of query.burst(b, w.id, at)) {
        const u = occupied(b, p[0], p[1])
        if (!u || burning(b, p[0], p[1])) continue
        if (u.kind === 'warden') score -= 2.5
        else score += 1
      }
      if (!best || score > best.score) best = { a, score }
    }
  if (!best) return null
  const close = near.some((e) => manh(e.at, w.at) <= 3)
  return best.score >= 2 || (best.score >= 1 && close) ? best.a : null
}

/** The first scripted Warden (M3). Kept for comparison; the sim and bench use `wardenPolicy` from warden.ts. */
export const wardenPolicyV1: Policy = (b) => {
  const ws = wardensOf(b)
  const act = (w: WardenUnit): boolean => w.ap > 0 || b.cp > 0
  // pass A: combat
  for (const w of ws) {
    if (!act(w)) continue
    const a = combat(b, w)
    if (a) return a
  }
  // pass B: objective
  const stage = stageOf(b)
  const P = missionPlan(b)
  const tech = ws.find((w) => w.role === 'tech')
  const goals = new Map<string, { goal: GoalFn | null; op: 'terminal' | 'core' | null; useCp: boolean }>()
  const airD = airDistances(b)
  const pick = (g: GoalFn, prefer?: WardenUnit): WardenUnit | null => {
    let best: { w: WardenUnit; cost: number } | null = null
    for (const w of ws) {
      const p = planWarden(b, w, g)
      if (!p) continue
      const cost = p.cost - (prefer && prefer.id === w.id ? 8 : 0)
      if (!best || cost < best.cost) best = { w, cost }
    }
    return best?.w ?? null
  }
  let operator: WardenUnit | null = null
  const terminal = stage === 'flanks' ? terminalPos(b, P.flankTerminal ?? '') : terminalPos(b, P.lockTerminal ?? '')
  if (stage === 'flanks' || stage === 'unlock') {
    if (terminal) {
      operator = pick(adjacentGoal(terminal, b), tech)
      if (operator) goals.set(operator.id, { goal: adjacentGoal(terminal, b), op: 'terminal', useCp: true })
    }
  } else if (stage === 'core') {
    const con = consolePos(b)
    if (con) {
      operator = pick(adjacentGoal(con, b), tech)
      if (operator) goals.set(operator.id, { goal: adjacentGoal(con, b), op: 'core', useCp: true })
    }
  } else if (stage === 'carry') {
    operator = query.carrier(b) ?? null
    if (operator) {
      const op = operator
      const near = (x: number, y: number): boolean => airD.get(`${x},${y}`) === 0
      const reach = planWarden(b, op, near)
      const useCp = !!reach && reach.cost <= op.ap + b.cp
      goals.set(op.id, { goal: near, op: null, useCp })
    }
  } else if (stage === 'pickup' && b.core.at) {
    const at = b.core.at
    operator = pick((x, y) => x === at[0] && y === at[1])
    if (operator) goals.set(operator.id, { goal: (x, y) => x === at[0] && y === at[1], op: null, useCp: false })
  }
  const escorts = ws.filter((w) => !operator || w.id !== operator.id)
  escorts.forEach((w, i) => {
    let g: GoalFn | null = null
    if (stage === 'flanks' && P.staging.length) g = slotGoal(P.staging[i % P.staging.length] as Slot)
    else if (stage === 'unlock' && P.arms.length) g = slotGoal(P.arms[i % P.arms.length] as Slot)
    else if (stage === 'core' && P.core.length) g = slotGoal(P.core[i % P.core.length] as Slot)
    else if (stage === 'carry' && operator) {
      const cd = airD.get(key(operator.at)) ?? 999
      const wd = airD.get(key(w.at)) ?? 999
      const car = operator.at
      const inArms = P.arms.some((a) => a[0] === w.at[0] && a[1] === w.at[1])
      if (cd < wd) g = (x, y) => (x !== car[0] || y !== car[1]) && manh([x, y], car) <= 3 && (airD.get(`${x},${y}`) ?? 999) >= cd && airD.get(`${x},${y}`) !== 0
      else if (inArms) g = null
      else if (manh(w.at, car) <= 4 && P.deep.length) g = slotGoal(P.deep[i % P.deep.length] as Slot)
      else if (P.arms.length) g = slotGoal(P.arms[i % P.arms.length] as Slot)
    }
    goals.set(w.id, { goal: g, op: null, useCp: false })
  })
  // operators first, then by remaining plan cost
  const order = ws
    .map((w) => ({ w, g: goals.get(w.id), p: goals.get(w.id)?.goal ? planWarden(b, w, goals.get(w.id)?.goal as GoalFn) : null }))
    .sort((x, y) => (x.w.id === operator?.id ? -1 : y.w.id === operator?.id ? 1 : (x.p?.cost ?? 999) - (y.p?.cost ?? 999)))
  for (const { w, g, p } of order) {
    if (!g || !g.goal || !act(w)) continue
    if (p && p.cost === 0) {
      // standing on the goal: do the job
      if (g.op === 'core') {
        const a: Action = { type: 'takeCore', unit: w.id }
        if (query.why(b, a) === null) return a
      } else if (g.op === 'terminal') {
        const opts = query.terminalOps(b, w.id).filter((o) => o.available)
        const want = stage === 'flanks' ? opts.find((o) => o.op === 'seal' && o.door && P.flankDoors.some((d) => eq(d, o.door as Pos))) : opts.find((o) => o.op === 'unseal' && o.door && P.sealedDoors.some((d) => eq(d, o.door as Pos)))
        if (want) {
          const a: Action = want.door
            ? { type: 'terminal', unit: w.id, terminal: want.terminal, op: want.op, door: want.door }
            : { type: 'terminal', unit: w.id, terminal: want.terminal, op: want.op }
          return a
        }
      }
      continue
    }
    if (!p || !p.action) continue
    const cost = query.cost(b, p.action)
    const useCp = g.useCp || spare(b) > 0
    if (!cost.affordable) continue
    if (cost.cp > 0 && !(useCp && (g.useCp || cost.cp <= spare(b)))) continue
    if (query.why(b, p.action) === null) return p.action
    if (w.id === operator?.id && g.goal) {
      const alt = planWarden(b, w, g.goal, true)
      if (alt?.action && query.why(b, alt.action) === null && query.cost(b, alt.action).affordable) return alt.action
    }
  }
  // pass C: housekeeping with what is left
  const threatened = (w: WardenUnit): boolean => b.units.some((u) => u.kind !== 'warden' && manh(u.at, w.at) <= 10)
  for (const w of ws) {
    if (w.ap <= 0 || !threatened(w)) continue
    if (w.role !== 'scorcher' && w.heat >= 3) {
      const a: Action = { type: 'vent', unit: w.id }
      if (query.why(b, a) === null) return a
    }
  }
  for (const w of ws) {
    if (w.ap < 2 || w.watch || w.role === 'scorcher' || !threatened(w)) continue
    // do not stand watch in a corridor the carrier still has to use
    if (stage === 'carry' && w.id !== operator?.id && (airD.get(key(w.at)) ?? 0) > (airD.get(key(operator?.at ?? w.at)) ?? 999)) continue
    const a: Action = { type: 'watch', unit: w.id }
    if (query.why(b, a) === null) return a
  }
  return END
}

// ---------------------------------------------------------------------------------------------
// Molt policy
// ---------------------------------------------------------------------------------------------

const seenCache = new WeakMap<object, Set<string>>()
function seenKeys(b: Board): Set<string> {
  let s = seenCache.get(b)
  if (!s) {
    s = new Set(query.seenSquares(b).map(key))
    seenCache.set(b, s)
  }
  return s
}

function targetsOf(b: Board): WardenUnit[] {
  const c = query.carrier(b)
  const ws = wardensOf(b)
  return c && c.alive ? [c, ...ws.filter((w) => w.id !== c.id)] : ws
}

/** Squares from which a stalker could strike `w`, flank squares first. */
function strikeSquares(b: Board, w: WardenUnit): { p: Pos; flank: boolean }[] {
  const out: { p: Pos; flank: boolean }[] = []
  const front: Pos = [w.at[0] + DX[w.facing], w.at[1] + DY[w.facing]]
  for (const o of ORTHO) {
    const p: Pos = [w.at[0] + o[0], w.at[1] + o[1]]
    if (squareKind(b, p[0], p[1]) === 'wall') continue
    out.push({ p, flank: !eq(p, front) })
  }
  return out
}

const STUCK_REVEAL = false

export const moltPolicy: Policy = (b, rand) => {
  void rand
  const ws = wardensOf(b)
  if (ws.length === 0) return END
  // arrivals: the open duct nearest the carrier, else the squad
  if (b.pending) {
    const ducts = query.openDucts(b)
    const tg = targetsOf(b)
    const aim = tg[0]
    let best = ducts[0] as Pos
    let bd = Infinity
    for (const d of ducts) {
      const dd = aim ? (query.pathDistance(b, d, aim.at) ?? 999) : 0
      const sd = Math.min(...ws.map((w) => query.pathDistance(b, d, w.at) ?? 999))
      const v = dd * 0.6 + sd
      if (v < bd) {
        bd = v
        best = d
      }
    }
    return { type: 'arrive', duct: best }
  }
  const targets = targetsOf(b)
  // stalkers
  for (const u of b.units) {
    if (u.kind !== 'stalker' || u.ap < 1) continue
    // strike an adjacent Warden: prefer flank, the carrier, and the already-breached
    let bestHit: { a: Action; score: number } | null = null
    for (const w of ws) {
      if (manh(w.at, u.at) !== 1) continue
      const front: Pos = [w.at[0] + DX[w.facing], w.at[1] + DY[w.facing]]
      const flank = !eq(u.at, front)
      const odds = query.meleeOdds(b, u.id, w.id)
      const score = (flank ? 3 : 0) + (w.id === b.core.carrier ? 2 : 0) + (w.breached ? 1 : 0) + odds.attackerWins * 2 - odds.defenderWins
      if (!bestHit || score > bestHit.score) bestHit = { a: { type: 'melee', unit: u.id, target: w.id }, score }
    }
    if (bestHit && (bestHit.score > -0.2 || u.ap <= 1)) return bestHit.a
    // otherwise walk to the best strike square
    const walk = moltWalk(b, u, () => false)
    let goal: { p: Pos; v: number } | null = null
    for (const w of targets) {
      for (const s of strikeSquares(b, w)) {
        const d = walk.dist.get(key(s.p))
        if (d === undefined || (!eq(s.p, u.at) && occupied(b, s.p[0], s.p[1]))) continue
        const v = d + (s.flank ? 0 : 1.5) + (w.id === b.core.carrier ? -2 : 0)
        if (!goal || v < goal.v) goal = { p: s.p, v }
      }
    }
    if (!goal || eq(goal.p, u.at)) continue
    const nxt = firstStep(u, walk, goal.p)
    if (!nxt) continue
    const a = stepInto(b, u, nxt)
    if (a && query.why(b, a) === null) return a
  }
  // pings
  for (const u of b.units) {
    if (u.kind !== 'ping' || u.ap < 1) continue
    const dists = ws.map((w) => query.pathDistance(b, u.at, w.at) ?? 999)
    const nearest = Math.min(...dists)
    if (u.ap >= 6 && nearest <= 6) {
      const a: Action = { type: 'reveal', unit: u.id }
      if (query.why(b, a) === null) return a
    }
    const seenSet = seenKeys(b)
    const walk = moltWalk(b, u, (p) => seenSet.has(key(p)))
    let goal: { p: Pos; v: number } | null = null
    for (const w of targets) {
      for (const s of strikeSquares(b, w)) {
        const d = walk.dist.get(key(s.p))
        if (d === undefined) continue
        const v = d + (w.id === b.core.carrier ? -2 : 0)
        if (!goal || v < goal.v) goal = { p: s.p, v }
      }
    }
    const nxt = goal && !eq(goal.p, u.at) ? firstStep(u, walk, goal.p) : null
    const a = nxt ? stepInto(b, u, nxt) : null
    if (a && query.why(b, a) === null) return a
    // boxed in by watchers: a ping at full AP that is still fairly close goes loud
    if (STUCK_REVEAL && u.ap >= 6 && nearest <= 14) {
      const r: Action = { type: 'reveal', unit: u.id }
      if (query.why(b, r) === null) return r
    }
  }
  return END
}
