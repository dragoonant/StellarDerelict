// The director: plays engine events in order, keeping a presented-state cursor. The board shows `presented` (the state as of
// the last animated event); controls are disabled while `animating`; the bot waits for the queue to drain.
// Speed Normal / Fast / Instant scales every duration (instant shows the final state at once).
import type { Event, Pos, View, ViewUnit } from '../engine'
import { geoOf } from '../engine/grid'
import { getStore, setStore, type Fx, type Speed } from './store'

export const SPEED_FACTOR: Record<Speed, number> = { normal: 1, fast: 0.4, instant: 0 }

/** Real-time length of each beat at Normal speed, in ms. */
const BEAT_MS: Partial<Record<Event['type'], number>> = {
  phaseStarted: 350,
  moved: 260,
  turned: 170,
  doorChanged: 240,
  fired: 460,
  scorched: 560,
  meleeFought: 460,
  destroyed: 380,
  pingArrived: 320,
  revealed: 560,
  purged: 650,
  terminalUsed: 200,
  coreTaken: 300,
  gameOver: 500,
}

interface Job {
  events: Event[]
  final: View
}

let queue: Job[] = []
let running = false
let epoch = 0
let nextFx = 1
let waiters: (() => void)[] = []

export const directorBusy = (): boolean => running || queue.length > 0

export function whenDirectorIdle(): Promise<void> {
  if (!directorBusy()) return Promise.resolve()
  return new Promise((r) => waiters.push(r))
}

