// Engine event -> sound ids. Sounds are driven by the director's presented events only (spec 60), so they stay in step with
// the animation at every speed. The table is exhaustive over Event['type']: a new event type is a compile error until it
// is mapped or listed 'silent'. Pure: no DOM, no Web Audio.
import type { Event, View } from '../../engine'
import { assets } from '../../data'

type Rule<K extends Event['type']> = 'silent' | ((ev: Extract<Event, { type: K }>, view: View | null) => string[])
type Table = { [K in Event['type']]: Rule<K> }

const unitOf = (view: View | null, id: string) => view?.units.find((u) => u.id === id)

export const EVENT_SOUNDS: Table = {
  phaseStarted: (ev) => [ev.seat === 'warden' ? 'phase-warden' : 'phase-molt'],
  moved: (ev, v) => {
    const u = unitOf(v, ev.unit)
    return u?.kind === 'warden' ? ['footstep'] : u?.kind === 'stalker' ? ['skitter'] : u?.kind === 'ping' ? ['ping'] : []
  },
  turned: 'silent',
  doorChanged: (ev) => (ev.state === 'open' ? ['door-open'] : ev.state === 'closed' ? ['door-close'] : ev.state === 'sealed' ? ['door-seal'] : []),
  fired: (ev) => (ev.hit ? ['repeater-shot', 'repeater-hit'] : ['repeater-shot']),
  locked: () => ['repeater-lock'],
  cpSpent: 'silent',
  vented: () => ['vent'],
  watchSet: () => ['watch-set'],
  watchEnded: 'silent',
  scorched: () => ['scorch'],
  burnCleared: 'silent',
  meleeFought: (ev, v) => {
    const a = unitOf(v, ev.attacker)
    return a?.kind === 'warden' && a.role === 'sergeant' && ev.outcome === 'attacker' ? ['maul'] : ['melee-hit']
  },
  breached: () => ['breach'],
  destroyed: (ev) => (ev.kind === 'warden' ? ['warden-down'] : ev.kind === 'stalker' ? ['stalker-death'] : []),
  pingArrived: () => ['ping', 'duct-rattle'],
  pingHeld: 'silent',
  revealed: () => ['stalker-screech'],
  tearRolled: () => ['door-tear'],
  terminalUsed: (ev) => (ev.op === 'unseal' ? ['terminal', 'door-unseal'] : ['terminal']),
  lit: () => ['lights-on'],
  purged: () => ['purge'],
  coreTaken: () => ['core-taken'],
  coreDropped: () => ['core-dropped'],
  corePicked: () => ['core-picked'],
  alarm: () => ['alarm'],
  roundEnded: 'silent',
  gameOver: (ev) => [ev.winner === 'warden' ? 'sting-win' : 'sting-loss'],
}

/** Ids played from outside the event stream. */
export const UI_SOUNDS = { select: 'ui-select', arm: 'ui-arm', deny: 'ui-deny', confirm: 'ui-confirm' } as const
export const TIMER_SOUND = 'timer-warn'
export const AMBIENCE = 'ambience'
/** The boarding clock ticks below this many seconds. */
export const TIMER_WARN_S = 15

export function silentEvents(): string[] {
  return Object.entries(EVENT_SOUNDS).filter(([, r]) => r === 'silent').map(([k]) => k)
}

/** Sound ids for one presented event; `view` is the presented view before the event was applied. */
export function soundsFor(ev: Event, view: View | null): string[] {
  const rule = EVENT_SOUNDS[ev.type] as Rule<typeof ev.type>
  if (rule === 'silent') return []
  return (rule as (e: Event, v: View | null) => string[])(ev, view)
}

// ------------------------------------------------------------------ voice lines
const VOICE_IDS = new Set(assets.voice.map((v) => v.id))
const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

function nearestWarden(view: View, at: [number, number]): string | null {
  let best: string | null = null
  let bd = Infinity
  for (const u of view.units) {
    if (u.kind !== 'warden' || !u.alive) continue
    const d = Math.max(Math.abs(u.at[0] - at[0]), Math.abs(u.at[1] - at[1]))
    if (d < bd) {
      bd = d
      best = u.id
    }
  }
  return best
}

/** The voice line (an id in the manifest) an event asks for, or null. The caller applies the rate limit. */
export function voiceFor(ev: Event, view: View | null): string | null {
  if (!view) return null
  const own = (id: string, key: string): string | null => {
    const u = unitOf(view, id)
    if (!u || u.kind !== 'warden' || !u.alive) return null
    const line = `${id}-${kebab(key)}`
    return VOICE_IDS.has(line) ? line : null
  }
  switch (ev.type) {
    case 'moved':
      return own(ev.unit, 'moved')
    case 'revealed': {
      const w = nearestWarden(view, ev.at as [number, number])
      return w ? own(w, 'revealed') : null
    }
    case 'locked':
      return own(ev.unit, 'locked')
    case 'breached':
      return view.core.carrier === ev.unit ? 'carrier-breached' : own(ev.unit, 'breached')
    case 'watchSet':
      return own(ev.unit, 'watchSet')
    case 'vented':
      return own(ev.unit, 'vented')
    case 'scorched':
      return own(ev.unit, 'scorched')
    case 'terminalUsed':
      return own(ev.unit, 'terminalUsed')
    case 'cpSpent':
      // the Sergeant's command-point line: the first time command points are spent in a phase (the director rate-limits it)
      return own('venn', 'cpSpent')
    case 'coreTaken':
      return 'carrier-core-taken'
    case 'coreDropped':
      return 'carrier-core-dropped'
    case 'corePicked':
      return 'carrier-core-picked'
    default:
      return null
  }
}

/** At Instant speed: at most one sound per event type per phase. */
export function dedupeInstant(events: Event[], phase: string): Event[] {
  const seen = new Set<string>()
  const out: Event[] = []
  let seat = phase
  for (const ev of events) {
    if (ev.type === 'phaseStarted') seat = ev.seat
    const key = `${ev.type}:${seat}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ev)
  }
  return out
}
