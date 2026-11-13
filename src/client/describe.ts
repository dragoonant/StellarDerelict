// Radio-style log lines and inspector text, in our own words. Every number comes from an event or from the engine.
import { roles, rules } from '../data'
import { geoOf } from '../engine/grid'
import { query } from '../engine'
import type { Board, Event, Pos, ViewUnit } from '../engine'
import type { Side } from './store'

const at = (p: Pos): string => `${p[0]},${p[1]}`
const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)
const pad = (n: number): string => String(n).padStart(2, '0')
export const roundLabel = (n: number): string => pad(n)

export function nameOf(b: Board, id: string): string {
  const u = b.units.find((x) => x.id === id)
  if (u && u.kind === 'warden') return u.name.split(' ').slice(-1)[0] ?? u.name
  if (/^s\d+$/.test(id)) return `Stalker ${id.toUpperCase()}`
  if (/^p\d+$/.test(id)) return `Contact ${id.toUpperCase()}`
  return id
}

/** Molt ids are s<n> and p<n>; Warden ids are names (venn, sato...), so a bare first letter must not be tested. */
export const isMoltId = (id: string): boolean => /^[sp]\d+$/.test(id)

export interface Line {
  side: Side
  text: string
  /** set on move lines so consecutive moves by one unit can be folded into one */
  moved?: { unit: string; squares: number; to: Pos }
}

/** A short place description for a door square, from the mission data where it names one. */
export function doorName(b: Board, p: Pos): string {
  const g = geoOf(b.mission)
  if (g.mission.sealed.some((q) => q[0] === p[0] && q[1] === p[1])) return 'the archive bulkhead'
  const t = query.terrain(b, p)
  if (t === 'bulkhead') return `flank bulkhead ${at(p)}`
  const nearAirlock = [[1, 0], [-1, 0], [0, 1], [0, -1]].some((d) => query.terrain(b, [p[0] + (d[0] as number), p[1] + (d[1] as number)]) === 'airlock')
  return nearAirlock ? 'the airlock door' : `door ${at(p)}`
}

export const terminalName = (b: Board, id: string): string => geoOf(b.mission).terminalById[id]?.name.toLowerCase() ?? id

export function foldMoveLine(prev: { text: string; moved?: Line['moved'] } | undefined, next: Line, b: Board): { fold: boolean; text: string; moved: Line['moved'] } | null {
  if (!prev?.moved || !next.moved || prev.moved.unit !== next.moved.unit) return null
  const squares = prev.moved.squares + next.moved.squares
  return { fold: true, text: moveText(b, next.moved.unit, squares, next.moved.to), moved: { unit: next.moved.unit, squares, to: next.moved.to } }
}

function moveText(b: Board, unit: string, squares: number, to: Pos): string {
  const who = nameOf(b, unit)
  const word = isMoltId(unit) ? 'creeps' : 'advances'
  return `${who} ${word} ${squares} square${squares === 1 ? '' : 's'} (now at ${at(to)}).`
}

