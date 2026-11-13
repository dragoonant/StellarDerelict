/**
 * The Warden policy (spec 40 section "Wardens"): a greedy utility player for the squad. Every call scores the legal
 * candidates of all Wardens on one scale and plays the best: fight what blocks the way (fire, melee, scorch, turn to an
 * adjacent contact), look round corners when the guns are ready, advance in file with the lead first, keep a rear guard,
 * run the clock (rush when behind schedule, watch and vent when ahead), work the archive lock and the core, then escort the
 * carrier home. Pure and deterministic given the board. Written for Dead Reckoning (terminal ids come from scripted.ts).
 */
import { getMission } from '../data'
import { query } from '../engine'
import type { Action, Board, Facing, Pos, StalkerUnit, WardenUnit } from '../engine'
import {
  ARCHIVE_DOOR,
  ARMS,
  FLANK_DOORS,
  FLANK_TERMINAL,
  STAGING,
  slotGoal,
  stageOf,
  LOCK_TERMINAL,
  adjacentGoal,
  airDistances,
  consolePos,
  planWarden,
  squareKind,
  terminalPos,
  type GoalFn,
  type Policy,
} from './scripted'

const END: Action = { type: 'endPhase' }
const manh = (a: Pos, b: Pos): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])
const eq = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1]
const key = (p: Pos): string => `${p[0]},${p[1]}`
const ORTHO: Pos[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]
const LEFT: Record<Facing, Facing> = { N: 'W', W: 'S', S: 'E', E: 'N' }
const RIGHT: Record<Facing, Facing> = { N: 'E', E: 'S', S: 'W', W: 'N' }
const DELTA: Record<Facing, Pos> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

interface Cand {
  a: Action
  s: number
}

function bfs(b: Board, sources: Pos[]): Map<string, number> {
  const dist = new Map<string, number>()
  const q: Pos[] = []
  for (const s of sources) {
    dist.set(key(s), 0)
    q.push(s)
  }
  for (let i = 0; i < q.length; i++) {
    const p = q[i] as Pos
    const d = dist.get(key(p)) as number
    for (const o of ORTHO) {
      const n: Pos = [p[0] + o[0], p[1] + o[1]]
      if (squareKind(b, n[0], n[1]) === 'wall' || dist.has(key(n))) continue
      dist.set(key(n), d + 1)
      q.push(n)
    }
  }
  return dist
}

function facingToward(from: Pos, to: Pos): Facing {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'E' : 'W'
  return dy > 0 ? 'S' : 'N'
}

export interface WardenTuning {
  /** rounds of slack below which the squad stops watching and venting and spends all its CP */
  rushSlack: number
  /** how far (path squares) the point may get ahead of the third Warden */
  maxGap: number
  escortGap: number
  reveal: boolean
  /** squares per round the schedule assumes */
  pace: number
  carrierWait: boolean
  flanks: boolean
  arms: boolean
  cohesion: boolean
  watchScore: number
  guard: boolean
}
export const TUNING: WardenTuning = { rushSlack: 1.5, maxGap: 5, escortGap: 99, reveal: true, pace: 2.5, carrierWait: true, flanks: true, arms: true, cohesion: true, watchScore: 1.0, guard: true }

/** Last candidate list (for diagnostics only). */
export const debug: { cands: { a: Action; s: number }[]; why: Record<string, string> } = { cands: [], why: {} }