/** Drop everything queued (a new mission or a reopened save). */
export function resetDirector(): void {
  epoch++
  queue = []
  running = false
  setStore({ fx: [], animating: false })
  const w = waiters
  waiters = []
  w.forEach((r) => r())
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const key = (p: Pos): string => `${p[0]},${p[1]}`

function mapUnits(v: View, f: (u: ViewUnit) => ViewUnit | null): ViewUnit[] {
  const out: ViewUnit[] = []
  for (const u of v.units) {
    const r = f(u)
    if (r) out.push(r)
  }
  return out
}

/** Apply one event to a view, for presentation only. The real state replaces it when the job ends. */
export function patch(v: View, ev: Event): View {
  switch (ev.type) {
    case 'phaseStarted':
      return { ...v, phase: ev.seat, round: ev.round }
    case 'moved':
      return { ...v, units: mapUnits(v, (u) => (u.id === ev.unit ? { ...u, at: ev.to } : u)) }
    case 'turned':
      return { ...v, units: mapUnits(v, (u) => (u.id === ev.unit && u.kind === 'warden' ? { ...u, facing: ev.facing } : u)) }
    case 'doorChanged': {
      const d = v.doors[key(ev.door)]
      if (!d) return v
      const next = { ...d }
      if (ev.state === 'open') next.open = true
      else if (ev.state === 'closed') next.open = false
      else if (ev.state === 'sealed') {
        next.open = false
        next.sealed = true
      } else {
        next.open = true
        next.sealed = false
        next.torn = true
      }
      return { ...v, doors: { ...v.doors, [key(ev.door)]: next } }
    }
    case 'fired':
      return { ...v, units: mapUnits(v, (u) => (u.id === ev.unit && u.kind === 'warden' ? { ...u, heat: ev.heat } : u)) }
    case 'vented':
      return { ...v, units: mapUnits(v, (u) => (u.id === ev.unit && u.kind === 'warden' ? { ...u, heat: 0 } : u)) }
    case 'watchSet':
      return { ...v, units: mapUnits(v, (u) => (u.id === ev.unit && u.kind === 'warden' ? { ...u, watch: true } : u)) }
    case 'watchEnded':
      return { ...v, units: mapUnits(v, (u) => (u.id === ev.unit && u.kind === 'warden' ? { ...u, watch: false } : u)) }
    case 'scorched':
      return { ...v, burn: [...v.burn, ...ev.burst] }
    case 'burnCleared':
      return { ...v, burn: [] }
    case 'breached':
      return { ...v, units: mapUnits(v, (u) => (u.id === ev.unit && u.kind === 'warden' ? { ...u, breached: true } : u)) }
    case 'destroyed':
      return { ...v, units: mapUnits(v, (u) => (u.id !== ev.unit ? u : u.kind === 'warden' ? { ...u, alive: false } : null)) }
    case 'pingArrived':
      return { ...v, units: [...v.units, { id: ev.unit, kind: 'ping', at: ev.duct, ap: 0 }] }
    case 'revealed':
      return {
        ...v,
        units: [...mapUnits(v, (u) => (u.id === ev.ping ? null : u)), ...ev.units.map((s) => ({ id: s.id, kind: 'stalker' as const, at: s.at, ap: 0 }))],
      }
    case 'coreTaken':
      return { ...v, core: { where: 'carried', at: null, carrier: ev.unit } }
    case 'coreDropped':
      return { ...v, core: { where: 'loose', at: ev.at, carrier: null } }
    case 'corePicked':
      return { ...v, core: { where: 'carried', at: null, carrier: ev.unit } }
    case 'lit':
      return { ...v, lit: [...v.lit, ev.section] }
    case 'purged':
      return { ...v, purgedDucts: [...v.purgedDucts, ...ev.ducts] }
    default:
      return v
  }
}

function fxFor(ev: Event, before: View, f: number): Omit<Fx, 'id' | 'born'>[] {
  const pos = (id: string): Pos | undefined => before.units.find((u) => u.id === id)?.at
  const ms = (base: number): number => Math.max(60, base * f)
  switch (ev.type) {
    case 'fired': {
      const a = pos(ev.unit)
      const b = pos(ev.target)
      return a && b ? [{ kind: 'tracer', from: a, to: b, hit: ev.hit, ms: ms(420) }] : []
    }
    case 'scorched': {
      const a = pos(ev.unit)
      return [{ kind: 'burst', squares: ev.burst, from: a, ms: ms(560) }]
    }
    case 'meleeFought': {
      const a = pos(ev.attacker)
      const d = pos(ev.defender)
      return a && d ? [{ kind: 'lunge', unit: ev.attacker, from: a, to: d, ms: ms(400) }] : []
    }
    case 'revealed':
      return [{ kind: 'ring', to: ev.at, hit: true, ms: ms(520) }]
    case 'pingArrived':
      return [{ kind: 'ring', to: ev.duct, hit: false, ms: ms(420) }]
    case 'destroyed':
      return [{ kind: 'wreck', to: ev.at, flag: ev.kind, ms: ms(420) }]
    case 'purged': {
      const g = geoOf(before.mission)
      const sq: Pos[] = []
      for (const k of g.sectionSquares[ev.section] ?? []) sq.push(k.split(',').map(Number) as Pos)
      return [{ kind: 'purge', squares: sq, ms: ms(650) }]
    }
    case 'lit': {
      const g = geoOf(before.mission)
      const sq: Pos[] = []
      for (const k of g.sectionSquares[ev.section] ?? []) sq.push(k.split(',').map(Number) as Pos)
      return [{ kind: 'flash', squares: sq, ms: ms(500) }]
    }
    default:
      return []
  }
}

async function run(): Promise<void> {
  if (running) return
  running = true
  setStore({ animating: true })
  const mine = epoch
  while (queue.length > 0 && mine === epoch) {
    const job = queue.shift() as Job
    const f = SPEED_FACTOR[getStore().settings.speed]
    if (f > 0) {
      for (const ev of job.events) {
        if (mine !== epoch) return
        const before = getStore().presented
        if (!before) break
        const fxs = fxFor(ev, before, f)
        const now = performance.now()
        const withIds: Fx[] = fxs.map((x) => ({ ...x, id: nextFx++, born: now }))
        setStore((s) => ({ presented: patch(before, ev), fx: [...s.fx.filter((x) => now - x.born < x.ms + 50), ...withIds] }))
        const wait = (BEAT_MS[ev.type] ?? 0) * f
        if (wait > 0) await sleep(wait)
      }
    }
    if (mine !== epoch) return
    setStore({ presented: job.final })
  }
  if (mine !== epoch) return
  running = false
  setStore({ animating: false })
  const w = waiters
  waiters = []
  w.forEach((r) => r())
}

/** Queue the events of one accepted action; `final` is the Warden view of the state after them. */
export function present(events: Event[], final: View): void {
  queue.push({ events, final })
  if (SPEED_FACTOR[getStore().settings.speed] === 0 && !running) {
    queue = []
    setStore({ presented: final })
    return
  }
  void run()
}