/** `b` is the state the event happened in (any state with the same units is enough for names). */
export function describeEvent(ev: Event, b: Board): Line | null {
  const n = (id: string): string => nameOf(b, id)
  switch (ev.type) {
    case 'phaseStarted':
      return ev.seat === 'warden'
        ? { side: 'sys', text: `ROUND ${pad(ev.round)} - Warden phase. Command points: ${ev.cp ?? 0}.` }
        : { side: 'sys', text: `ROUND ${pad(ev.round)} - Molt phase.` }
    case 'moved':
      return { side: isMoltId(ev.unit) ? 'molt' : 'warden', text: moveText(b, ev.unit, 1, ev.to), moved: { unit: ev.unit, squares: 1, to: ev.to } }
    case 'turned':
      return { side: 'warden', text: `${n(ev.unit)} turns to face ${ev.facing}.` }
    case 'doorChanged': {
      const w = { open: 'opens', closed: 'closes', sealed: 'is sealed', torn: 'is torn open' }[ev.state]
      return { side: 'sys', text: `${cap(doorName(b, ev.door))} ${w}.` }
    }
    case 'fired':
      return {
        side: 'warden',
        text: `${n(ev.unit)} ${ev.watch ? 'covers and fires' : 'fires'} at ${n(ev.target)}: dice ${ev.dice.join(', ')} against ${ev.need}+. ${ev.hit ? 'HIT.' : 'Miss.'} Heat ${ev.heat}.`,
      }
    case 'locked':
      return { side: 'warden', text: `${n(ev.unit)}'s repeater locks on heat.` }
    case 'vented':
      return { side: 'warden', text: `${n(ev.unit)} vents the repeater.` }
    case 'watchSet':
      return { side: 'warden', text: `${n(ev.unit)} holds watch.` }
    case 'watchEnded':
      return { side: 'warden', text: `${n(ev.unit)}'s watch ends (${ev.why}).` }
    case 'scorched':
      return {
        side: 'warden',
        text: `${n(ev.unit)} scorches ${at(ev.at)}: ${ev.rolls.length === 0 ? 'nothing caught' : ev.rolls.map((r) => `${n(r.unit)} rolls ${r.die}${r.hit ? ' burned' : ' clear'}`).join('; ')}.`,
      }
    case 'burnCleared':
      return { side: 'sys', text: 'The burn zones die down.' }
    case 'meleeFought':
      return {
        side: isMoltId(ev.attacker) ? 'molt' : 'warden',
        text: `${n(ev.attacker)} strikes ${n(ev.defender)}${ev.flank ? ' from the flank' : ''}: ${ev.attackerRoll} against ${ev.defenderRoll}. ${ev.outcome === 'tie' ? 'No effect.' : ev.outcome === 'attacker' ? `${n(ev.attacker)} wins.` : `${n(ev.defender)} wins.`}`,
      }
    case 'breached':
      return { side: 'molt', text: `${n(ev.unit)}'s plating is BREACHED.` }
    case 'destroyed':
      return { side: ev.kind === 'warden' ? 'molt' : 'warden', text: `${ev.kind === 'warden' ? `${n(ev.unit)} is down at ${at(ev.at)}` : `${n(ev.unit)} destroyed at ${at(ev.at)}`}.` }
    case 'pingArrived':
      return { side: 'molt', text: `Sonar contact enters at duct ${at(ev.duct)}.` }
    case 'pingHeld':
      return { side: 'molt', text: 'No duct is clear: a contact is held over.' }
    case 'revealed':
      return {
        side: 'molt',
        text: `${n(ev.ping)} resolves at ${at(ev.at)}: ${ev.stalkers} stalker${ev.stalkers === 1 ? '' : 's'}${ev.lost > 0 ? `, ${ev.lost} lost for lack of room` : ''}${ev.forced ? ' (exposed)' : ''}.`,
      }
    case 'tearRolled':
      return { side: 'molt', text: `${n(ev.unit)} tears at ${doorName(b, ev.door)}: ${ev.die}. ${ev.torn ? 'The door gives.' : 'It holds.'}` }
    case 'terminalUsed':
      return { side: 'warden', text: `${n(ev.unit)} runs ${ev.op}${ev.door ? ` on ${doorName(b, ev.door)}` : ''} at the ${terminalName(b, ev.terminal)} terminal.` }
    case 'lit':
      return { side: 'sys', text: `The ${ev.section} section lights up.` }
    case 'purged':
      return { side: 'sys', text: `The ${ev.section.replace(/-/g, ' ')} is purged; ${ev.ducts.length} duct${ev.ducts.length === 1 ? '' : 's'} closed for good.` }
    case 'coreTaken':
      return { side: 'warden', text: `${n(ev.unit)} has the core.` }
    case 'coreDropped':
      return { side: 'molt', text: `The core falls at ${at(ev.at)}.` }
    case 'corePicked':
      return { side: 'warden', text: `${n(ev.unit)} recovers the core.` }
    case 'alarm':
      return { side: 'molt', text: 'ALARM: the hull knows the core is moving.' }
    case 'roundEnded':
      return { side: 'sys', text: `Round ${pad(ev.round)} ends.` }
    case 'gameOver':
      return { side: 'sys', text: ev.winner === 'warden' ? 'The core is out. Mission complete.' : ev.reason === 'time' ? 'The hull lets go. Mission lost.' : 'No Warden left standing. Mission lost.' }
  }
}

