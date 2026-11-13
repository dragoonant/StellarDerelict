/**
 * The phase plan (spec 40): grid caches, the threat and exposure maps, the squad's route, and the Dijkstra fields the
 * policies score with. Everything here is a pure function of a Molt-seat board.
 */
import { rules } from '../../data'
import { query } from '../../engine'
import type { Board, Facing, Pos, StalkerUnit, ViewUnit, WardenUnit } from '../../engine'
import { ahead, geoOf, inArc, makeSight, ORTHO, type Geo, type Sight } from '../../engine/grid'

export const RISKW = 4
/** cost of losing a stalker in a fight */
export const SV = 3
/** cost of losing a stalker to fire on the way or while it waits (it is worth more alive than one fight shows) */
export const SV_STAY = 6
/** value of one step of progress toward a strike square */
export const GW = 0.5

export const KIND_WALL = 0
export const KIND_OPEN = 1
export const KIND_CLOSED = 2
export const KIND_SEALED = 3

const FACING_OF: Record<string, Facing> = { '0,-1': 'N', '1,0': 'E', '0,1': 'S', '-1,0': 'W' }

interface GeoTables {
  W: number
  H: number
  N: number
  nbr: Int32Array
}
const geoTables = new WeakMap<Geo, GeoTables>()
function tablesOf(g: Geo): GeoTables {
  let t = geoTables.get(g)
  if (t) return t
  const W = g.w
  const H = g.h
  const N = W * H
  const nbr = new Int32Array(N * 4).fill(-1)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      ORTHO.forEach((o, k) => {
        const nx = x + o[0]
        const ny = y + o[1]
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) nbr[(y * W + x) * 4 + k] = ny * W + nx
      })
  t = { W, H, N, nbr }
  geoTables.set(g, t)
  return t
}

export interface RouteStep {
  idx: number
  facing: Facing
}

export interface StaticCtx {
  g: Geo
  W: number
  H: number
  N: number
  nbr: Int32Array
  /** 0 wall, 1 open or floor, 2 closed unsealed door, 3 closed sealed door */
  kind: Uint8Array
  wardens: WardenUnit[]
  carrier: WardenUnit | null
  archiveSealed: boolean
  route: RouteStep[]
  /** BFS distance to the first route squares (doors passable, sealed excluded); 9999 when cut off */
  routeDist: Int16Array
  /** BFS distance to the objective (all doors passable); 9999 when cut off */
  toObj: Int16Array
  /** the squad's objective squares */
  objective: number[]
  /** is the core out of the console */
  coreTaken: boolean
  watchKill(idx: number): number
  exposure(idx: number): number
  routeSeen(idx: number): number
  /** line of sight from some Warden (ignoring arc), within 12 */
  wardenLos(idx: number): boolean
  /** a living Warden stands next to this square */
  nextToWarden(idx: number): boolean
  scorchLos(idx: number): boolean
}

export const idxOf = (S: { W: number }, p: Pos): number => p[1] * S.W + p[0]
export const posOf = (S: { W: number }, i: number): Pos => [i % S.W, Math.floor(i / S.W)]
export const mdist = (S: { W: number }, a: number, b: number): number =>
  Math.abs((a % S.W) - (b % S.W)) + Math.abs(Math.floor(a / S.W) - Math.floor(b / S.W))

function signature(b: Board): string {
  let s = `${b.mission}|${b.round}|${b.phase}|${b.heldCp}|${b.core.where}:${b.core.at?.join(',') ?? ''}:${b.core.carrier ?? ''}|`
  for (const u of b.units)
    if (u.kind === 'warden') s += `${u.id},${u.at[0]},${u.at[1]},${u.facing},${u.alive ? 1 : 0},${u.watch ? 1 : 0},${u.heat},${u.breached ? 1 : 0},${u.charges};`
  s += `|${JSON.stringify(b.doors)}|${b.burn.length}|${b.lit.join(',')}|${b.purgedDucts.length}`
  return s
}

let cached: { sig: string; ctx: StaticCtx }[] = []

export function staticOf(b: Board): StaticCtx {
  const sig = signature(b)
  const hit = cached.find((c) => c.sig === sig)
  if (hit) return hit.ctx
  const ctx = buildStatic(b)
  cached = [{ sig, ctx }, ...cached].slice(0, 3)
  return ctx
}