export const wardenPolicy: Policy = (b) => {
  const ws = b.units.filter((u): u is WardenUnit => u.kind === 'warden' && u.alive)
  if (ws.length === 0) return END
  const stalkers = b.units.filter((u): u is StalkerUnit => u.kind === 'stalker')
  const pings = b.units.filter((u) => u.kind === 'ping')
  const contacts = [...stalkers, ...pings]
  const mission = getMission(b.mission)
  const limit = mission?.roundLimit ?? 16
  const conPos = consolePos(b)
  const carrier = query.carrier(b)
  const airD = airDistances(b)

  // ---- stage and schedule --------------------------------------------------------------------------
  type Stage = 'flanks' | 'unlock' | 'core' | 'carry' | 'pickup'
  const stage: Stage = TUNING.flanks ? stageOf(b) : stageOf(b) === 'flanks' ? (b.doors[key(ARCHIVE_DOOR)]?.sealed ? 'unlock' : 'core') : stageOf(b)
  const conAdj: Pos[] = []
  if (conPos)
    for (const o of ORTHO) {
      const n: Pos = [conPos[0] + o[0], conPos[1] + o[1]]
      if (squareKind(b, n[0], n[1]) !== 'wall') conAdj.push(n)
    }
  const conD = bfs(b, conAdj)
  const lockPos = terminalPos(b, LOCK_TERMINAL)
  const stand: Pos[] = []
  if (lockPos)
    for (const o of ORTHO) {
      const n: Pos = [lockPos[0] + o[0], lockPos[1] + o[1]]
      if (squareKind(b, n[0], n[1]) !== 'wall') stand.push(n)
    }
  const lockD = stand.length ? bfs(b, stand) : conD
  const lockToCon = stand.length ? Math.min(...stand.map((p) => conD.get(key(p)) ?? 999)) : 0
  const coreD = b.core.at ? bfs(b, [b.core.at]) : conD
  const objD = stage === 'carry' ? airD : stage === 'pickup' ? coreD : stage === 'unlock' ? lockD : conD
  const dObj = (p: Pos): number => objD.get(key(p)) ?? 999
  const lead = [...ws].sort((x, y) => dObj(x.at) - dObj(y.at))[0] as WardenUnit
  const conToAir = conAdj.length ? Math.min(...conAdj.map((p) => airD.get(key(p)) ?? 999)) : 20
  const remaining = stage === 'carry' ? (airD.get(key((carrier ?? lead).at)) ?? 0) : stage === 'pickup' ? (coreD.get(key(lead.at)) ?? 0) + (airD.get(key(b.core.at ?? lead.at)) ?? 0) : dObj(lead.at) + (stage === 'unlock' ? lockToCon : 0) + conToAir
  const roundsLeft = limit - b.round + 1
  const need = remaining / TUNING.pace + (stage === 'unlock' ? 1.5 : 0) + (stage === 'unlock' || stage === 'core' ? 1 : 0)
  const slack = roundsLeft - need
  const rushing = slack <= TUNING.rushSlack
  const spare = Math.max(0, b.cp - (rushing ? 0 : 2))

  const ok = (a: Action, emergency = false): boolean => {
    if (query.why(b, a) !== null) return false
    const c = query.cost(b, a)
    return c.affordable && (c.cp === 0 || emergency || c.cp <= spare)
  }
  const C: Cand[] = []
  const add = (a: Action, s: number, emergency = false): void => {
    if (ok(a, emergency)) C.push({ a, s })
  }
  const adjThreat = (t: { at: Pos }): boolean => ws.some((w) => manh(w.at, t.at) === 1)
  const gunner = (w: WardenUnit): boolean => w.role !== 'scorcher'
  const ready = (w: WardenUnit, need: number): boolean => gunner(w) && w.heat <= 2 && w.ap + spare >= need

  // ---- combat ---------------------------------------------------------------------------------------
  for (const w of ws) {
    if (gunner(w)) {
      for (const t of stalkers) {
        const adj = adjThreat(t)
        const d = manh(w.at, t.at)
        const fire: Action = { type: 'fire', unit: w.id, target: t.id }
        if (query.why(b, fire) === null) {
          const p = query.hitChance(b, w.id, t.id)
          const inWay = dObj(t.at) < dObj(w.at) && d <= 12
          const val = (adj ? 7 : 0) + (d <= 4 ? 3 : inWay ? 3 : d <= 8 ? 1.5 : rushing ? 0 : 0.3)
          const pen = !adj && w.heat >= 2 ? (inWay ? 0.3 : 0.8) * (w.heat - 1) : 0
          const s = 1.3 * p * val - pen
          if (s > 0.5) add(fire, s + (adj ? 3 : 0), adj)
        }
        const mel: Action = { type: 'melee', unit: w.id, target: t.id }
        if (query.why(b, mel) === null) {
          const o = query.meleeOdds(b, w.id, t.id)
          const ev = 7 * o.attackerWins - (w.breached ? 14 : 7) * o.defenderWins
          if (ev > 0.3) add(mel, ev + 2 + (adj ? 3 : 0), true)
        }
      }
      // vent a hot repeater when there is something to shoot at
      const near = stalkers.some((t) => manh(t.at, w.at) <= 10)
      if (w.heat >= 3 && near) add({ type: 'vent', unit: w.id }, 2.4, true)
      else if (w.heat >= 2 && stalkers.some((t) => manh(t.at, w.at) <= 6)) add({ type: 'vent', unit: w.id }, 1.8)
      else if (w.heat >= 1 && !rushing && slack > 3) add({ type: 'vent', unit: w.id }, 0.4 + 0.2 * w.heat)
    } else if (w.charges > 0) {
      let best: { a: Action; s: number; adj: boolean } | null = null
      const r = 6
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > r || (dx === 0 && dy === 0)) continue
          const at: Pos = [w.at[0] + dx, w.at[1] + dy]
          if (!contacts.some((e) => manh(e.at, at) <= 1)) continue
          const a: Action = { type: 'scorch', unit: w.id, at }
          if (query.why(b, a) !== null) continue
          let benefit = 0
          let adj = false
          for (const p of query.burst(b, w.id, at)) {
            if (b.burn.some((x) => eq(x, p))) continue
            const u = b.units.find((x) => (x.kind !== 'warden' || x.alive) && eq(x.at, p))
            if (!u) continue
            if (u.kind === 'warden') benefit -= (u.breached ? 10 : 5) * (5 / 6)
            else {
              benefit += (u.kind === 'stalker' ? 3 : 2.2) * (5 / 6)
              if (u.kind === 'stalker' && adjThreat(u)) adj = true
            }
          }
          const s = benefit + (adj ? 2 : 0)
          if (benefit >= (adj ? 1.5 : 2.5) && (!best || s > best.s)) best = { a, s, adj }
        }
      if (best) add(best.a, best.adj ? best.s + 1 : best.s * 0.6, true)
    }
    // turn to face an adjacent contact that is not ahead
    for (const t of stalkers) {
      if (manh(t.at, w.at) !== 1) continue
      const want = facingToward(w.at, t.at)
      if (want === w.facing) continue
      const f = LEFT[w.facing] === want ? LEFT[w.facing] : RIGHT[w.facing]
      add({ type: 'turn', unit: w.id, facing: f }, 6.5, true)
    }
  }

  // ---- look round the corner: bring unseen contacts into sight when the guns are ready ------------------
  const unseen = contacts.filter((c) => !query.isSeen(b, c.at))
  if (TUNING.reveal && unseen.length) {
    for (const w of ws) {
      if (w.watch || (carrier && w.id === carrier.id)) continue
      const near = unseen.filter((c) => c.kind === 'ping' && manh(c.at, w.at) <= 8)
      if (near.length === 0) continue
      const others = ws.filter((o) => o.id !== w.id && ready(o, 1)).length + (ready(w, 2) ? 1 : 0) + (ws.some((o) => o.role === 'scorcher' && o.charges > 0 && o.ap >= 2) ? 1 : 0)
      if (others < 2) continue
      for (const f of [LEFT[w.facing], RIGHT[w.facing]]) {
        const hyp: Board = { ...b, units: b.units.map((u) => (u.id === w.id && u.kind === 'warden' ? { ...u, facing: f } : u)) }
        const n = near.filter((c) => query.isSeen(hyp, c.at)).length
        if (n > 0) add({ type: 'turn', unit: w.id, facing: f }, 1.8 + 0.6 * n)
      }
    }
  }

  // ---- goals ----------------------------------------------------------------------------------------
  const faceDown = (x: number, y: number, f: Facing): boolean => {
    const d = DELTA[f]
    return (objD.get(`${x + d[0]},${y + d[1]}`) ?? 999) < (objD.get(`${x},${y}`) ?? 999)
  }
  // how far into the airlock room a square is (1 at the door side): escorts go deep so the carrier can follow them in
  const depth = new Map<string, number>()
  {
    const q: Pos[] = []
    for (const k of airD.keys()) {
      if (airD.get(k) !== 0) continue
      const [x, y] = k.split(',').map(Number) as [number, number]
      if (ORTHO.some((o) => squareKind(b, x + o[0], y + o[1]) !== 'wall' && airD.get(`${x + o[0]},${y + o[1]}`) !== 0)) {
        depth.set(k, 1)
        q.push([x, y])
      }
    }
    for (let i = 0; i < q.length; i++) {
      const p = q[i] as Pos
      for (const o of ORTHO) {
        const n: Pos = [p[0] + o[0], p[1] + o[1]]
        if (airD.get(key(n)) === 0 && !depth.has(key(n))) {
          depth.set(key(n), (depth.get(key(p)) as number) + 1)
          q.push(n)
        }
      }
    }
  }
  const goals = new Map<string, { goal: GoalFn; op: 'terminal' | 'core' | null }>()
  const byDist = [...ws].sort((x, y) => dObj(x.at) - dObj(y.at))
  let operator: WardenUnit | null = null
  const tech = ws.find((w) => w.role === 'tech')
  if (stage === 'flanks') {
    const t = terminalPos(b, FLANK_TERMINAL)
    if (t) {
      let bc = Infinity
      for (const w of ws) {
        const p = planWarden(b, w, adjacentGoal(t, b))
        const c = p ? p.cost - (w.role === 'tech' ? 8 : 0) : Infinity
        if (c < bc) {
          bc = c
          operator = w
        }
      }
      if (operator) goals.set(operator.id, { goal: adjacentGoal(t, b), op: 'terminal' })
    }
  } else if (stage === 'unlock') {
    const t = terminalPos(b, LOCK_TERMINAL)
    if (t) {
      operator = byDist[0] ?? null
      if (operator) goals.set(operator.id, { goal: adjacentGoal(t, b), op: 'terminal' })
    }
  } else if (stage === 'core' && conPos) {
    let bc = Infinity
    for (const w of ws) {
      const p = planWarden(b, w, adjacentGoal(conPos, b))
      const c = p ? p.cost - (tech && w.id === tech.id ? 0 : 0) : Infinity
      if (c < bc) {
        bc = c
        operator = w
      }
    }
    if (operator) goals.set(operator.id, { goal: adjacentGoal(conPos, b), op: 'core' })
  } else if (stage === 'carry' && carrier) {
    operator = carrier
    goals.set(carrier.id, { goal: (x, y) => airD.get(`${x},${y}`) === 0, op: null })
  } else if (stage === 'pickup' && b.core.at) {
    const at = b.core.at
    operator = byDist[0] ?? null
    if (operator) goals.set(operator.id, { goal: (x, y) => x === at[0] && y === at[1], op: null })
  }
  ws.filter((w) => !operator || w.id !== operator.id).forEach((w, i) => {
    let g: GoalFn
    if (stage === 'flanks') g = slotGoal(STAGING[i % STAGING.length] as [number, number, Facing])
    else if ((stage === 'unlock' || stage === 'core') && TUNING.arms) g = slotGoal(ARMS[i % ARMS.length] as [number, number, Facing])
    else if (stage === 'unlock' || stage === 'core') {
      const lim = stage === 'unlock' ? 1 + i : 2 + 2 * i
      g = (x, y, f) => (objD.get(`${x},${y}`) ?? 999) <= lim && faceDown(x, y, f)
    } else if (stage === 'carry') {
      g = (x, y) => (objD.get(`${x},${y}`) ?? 999) === 0 && (depth.get(`${x},${y}`) ?? 0) >= 3 && !ws.some((o) => o.id !== w.id && o.at[0] === x && o.at[1] === y)
    } else g = (x, y, f) => (objD.get(`${x},${y}`) ?? 999) <= 3 && faceDown(x, y, f)
    goals.set(w.id, { goal: g, op: null })
  })

  // ---- rear guard -----------------------------------------------------------------------------------
  const rear = [...ws].filter((w) => !carrier || w.id !== carrier.id).sort((x, y) => dObj(y.at) - dObj(x.at))[0]
  let guarding: WardenUnit | null = null
  if (TUNING.guard && rear && ws.length > 2 && !rushing) {
    const behind = contacts.filter((c) => dObj(c.at) > dObj(rear.at) && manh(c.at, rear.at) <= 6)
    const gap = Math.min(...ws.filter((o) => o.id !== rear.id).map((o) => manh(o.at, rear.at)))
    if (behind.length && gap <= 3 && gunner(rear) && (!carrier || dObj(rear.at) >= dObj(carrier.at))) {
      guarding = rear
      const c = behind.sort((x, y) => manh(x.at, rear.at) - manh(y.at, rear.at))[0] as { at: Pos }
      const want = facingToward(rear.at, c.at)
      if (rear.facing !== want && !rear.watch) {
        const f = LEFT[rear.facing] === want ? LEFT[rear.facing] : RIGHT[rear.facing]
        add({ type: 'turn', unit: rear.id, facing: f }, 2.6)
      } else if (!rear.watch && rear.heat <= 2) add({ type: 'watch', unit: rear.id }, 2.5)
    }
  }

  // ---- movement and jobs ----------------------------------------------------------------------------
  debug.why = {}
  const seenNear = (p: Pos, d: number): boolean => stalkers.some((t) => manh(t.at, p) <= d)
  for (const w of ws) {
    if (w.watch || (guarding && guarding.id === w.id)) continue
    const g = goals.get(w.id)
    if (!g) {
      debug.why[w.id] = 'no goal'
      continue
    }
    // Molt units block the plan; walk the unblocked route anyway so the guns can clear it
    const p = planWarden(b, w, g.goal) ?? planWarden({ ...b, units: b.units.filter((u) => u.kind === 'warden') }, w, g.goal)
    if (!p) {
      debug.why[w.id] = 'no plan'
      continue
    }
    debug.why[w.id] = `plan ${p.cost} ${JSON.stringify(p.action)}`
    if (p.cost === 0) {
      if (g.op === 'core') add({ type: 'takeCore', unit: w.id }, 20, true)
      else if (g.op === 'terminal') {
        const opts = query.terminalOps(b, w.id).filter((o) => o.available && (stage === 'flanks' ? o.op === 'seal' && o.door && FLANK_DOORS.some((d) => eq(d, o.door as Pos)) : o.op === 'unseal' && o.door && eq(o.door, ARCHIVE_DOOR)))
        const o = opts[0]
        if (o && o.door) add({ type: 'terminal', unit: w.id, terminal: o.terminal, op: o.op, door: o.door }, 15, true)
      }
      continue
    }
    if (!p.action) continue
    // the carrier waits while a contact is close, unless the clock says go
    if (TUNING.carrierWait && carrier && w.id === carrier.id && !rushing && ws.length > 1 && seenNear(w.at, 5) && ws.some((o) => o.id !== w.id && dObj(o.at) < dObj(w.at) && dObj(o.at) >= dObj(w.at) - 2)) continue
    // keep the file together: the point does not outrun the main body
    const sortedD = byDist.map((x) => dObj(x.at))
    const ref = sortedD[1] as number
    if (TUNING.cohesion && stage !== 'flanks' && ws.length > 2 && w.id === lead.id && dObj(w.at) < ref - (rushing ? 8 : TUNING.maxGap) && p.cost > 0 && !ws.some((o) => o.id !== w.id && manh(o.at, w.at) <= 2 && dObj(o.at) > dObj(w.at))) continue
    if (TUNING.cohesion && stage === 'carry' && carrier && w.id !== carrier.id && p.cost > 0 && dObj(w.at) < dObj(carrier.at) - (rushing ? 9 : TUNING.escortGap) && !ws.some((o) => o.id !== w.id && manh(o.at, w.at) <= 2 && dObj(o.at) > dObj(w.at))) continue
    const lag = dObj(w.at) - dObj(lead.at)
    const sc = 2 + (rushing ? 0.5 : 0) - 0.05 * lag
    if (ok(p.action, rushing)) add(p.action, sc, rushing)
    else {
      // a friend stands in the way: route round it (or let it be) instead of waiting
      const q = planWarden(b, w, g.goal, true)
      if (q && q.action) add(q.action, sc - 0.3, rushing)
    }
  }

  // ---- watch with what is left, when the clock allows ---------------------------------------------------
  if (!rushing) {
    for (const w of ws) {
      if (!gunner(w) || w.watch || w.ap < 2 || w.heat > 2) continue
      if (carrier && w.id === carrier.id) continue
      if (contacts.some((c) => manh(c.at, w.at) <= 12)) add({ type: 'watch', unit: w.id }, TUNING.watchScore)
    }
  }

  debug.cands = C
  let best: Cand | null = null
  for (const c of C) if (!best || c.s > best.s) best = c
  return best && best.s >= 0.3 ? best.a : END
}