export interface Inspected {
  title: string
  lines: string[]
}

const TERRAIN_NAME: Record<string, string> = {
  wall: 'Bulkhead wall',
  floor: 'Deck plating',
  airlock: 'Aft airlock (the way out)',
  duct: 'Molt duct',
  door: 'Door',
  bulkhead: 'Bulkhead door',
  terminal: 'Terminal',
  console: 'Archive console',
}

/** What is on a square, for the inspector panel. `by` is the selected Warden, for odds. */
export function inspectSquare(b: Board, p: Pos, by: string | null): Inspected {
  const g = geoOf(b.mission)
  const t = query.terrain(b, p)
  const lines: string[] = []
  let title = TERRAIN_NAME[t] ?? t
  const u: ViewUnit | undefined = b.units.find((x) => (x.kind !== 'warden' || x.alive) && x.at[0] === p[0] && x.at[1] === p[1])
  const door = b.doors[at(p)]
  if (t === 'terminal') {
    const def = g.terminalAt[at(p)]
    if (def) title = def.name
    lines.push(b.usedTerminals.includes(def?.id ?? '') ? 'Used.' : 'Face it from the square beside it to run an operation.')
  }
  if (t === 'console') lines.push(b.core.where === 'console' ? 'The navigation core is inside.' : 'Empty. The core has been taken.')
  if (door) {
    lines.push(door.torn ? 'Torn open for good.' : door.sealed ? 'SEALED: cannot be opened until unsealed at a terminal.' : door.open ? 'Open.' : 'Closed: blocks movement and sight.')
  }
  if (t === 'duct') lines.push(b.purgedDucts.some((d) => d[0] === p[0] && d[1] === p[1]) ? 'Purged: nothing arrives here again.' : 'Molt arrive here, when no Warden watches it.')
  if (t !== 'wall' && t !== 'terminal' && t !== 'console') {
    lines.push(query.isSeen(b, p) ? 'Seen now by the squad.' : 'Mapped, not in sight.')
    if (query.isLit(b, p)) lines.push('Lit: stalkers here are easier to hit.')
    if (b.burn.some((x) => x[0] === p[0] && x[1] === p[1])) lines.push('Burning until the next Warden phase.')
  }
  if (b.core.where === 'loose' && b.core.at && b.core.at[0] === p[0] && b.core.at[1] === p[1]) lines.push('The core lies here.')
  if (u) {
    if (u.kind === 'warden') {
      title = u.name
      lines.unshift(`${roles[u.role].label}. Facing ${u.facing}. AP ${u.ap}. ${u.breached ? 'Plating BREACHED.' : 'Plating intact.'}${u.watch ? ' On watch.' : ''}`)
    } else if (u.kind === 'stalker') {
      title = nameOf(b, u.id)
      lines.unshift('Molt stalker. One wound.')
      if (by) {
        const w = b.units.find((x) => x.id === by)
        if (w && w.kind === 'warden' && w.alive && roles[w.role].weapon === 'repeater') {
          const sees = query.sees(b, by, u.at)
          lines.push(sees ? `Shot from ${nameOf(b, by)}: ${Math.round(query.hitChance(b, by, u.id) * 100)}% to hit (${query.targetNumber(b, by, u.id)}+ on any of ${rules.repeater.dice} dice).` : `${nameOf(b, by)} cannot see it.`)
        }
      }
    } else {
      title = nameOf(b, u.id)
      lines.unshift('Unresolved sonar return. How many stalkers it hides is not known until it resolves.')
    }
  }
  return { title, lines }
}