function hitP(b: Board, S: { W: number }, w: WardenUnit, sq: number): number {
  const d = mdist(S, idxOf(S, w.at), sq)
  const r = rules.repeater
  const p = posOf(S, sq)
  const need = (d <= r.closeRange ? r.closeTarget : r.farTarget) - (query.isLit(b, p) ? rules.litBonus : 0)
  const one = Math.max(0, Math.min(6, 7 - need)) / 6
  return 1 - Math.pow(1 - one, r.dice)
}

function buildStatic(b: Board): StaticCtx {
  const g = geoOf(b.mission)
  const { W, H, N, nbr } = tablesOf(g)
  const kind = new Uint8Array(N)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = g.terrain[y]?.[x]
      let k = KIND_OPEN
      if (t === 'wall' || t === 'terminal' || t === 'console') k = KIND_WALL
      else if (t === 'door' || t === 'bulkhead') {
        const d = b.doors[`${x},${y}`]
        k = d?.open ? KIND_OPEN : d?.sealed ? KIND_SEALED : KIND_CLOSED
      }
      kind[y * W + x] = k
    }
  const wardens = b.units.filter((u): u is WardenUnit => u.kind === 'warden' && u.alive)
  const carrier = b.core.carrier ? (wardens.find((w) => w.id === b.core.carrier) ?? null) : null
  const coreTaken = b.core.where !== 'console'
  const archiveSealed = !coreTaken && Object.values(b.doors).some((d) => d.sealed)

  // objective squares
  const objective: number[] = []
  if (b.core.where === 'carried') for (let i = 0; i < N; i++) if (g.airlocks.has(`${i % W},${Math.floor(i / W)}`)) objective.push(i)
  if (b.core.where === 'loose' && b.core.at) objective.push(b.core.at[1] * W + b.core.at[0])
  if (b.core.where === 'console' && g.consolePos) {
    const c = g.consolePos[1] * W + g.consolePos[0]
    for (let k = 0; k < 4; k++) {
      const n = nbr[c * 4 + k] as number
      if (n >= 0 && kind[n] !== KIND_WALL) objective.push(n)
    }
  }
  const toObj = new Int16Array(N).fill(9999)
  const q: number[] = []
  for (const o of objective) {
    toObj[o] = 0
    q.push(o)
  }
  for (let i = 0; i < q.length; i++) {
    const p = q[i] as number
    for (let k = 0; k < 4; k++) {
      const n = nbr[p * 4 + k] as number
      if (n < 0 || kind[n] === KIND_WALL || (toObj[n] as number) !== 9999) continue
      toObj[n] = (toObj[p] as number) + 1
      q.push(n)
    }
  }
  // the squad's route: from its lead Warden down the toObj gradient
  let lead: WardenUnit | null = carrier
  if (!lead) {
    let bd = 99999
    for (const w of wardens) {
      const d = toObj[w.at[1] * W + w.at[0]] as number
      if (d < bd) {
        bd = d
        lead = w
      }
    }
  }
  const route: RouteStep[] = []
  if (lead) {
    let cur = lead.at[1] * W + lead.at[0]
    for (let n = 0; n < 60 && (toObj[cur] as number) > 0 && (toObj[cur] as number) < 9999; n++) {
      let best = -1
      let bk = 0
      for (let k = 0; k < 4; k++) {
        const nb = nbr[cur * 4 + k] as number
        if (nb >= 0 && (toObj[nb] as number) < (toObj[cur] as number) && (best < 0 || (toObj[nb] as number) < (toObj[best] as number))) {
          best = nb
          bk = k
        }
      }
      if (best < 0) break
      const o = ORTHO[bk] as Pos
      route.push({ idx: cur, facing: FACING_OF[`${o[0]},${o[1]}`] as Facing })
      cur = best
    }
    if (route.length === 0) route.push({ idx: cur, facing: lead.facing })
  }
  const routeDist = new Int16Array(N).fill(9999)
  const rq: number[] = []
  route.slice(0, 16).forEach((r) => {
    routeDist[r.idx] = 0
    rq.push(r.idx)
  })
  for (let i = 0; i < rq.length; i++) {
    const p = rq[i] as number
    for (let k = 0; k < 4; k++) {
      const n = nbr[p * 4 + k] as number
      if (n < 0 || kind[n] === KIND_WALL || kind[n] === KIND_SEALED || (routeDist[n] as number) !== 9999) continue
      routeDist[n] = (routeDist[p] as number) + 1
      rq.push(n)
    }
  }

  // lazily filled maps
  const sightW: Sight = makeSight({ ...b, units: wardens }, g)
  let sightR: Sight | null = null
  const routeSight = (): Sight => {
    if (sightR) return sightR
    const doors = { ...b.doors }
    for (const r of route) {
      const k = `${r.idx % W},${Math.floor(r.idx / W)}`
      const d = doors[k]
      if (d && !d.open) doors[k] = { ...d, open: true }
    }
    sightR = makeSight({ ...b, units: [], doors }, g)
    return sightR
  }
  const wk = new Float32Array(N).fill(Number.NaN)
  const ex = new Float32Array(N).fill(Number.NaN)
  const rs = new Float32Array(N).fill(Number.NaN)
  const wl = new Int8Array(N).fill(-1)
  const sl = new Int8Array(N).fill(-1)
  const watchers = wardens.filter((w) => w.watch && (w.heat < rules.repeater.heatLock || b.heldCp > 0))
  const S = { W }
  const self: StaticCtx = {
    g,
    W,
    H,
    N,
    nbr,
    kind,
    wardens,
    carrier,
    archiveSealed,
    route,
    routeDist,
    toObj,
    objective,
    coreTaken,
    watchKill(idx) {
      const c = wk[idx] as number
      if (!Number.isNaN(c)) return c
      let surv = 1
      const sq = posOf(S, idx)
      for (const w of watchers) {
        if (mdist(S, idxOf(S, w.at), idx) > rules.repeater.maxRange) continue
        if (!sightW.sees(w, sq)) continue
        surv *= 1 - hitP(b, S, w, idx)
      }
      const v = 1 - surv
      wk[idx] = v
      return v
    },
    exposure(idx) {
      const c = ex[idx] as number
      if (!Number.isNaN(c)) return c
      let surv = 1
      const sq = posOf(S, idx)
      for (const w of wardens) {
        const d = mdist(S, idxOf(S, w.at), idx)
        if (d > rules.repeater.maxRange) continue
        if (d > 1 && !sightW.los(w.at, sq)) continue
        const scorcher = w.role === 'scorcher'
        if (scorcher) {
          if (d <= rules.scorcher.range && w.charges > 0) surv *= 0.35
          continue
        }
        const shots = inArc(w.at, w.facing, sq) ? 2 : 1.5
        surv *= Math.pow(1 - hitP(b, S, w, idx), shots)
      }
      const v = Math.min(0.97, 1 - surv)
      ex[idx] = v
      return v
    },
    routeSeen(idx) {
      const c = rs[idx] as number
      if (!Number.isNaN(c)) return c
      const sq = posOf(S, idx)
      const sr = routeSight()
      let n = 0
      route.slice(0, 10).forEach((r, i) => {
        const p = posOf(S, r.idx)
        if (r.idx === idx || mdist(S, r.idx, idx) > rules.repeater.maxRange) return
        if (inArc(p, r.facing, sq) && sr.los(p, sq)) n += i < 6 ? 1 : 0.5
      })
      rs[idx] = n
      return n
    },
    wardenLos(idx) {
      const c = wl[idx] as number
      if (c >= 0) return c === 1
      const sq = posOf(S, idx)
      let v = false
      for (const w of wardens) {
        const d = mdist(S, idxOf(S, w.at), idx)
        if (d <= 8 && (d <= 1 || sightW.los(w.at, sq))) {
          v = true
          break
        }
      }
      wl[idx] = v ? 1 : 0
      return v
    },
    nextToWarden(idx) {
      for (const w of wardens) if (mdist(S, idxOf(S, w.at), idx) === 1) return true
      return false
    },
    scorchLos(idx) {
      const c = sl[idx] as number
      if (c >= 0) return c === 1
      const sq = posOf(S, idx)
      let v = false
      for (const w of wardens)
        if (w.role === 'scorcher' && w.charges > 0) {
          const d = mdist(S, idxOf(S, w.at), idx)
          if (d <= rules.scorcher.range + 1 && (d <= 1 || sightW.los(w.at, sq))) v = true
        }
      sl[idx] = v ? 1 : 0
      return v
    },
  }
  return self
}

// ---------------------------------------------------------------------------------------------------------------
// Per-decision context
// ---------------------------------------------------------------------------------------------------------------

export interface Dyn {
  b: Board
  S: StaticCtx
  /** 0 free, 1 Warden, 2 stalker, 3 ping */
  occ: Uint8Array
  burn: Uint8Array
  sight: Sight
  seenMemo: Int8Array
  stalkers: StalkerUnit[]
  pings: Extract<ViewUnit, { kind: 'ping' }>[]
  isSeen(idx: number): boolean
}

export function dynOf(b: Board): Dyn {
  const S = staticOf(b)
  const occ = new Uint8Array(S.N)
  const burn = new Uint8Array(S.N)
  const stalkers: StalkerUnit[] = []
  const pings: Dyn['pings'] = []
  for (const u of b.units) {
    if (u.kind === 'warden') {
      if (u.alive) occ[u.at[1] * S.W + u.at[0]] = 1
    } else {
      occ[u.at[1] * S.W + u.at[0]] = u.kind === 'stalker' ? 2 : 3
      if (u.kind === 'stalker') stalkers.push(u)
      else pings.push(u)
    }
  }
  for (const p of b.burn) burn[p[1] * S.W + p[0]] = 1
  const sight = makeSight(b, S.g)
  const seenMemo = new Int8Array(S.N).fill(-1)
  return {
    b,
    S,
    occ,
    burn,
    sight,
    seenMemo,
    stalkers,
    pings,
    isSeen(idx) {
      const c = seenMemo[idx] as number
      if (c >= 0) return c === 1
      const v = sight.seen(posOf(S, idx))
      seenMemo[idx] = v ? 1 : 0
      return v
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Dijkstra
// ---------------------------------------------------------------------------------------------------------------

class Heap {
  keys: number[] = []
  vals: number[] = []
  get size(): number {
    return this.keys.length
  }
  push(k: number, v: number): void {
    const keys = this.keys
    const vals = this.vals
    let i = keys.length
    keys.push(k)
    vals.push(v)
    while (i > 0) {
      const p = (i - 1) >> 1
      if ((keys[p] as number) <= k) break
      keys[i] = keys[p] as number
      vals[i] = vals[p] as number
      i = p
    }
    keys[i] = k
    vals[i] = v
  }
  pop(): number {
    const keys = this.keys
    const vals = this.vals
    const top = vals[0] as number
    const lk = keys.pop() as number
    const lv = vals.pop() as number
    const n = keys.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && (keys[c + 1] as number) < (keys[c] as number)) c++
        if ((keys[c] as number) >= lk) break
        keys[i] = keys[c] as number
        vals[i] = vals[c] as number
        i = c
      }
      keys[i] = lk
      vals[i] = lv
    }
    return top
  }
}

export const HOW_MOVE = 1
export const HOW_DOOR = 2
export const HOW_TEAR = 3

export interface Field {
  from: number
  /** weighted cost (AP plus risk), Infinity when unreached */
  cost: Float64Array
  /** AP spent on the cheapest path */
  ap: Float64Array
  /** probability of surviving watch fire along the path */
  surv: Float64Array
  prev: Int32Array
  how: Uint8Array
}

export interface FieldOpts {
  /** AP budget: nodes costing more are not reached */
  maxAp: number
  ping: boolean
  /** weight of watch fire in the path cost (1 = full) */
  cover?: number
  /** squares a ping may not enter */
  avoidSeen?: boolean
  /** stalker AP of a hypothetical unit standing on its own square (reveal planning) */
  ignoreOccFrom?: boolean
}

/** Cheapest walks for one Molt unit: floor 1 AP, closed door 2 (open, step), sealed door ~4 (expected tear, step; stalkers only). */
export function forward(d: Dyn, from: number, o: FieldOpts): Field {
  const S = d.S
  const N = S.N
  const cost = new Float64Array(N).fill(Infinity)
  const ap = new Float64Array(N).fill(Infinity)
  const surv = new Float64Array(N).fill(1)
  const prev = new Int32Array(N).fill(-1)
  const how = new Uint8Array(N)
  cost[from] = 0
  ap[from] = 0
  const heap = new Heap()
  heap.push(0, from)
  const done = new Uint8Array(N)
  while (heap.size) {
    const p = heap.pop()
    if (done[p]) continue
    done[p] = 1
    const cp = cost[p] as number
    const ap0 = ap[p] as number
    const s0 = surv[p] as number
    for (let k = 0; k < 4; k++) {
      const n = S.nbr[p * 4 + k] as number
      if (n < 0 || done[n]) continue
      const kd = S.kind[n] as number
      if (kd === KIND_WALL) continue
      if (d.occ[n] && !(o.ignoreOccFrom && n === from)) continue
      if (d.burn[n]) continue
      if (o.ping && (kd === KIND_SEALED || (o.avoidSeen && d.isSeen(n)))) continue
      let stepAp = 1
      let h = HOW_MOVE
      let risk = o.ping ? 0 : S.watchKill(n)
      if (kd === KIND_CLOSED) {
        stepAp = 2
        h = HOW_DOOR
        if (!o.ping) risk += S.watchKill(p)
      } else if (kd === KIND_SEALED) {
        stepAp = 4
        h = HOW_TEAR
        risk += 3 * S.watchKill(p)
      }
      const nap = ap0 + stepAp
      if (nap > o.maxAp + (kd === KIND_SEALED ? 3 : 0)) continue
      const nc = cp + stepAp + RISKW * (o.cover ?? 1) * risk
      if (nc < (cost[n] as number)) {
        cost[n] = nc
        ap[n] = nap
        surv[n] = s0 * (1 - Math.min(0.97, risk))
        prev[n] = p
        how[n] = h
        heap.push(nc, n)
      }
    }
  }
  return { from, cost, ap, surv, prev, how }
}

/** The first square on the path to `to`, and how to get into it. */
export function firstHop(f: Field, to: number): { next: number; how: number } | null {
  if (!Number.isFinite(f.cost[to] as number) || to === f.from) return null
  let cur = to
  for (let i = 0; i < 1000; i++) {
    const p = f.prev[cur] as number
    if (p < 0) return null
    if (p === f.from) return { next: cur, how: f.how[cur] as number }
    cur = p
  }
  return null
}

/**
 * Goal field for stalkers: multi-source Dijkstra from `seeds` (square, starting cost, possibly negative) outward over the
 * squares a stalker may cross. Edge cost 1 plus the watch risk of the square entered, doors extra.
 */
export function goalField(d: Dyn, seeds: { idx: number; start: number }[], cover = 1): Float64Array {
  const S = d.S
  const dist = new Float64Array(S.N).fill(Infinity)
  const heap = new Heap()
  const OFFSET = 100
  for (const s of seeds) {
    if ((dist[s.idx] as number) > s.start) {
      dist[s.idx] = s.start
      heap.push(s.start + OFFSET, s.idx)
    }
  }
  const done = new Uint8Array(S.N)
  while (heap.size) {
    const p = heap.pop()
    if (done[p]) continue
    done[p] = 1
    const cp = dist[p] as number
    for (let k = 0; k < 4; k++) {
      const n = S.nbr[p * 4 + k] as number
      if (n < 0 || done[n]) continue
      const kd = S.kind[n] as number
      if (kd === KIND_WALL) continue
      let c = 1 + RISKW * cover * S.watchKill(p)
      if (kd === KIND_CLOSED) c += 1
      else if (kd === KIND_SEALED) c += 3.5
      if (d.burn[n]) c += 1.5
      const nc = cp + c
      if (nc < (dist[n] as number)) {
        dist[n] = nc
        heap.push(nc + OFFSET, n)
      }
    }
  }
  return dist
}

export function frontOf(w: WardenUnit, S: { W: number }): number {
  const a = ahead(w)
  return a[1] * S.W + a[0]
}
