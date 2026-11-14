// The mission HUD: boarding clock, command points, objective, squad strip (or the contact strip on the Molt seat), action bar,
// comms log, inspector, prompts. Every number shown comes from the engine (query.*) or from an event.
import { useEffect, useMemo, useRef, useState } from 'react'
import { getMission, roles, rules } from '../../data'
import { geoOf } from '../../engine/grid'
import { ahead } from '../../engine/grid'
import { legalActions, query } from '../../engine'
import type { Action, Facing, Pos, View, ViewUnit, WardenUnit } from '../../engine'
import { viewApi } from '../board/viewApi'
import { AudioControls } from './AudioControls'
import { VisorHud } from './Visor'
import { inspectSquare, nameOf, objectiveWords, roundLabel } from '../describe'
import {
  armOrStrike,
  canAct,
  dispatchHuman,
  leaveToTitle,
  legalOf,
  openTerminalPrompt,
  ownUnit,
  requestEndPhase,
  selectUnit,
  selectWarden,
  setSpeed,
  setTimerSetting,
  setVisor,
  toggleVisor,
  wardenOf,
} from '../session'
import { setStore, useStore, type ArmKind, type Side } from '../store'
import { Segmented } from './Screens'

const LEFT: Record<Facing, Facing> = { N: 'W', W: 'S', S: 'E', E: 'N' }
const RIGHT: Record<Facing, Facing> = { N: 'E', E: 'S', S: 'W', W: 'N' }
const same = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1]

const mmss = (s: number): string => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.ceil(Math.max(0, s)) % 60).padStart(2, '0')}`.replace(/:(\d)$/, ':0$1')

// ------------------------------------------------------------------ clock, CP, objective
function Clock({ v }: { v: View }) {
  const timerLeft = useStore((s) => s.timerLeft)
  const timerMax = useStore((s) => s.timerMax)
  const timer = useStore((s) => s.settings.timer)
  const seat = useStore((s) => s.seat)
  const m = getMission(v.mission)
  const warden = v.phase === 'warden'
  const low = timer !== 'off' && timerLeft < 15 && warden
  const cpMax = rules.cpBase + rules.cpDie + rules.cpSergeant
  const n = warden ? v.cp : v.heldCp
  return (
    <section className="clock panel ticks" aria-label="Boarding clock">
      <div className="clock__round">
        ROUND {roundLabel(v.round)} / {m?.roundLimit ?? '?'}
      </div>
      <div className="clock__phase">
        {warden ? 'WARDEN PHASE' : 'MOLT PHASE'}
        {seat === 'molt' && <span className="clock__seat"> // YOU ARE THE MOLT</span>}
      </div>
      {timer !== 'off' && warden && timerMax > 0 && seat === 'warden' && (
        <div className={`bar ${low ? 'bar--alarm' : ''}`} role="progressbar" aria-label="Phase timer" aria-valuenow={Math.round(timerLeft)} aria-valuemin={0} aria-valuemax={Math.round(timerMax)} data-testid="timer">
          <i style={{ width: `${Math.max(0, Math.min(100, (timerLeft / timerMax) * 100))}%` }} />
          <b>{mmss(timerLeft)}</b>
        </div>
      )}
      <div className="cp" aria-label={warden ? 'Command points' : 'Held command points'}>
        <span>{warden ? 'CP' : 'HELD'}</span>
        {Array.from({ length: Math.max(cpMax, n) }, (_, i) => (
          <i key={i} className={`pip ${i < n ? (warden ? 'on' : 'hollow') : ''}`} />
        ))}
      </div>
    </section>
  )
}

/** The current step in plain words, from the mission's own vocabulary (spec 50 "Objective line"). */
export function objectiveOf(v: View, seat: 'warden' | 'molt'): string {
  const g = geoOf(v.mission)
  const w = objectiveWords(v)
  if (seat === 'molt') {
    if (v.pending) return `Place the arriving contact: tap an open duct (${v.pending.remaining} to place)`
    if (v.core.where === 'carried') return `Stop the carrier before the ${w.exit}`
    if (v.core.where === 'loose') return `The ${w.item} lies loose: keep the squad off it`
    return `Keep the squad from the ${w.item} in the ${w.place}`
  }
  if (v.core.where === 'carried') return `Carry the ${w.item} to the ${w.exit}`
  if (v.core.where === 'loose') return `Recover the ${w.item} where it fell, then carry it to the ${w.exit}`
  const sealed = g.mission.sealed.some((p) => v.doors[`${p[0]},${p[1]}`]?.sealed)
  if (sealed) {
    const t = g.mission.terminals.find((x) => x.doors?.some((p) => g.mission.sealed.some((q) => same(p, q))))
    return `Unseal the ${w.place} at the ${t ? t.name.toLowerCase() : 'lock'} terminal`
  }
  return `Take the ${w.item} from the ${w.place} console`
}

// ------------------------------------------------------------------ squad strip
function Heartbeat({ dead }: { dead: boolean }) {
  return (
    <svg className={`beat ${dead ? 'beat--flat' : ''}`} viewBox="0 0 60 16" preserveAspectRatio="none" aria-hidden="true">
      <g className="beat__run">
        <path d={dead ? 'M0 8H120' : 'M0 8H12L15 2L19 14L22 8H40L43 5L46 8H60M60 8H72L75 2L79 14L82 8H100L103 5L106 8H120'} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  )
}

function TraceCard({ u, selected, carrier, own }: { u: WardenUnit; selected: boolean; carrier: boolean; own: boolean }) {
  const scorcher = roles[u.role].weapon === 'scorcher'
  const locked = !scorcher && u.heat >= rules.repeater.heatLock
  return (
    <button type="button" className={`trace ${selected ? 'sel' : ''} ${u.alive ? '' : 'down'}`} data-unit={u.id} aria-pressed={selected} disabled={!u.alive} onClick={() => (own ? selectWarden(u.id, true) : setStore({ inspect: u.at, selected: null }))}>
      <span className="trace__name">{u.name}</span>
      <span className="trace__role">{roles[u.role].label}</span>
      <Heartbeat dead={!u.alive} />
      <span className="trace__ap" aria-label={`Action points ${u.ap}`}>
        {Array.from({ length: rules.wardenAp }, (_, i) => (
          <i key={i} className={`pip ${i < u.ap ? 'on' : ''}`} />
        ))}
      </span>
      {scorcher ? (
        <span className="trace__heat">CHG {u.charges}/{rules.scorcher.charges}</span>
      ) : (
        <span className={`bar bar--heat ${locked ? 'bar--alarm' : ''}`} aria-label={`Heat ${u.heat} of ${rules.repeater.heatLock}`}>
          <i style={{ width: `${(u.heat / rules.repeater.heatLock) * 100}%` }} />
          <em>{locked ? 'LOCK' : `HEAT ${u.heat}`}</em>
        </span>
      )}
      <span className="trace__marks">
        <span className={u.breached ? 'alarm' : ''}>{u.alive ? (u.breached ? 'BREACHED' : 'INTACT') : 'LOST'}</span>
        {u.watch && <span className="mark">WATCH</span>}
        {carrier && <span className="mark mark--core">CORE</span>}
      </span>
    </button>
  )
}

function Strip({ v }: { v: View }) {
  const selected = useStore((s) => s.selected)
  const seat = useStore((s) => s.seat)
  const ws = v.units.filter((u): u is WardenUnit => u.kind === 'warden')
  return (
    <section className="strip" aria-label="Squad">
      {ws.map((u) => (
        <TraceCard key={u.id} u={u} selected={selected === u.id} carrier={v.core.carrier === u.id} own={seat === 'warden'} />
      ))}
    </section>
  )
}

/** The Molt seat's strip: one card per contact and stalker (spec 50 "The Molt seat"). */
function ContactCard({ u, selected }: { u: ViewUnit; selected: boolean }) {
  if (u.kind === 'warden') return null
  const ping = u.kind === 'ping'
  const maxAp = ping ? rules.pingAp : rules.stalkerAp
  return (
    <button type="button" className={`trace trace--molt ${selected ? 'sel' : ''}`} data-unit={u.id} aria-pressed={selected} onClick={() => selectUnit(u.id, true)}>
      <span className="trace__name">{ping ? `Contact ${u.id.toUpperCase()}` : `Stalker ${u.id.toUpperCase()}`}</span>
      <span className="trace__role">{ping ? (typeof u.stalkers === 'number' ? `hides ${u.stalkers}` : 'unresolved') : 'stalker'}</span>
      <span className="trace__ap" aria-label={`Action points ${u.ap}`}>
        {Array.from({ length: maxAp }, (_, i) => (
          <i key={i} className={`pip ${i < u.ap ? 'on' : ''}`} />
        ))}
      </span>
      <span className="trace__marks">
        <span>
          {u.at[0]},{u.at[1]}
        </span>
      </span>
    </button>
  )
}

function ContactStrip({ v }: { v: View }) {
  const selected = useStore((s) => s.selected)
  const units = v.units.filter((u) => u.kind !== 'warden')
  return (
    <section className="strip strip--molt" aria-label="Contacts">
      {units.length === 0 && <p className="line line--dim strip__empty">No contacts on the deck. Arrivals come at the start of each Molt phase.</p>}
      {units.map((u) => (
        <ContactCard key={u.id} u={u} selected={selected === u.id} />
      ))}
    </section>
  )
}

// ------------------------------------------------------------------ action bar
interface Btn {
  id: string
  label: string
  action?: Action
  arm?: ArmKind
  terminal?: boolean
  cost: string
  key?: string
}

const costText = (v: View, a: Action): string => {
  const c = query.cost(v, a)
  return `${c.ap} AP${c.cp > 0 ? ` +${c.cp} CP` : ''}`
}

function buttonsFor(v: View, w: WardenUnit): Btn[] {
  const legal = legalOf(v, w.id)
  const out: Btn[] = []
  const f = ahead(w)
  const fwd = legal.find((a) => a.type === 'move' && same(a.to, f))
  const back = legal.find((a) => a.type === 'move' && !same(a.to, f))
  if (fwd) out.push({ id: 'forward', label: 'Forward', action: fwd, cost: costText(v, fwd), key: 'W' })
  if (back) out.push({ id: 'back', label: 'Back', action: back, cost: costText(v, back), key: 'S' })
  const tl = legal.find((a) => a.type === 'turn' && a.facing === LEFT[w.facing])
  const tr = legal.find((a) => a.type === 'turn' && a.facing === RIGHT[w.facing])
  if (tl) out.push({ id: 'turn-left', label: 'Turn left', action: tl, cost: costText(v, tl), key: 'Q' })
  if (tr) out.push({ id: 'turn-right', label: 'Turn right', action: tr, cost: costText(v, tr), key: 'E' })
  const door = legal.find((a) => a.type === 'door')
  if (door) out.push({ id: 'door', label: 'Door', action: door, cost: costText(v, door), key: 'D' })
  const fire = legal.find((a) => a.type === 'fire')
  if (fire) out.push({ id: 'fire', label: 'Fire', arm: 'fire', cost: costText(v, fire), key: 'F' })
  const sc = legal.find((a) => a.type === 'scorch')
  if (sc) out.push({ id: 'scorch', label: 'Scorch', arm: 'scorch', cost: costText(v, sc), key: 'F' })
  const melee = legal.find((a) => a.type === 'melee')
  if (melee) out.push({ id: 'melee', label: 'Melee', arm: 'melee', cost: costText(v, melee), key: 'G' })
  const watch = legal.find((a) => a.type === 'watch')
  if (watch) out.push({ id: 'watch', label: 'Watch', action: watch, cost: costText(v, watch), key: 'O' })
  const vent = legal.find((a) => a.type === 'vent')
  if (vent && w.heat > 0) out.push({ id: 'vent', label: 'Vent', action: vent, cost: costText(v, vent), key: 'V' })
  const ops = query.terminalOps(v, w.id)
  if (ops.length > 0) {
    const o = ops.find((x) => x.available) ?? ops[0]
    if (o) out.push({ id: 'terminal', label: 'Terminal', terminal: true, cost: `${o.cost.ap} AP${o.cost.cp > 0 ? ` +${o.cost.cp} CP` : ''}`, key: 'T' })
  }
  const core = legal.find((a) => a.type === 'takeCore')
  if (core) out.push({ id: 'take-core', label: `Take ${objectiveWords(v).item}`, action: core, cost: costText(v, core) })
  return out
}

/** The Molt seat's buttons for a stalker or a contact: a single-target action acts at once, several targets arm a tap. */
function moltButtonsFor(v: View, u: ViewUnit): Btn[] {
  if (u.kind === 'warden') return []
  const legal = legalOf(v, u.id)
  const out: Btn[] = []
  const moves = legal.filter((a) => a.type === 'move')
  if (moves.length) out.push({ id: 'move', label: 'Move', cost: `${rules.stalker.moveCost} AP each: tap a lit square`, key: 'M' })
  const doors = legal.filter((a): a is Extract<Action, { type: 'door' }> => a.type === 'door')
  if (doors.length === 1 && doors[0]) out.push({ id: 'door', label: 'Door', action: doors[0], cost: costText(v, doors[0]), key: 'D' })
  else if (doors.length > 1 && doors[0]) out.push({ id: 'door', label: 'Door', arm: 'door', cost: `${costText(v, doors[0])}: tap the door`, key: 'D' })
  const tears = legal.filter((a): a is Extract<Action, { type: 'tear' }> => a.type === 'tear')
  if (tears.length === 1 && tears[0]) out.push({ id: 'tear', label: 'Tear', action: tears[0], cost: `${costText(v, tears[0])}, ${rules.stalker.tearOn}+ on a die`, key: 'T' })
  else if (tears.length > 1 && tears[0]) out.push({ id: 'tear', label: 'Tear', arm: 'tear', cost: `${costText(v, tears[0])}: tap the door`, key: 'T' })
  const melee = legal.filter((a): a is Extract<Action, { type: 'melee' }> => a.type === 'melee')
  if (melee.length === 1 && melee[0]) {
    const o = query.meleeOdds(v, u.id, melee[0].target)
    out.push({ id: 'melee', label: `Strike ${nameOf(v, melee[0].target)}`, action: melee[0], cost: `${costText(v, melee[0])}, ${Math.round(o.attackerWins * 100)}% to win`, key: 'G' })
  } else if (melee.length > 1 && melee[0]) out.push({ id: 'melee', label: 'Strike', arm: 'melee', cost: `${costText(v, melee[0])}: tap a Warden`, key: 'G' })
  const reveal = legal.find((a) => a.type === 'reveal')
  const hides = u.kind === 'ping' && typeof u.stalkers === 'number' ? u.stalkers : null
  if (reveal) out.push({ id: 'reveal', label: 'Reveal', action: reveal, cost: `0 AP: ${hides !== null ? `${hides} stalker${hides === 1 ? '' : 's'} with full AP` : 'its stalkers step out'}`, key: 'R' })
  return out
}

function ActionBar({ v }: { v: View }) {
  const selected = useStore((s) => s.selected)
  const armed = useStore((s) => s.armed)
  const animating = useStore((s) => s.animating)
  const toAct = useStore((s) => s.state?.toAct)
  const seat = useStore((s) => s.seat)
  const visor = useStore((s) => s.visor)
  const u = ownUnit(v, selected)
  const w = u && u.kind === 'warden' ? u : undefined
  const enabled = canAct() && !animating && toAct === seat
  const btns = useMemo(() => (u && enabled && !v.pending ? (u.kind === 'warden' ? buttonsFor(v, u) : moltButtonsFor(v, u)) : []), [v, u, enabled])
  const press = (b: Btn): void => {
    if (!u) return
    if (b.action) dispatchHuman(b.action)
    else if (b.arm) armOrStrike(b.arm)
    else if (b.terminal) openTerminalPrompt(u.id)
  }
  const spare = seat === 'warden' ? v.units.some((x) => x.kind === 'warden' && x.alive && x.ap > 0) : v.units.some((x) => x.kind !== 'warden' && x.ap > 0)
  const who = (): string => {
    if (!enabled) return v.phase === (seat === 'warden' ? 'molt' : 'warden') ? (seat === 'warden' ? 'The Molt move.' : 'The squad moves.') : 'Wait.'
    if (v.pending && seat === 'molt') return `A contact is arriving: tap an open duct for it. ${v.pending.remaining} to place.`
    if (!u) return seat === 'warden' ? 'Select a Warden: tap one on the board or on its card.' : 'Select a contact or stalker: tap one on the board or on its card.'
    if (w) {
      const tail = armed ? (visor && armed.kind !== 'scorch' ? `Armed: ${armed.kind}. Press it again to shoot the locked bracket.` : `Armed: ${armed.kind}. Tap a highlighted square.`) : visor ? 'W / S to step, Q / E to turn, drag to look.' : 'Tap a lit square to move.'
      return `${w.name} facing ${w.facing}, ${w.ap} AP${v.cp > 0 ? `, ${v.cp} CP shared` : ''}. ${tail}`
    }
    const name = u.kind === 'ping' ? `Contact ${u.id.toUpperCase()}` : `Stalker ${u.id.toUpperCase()}`
    return `${name}, ${u.ap} AP. ${armed ? `Armed: ${armed.kind}. Tap a highlighted square.` : u.kind === 'ping' ? 'Tap a lit square to creep (never into the squad’s sight), or reveal.' : 'Tap a lit square to move, or strike an adjacent Warden.'}`
  }
  return (
    <section className="actions" aria-label="Actions" data-busy={enabled ? 'no' : 'yes'}>
      <div className="actions__who">{who()}</div>
      <div className="actions__row">
        {btns.map((b) => (
          <button key={b.id} type="button" className={`act ${armed && b.arm === armed.kind ? 'on' : ''}`} data-act={b.id} aria-pressed={b.arm ? armed?.kind === b.arm : undefined} onClick={() => press(b)}>
            {b.label}
            <small>{b.cost}</small>
          </button>
        ))}
        <button type="button" className="act act--end" data-act="end-phase" disabled={!enabled || !!v.pending} onClick={requestEndPhase}>
          End phase
          <small>{v.pending ? 'place arrivals first' : spare ? 'AP left' : 'all spent'}</small>
        </button>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ inspector and odds
function Inspector({ v }: { v: View }) {
  const hover = useStore((s) => s.hover)
  const inspect = useStore((s) => s.inspect)
  const selected = useStore((s) => s.selected)
  const armed = useStore((s) => s.armed)
  const seat = useStore((s) => s.seat)
  const p = hover ?? inspect
  const info = useMemo(() => (p ? inspectSquare(v, p, seat === 'warden' ? selected : null) : null), [p, v, selected, seat])
  const extra = useMemo(() => {
    if (!p || !armed || !selected) return null
    const t = v.units.find((u) => u.kind === 'stalker' && same(u.at, p))
    const w = v.units.find((u) => u.kind === 'warden' && u.alive && same(u.at, p))
    if (armed.kind === 'fire' && t) {
      const legal = legalOf(v, selected).some((a) => a.type === 'fire' && a.target === t.id)
      return legal ? `Odds: ${Math.round(query.hitChance(v, selected, t.id) * 100)}% to kill (need ${query.targetNumber(v, selected, t.id)}+ on any of ${rules.repeater.dice} dice).` : 'Not a legal shot.'
    }
    if (armed.kind === 'melee' && (t || w)) {
      const target = seat === 'warden' ? t : w
      if (!target) return null
      const o = query.meleeOdds(v, selected, target.id)
      return `Odds: win ${Math.round(o.attackerWins * 100)}%, tie ${Math.round(o.tie * 100)}%, lose ${Math.round(o.defenderWins * 100)}%.`
    }
    if (armed.kind === 'scorch' && legalOf(v, selected).some((a) => a.type === 'scorch' && same(a.at, p))) {
      const burst = query.burst(v, selected, p)
      const caught = v.units.filter((u) => (u.kind !== 'warden' || u.alive) && burst.some((b) => same(b, u.at)))
      return `Burst covers ${burst.length} squares${caught.length ? `: ${caught.map((u) => (u.kind === 'ping' ? 'a contact' : nameOf(v, u.id))).join(', ')} caught` : ', nothing caught'}.`
    }
    if (armed.kind === 'tear' && legalOf(v, selected).some((a) => a.type === 'tear' && same(a.door, p))) return `Tear: ${rules.stalker.tearOn}+ on one die tears it open for good.`
    return null
  }, [p, v, armed, selected, seat])
  if (!p || !info) return null
  return (
    <aside className="inspector panel ticks" aria-label="Inspector" data-testid="inspector">
      <h3>
        {info.title} <small>{p[0]},{p[1]}</small>
      </h3>
      {info.lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
      {extra && <p className="odds">{extra}</p>}
    </aside>
  )
}

// ------------------------------------------------------------------ log
const SIDE_CLASS: Record<Side, string> = { warden: 'w', molt: 'm', sys: 's' }

function Log({ sheet, onClose }: { sheet: boolean; onClose?: () => void }) {
  const log = useStore((s) => s.log)
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log.length])
  return (
    <section className={`log panel ${sheet ? 'log--sheet' : ''}`} aria-label="Comms log" data-testid="log">
      <header>
        <span>COMMS</span>
        {onClose && (
          <button type="button" onClick={onClose}>
            Close
          </button>
        )}
      </header>
      <ol ref={ref}>
        {log.map((l) => (
          <li key={l.id} className={SIDE_CLASS[l.side]}>
            {l.text}
          </li>
        ))}
      </ol>
    </section>
  )
}

// ------------------------------------------------------------------ prompts
function TerminalPrompt({ v, unit }: { v: View; unit: string }) {
  const g = geoOf(v.mission)
  const w = wardenOf(v, unit)
  if (!w) return null
  const def = g.terminalAt[`${ahead(w)[0]},${ahead(w)[1]}`]
  const ops = query.terminalOps(v, unit)
  const question =
    def?.system === 'bulkheads' ? 'seal or unseal which door?' : def?.system === 'lights' ? 'light this section? One use; stalkers in light are easier to hit.' : 'purge this section? One use; everything inside takes a lethal hit, Wardens included, and its ducts close for good.'
  const act = (o: (typeof ops)[number]): void => {
    const a: Action = o.door ? { type: 'terminal', unit, terminal: o.terminal, op: o.op, door: o.door } : { type: 'terminal', unit, terminal: o.terminal, op: o.op }
    dispatchHuman(a)
  }
  return (
    <section className="modal ticks" role="dialog" aria-label="Terminal" data-testid="terminal-prompt">
      <h2>{def?.name ?? 'Terminal'}</h2>
      <p className="line">
        {def?.name ?? 'Terminal'}: {question}
      </p>
      <div className="modal__body ops">
        {ops.map((o, i) => (
          <button key={i} type="button" disabled={!o.available} onClick={() => act(o)} data-op={o.op}>
            {o.op === 'seal' ? 'Seal' : o.op === 'unseal' ? 'Unseal' : o.op === 'lights' ? 'Lights' : 'Purge'}
            {o.door ? ` door ${o.door[0]},${o.door[1]}` : ''}
            <small>{o.available ? `${o.cost.ap} AP${o.cost.cp > 0 ? ` +${o.cost.cp} CP` : ''}` : (o.why ?? 'unavailable')}</small>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setStore({ prompt: null })}>
        Cancel
      </button>
    </section>
  )
}

function EndConfirm() {
  const seat = useStore((s) => s.seat)
  return (
    <section className="modal ticks" role="alertdialog" aria-label="End the phase" data-testid="end-confirm">
      <h2>End the phase?</h2>
      <p className="line">{seat === 'warden' ? 'Some Wardens still have action points. End the Warden phase and hand the deck to the Molt?' : 'Some contacts still have action points. End the Molt phase and hand the deck to the squad?'}</p>
      <div className="row">
        <button type="button" className="primary" onClick={() => dispatchHuman({ type: 'endPhase' })} data-act="end-confirm">
          End phase
        </button>
        <button type="button" onClick={() => setStore({ confirm: null })}>
          Keep going
        </button>
      </div>
    </section>
  )
}

function MenuPanel() {
  const settings = useStore((s) => s.settings)
  const seat = useStore((s) => s.seat)
  return (
    <section className="modal ticks" role="dialog" aria-label="Menu" data-testid="menu">
      <h2>Menu</h2>
      <div className="modal__body">
        <Segmented
          label="Animation speed"
          value={settings.speed}
          options={[
            { id: 'normal', label: 'Normal' },
            { id: 'fast', label: 'Fast' },
            { id: 'instant', label: 'Instant' },
          ]}
          onPick={setSpeed}
        />
        {seat === 'warden' && (
          <Segmented
            label="Boarding clock"
            value={settings.timer}
            options={[
              { id: 'standard', label: 'Standard' },
              { id: 'relaxed', label: 'Relaxed' },
              { id: 'off', label: 'Off' },
            ]}
            onPick={setTimerSetting}
          />
        )}
        <AudioControls />
        <button type="button" onClick={() => viewApi.reset()}>
          Reset camera
        </button>
        <button type="button" onClick={leaveToTitle} data-act="to-title">
          Save and leave to title
        </button>
      </div>
      <button type="button" onClick={() => setStore({ menu: false })}>
        Resume
      </button>
    </section>
  )
}

// ------------------------------------------------------------------ keyboard
function useKeys(v: View | null): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!v || e.ctrlKey || e.metaKey || e.altKey) return
      const s = useStore.getState()
      if (e.key === 'Escape') {
        if (s.prompt || s.confirm || s.menu) setStore({ prompt: null, confirm: null, menu: false })
        else if (s.armed || s.inspect || !s.visor) setStore({ armed: null, inspect: null })
        else setVisor(false)
        return
      }
      if (s.prompt || s.confirm || s.menu) return
      const t = e.target
      if (t instanceof HTMLElement && /input|textarea|select/i.test(t.tagName)) return
      // the visor toggles at any time in the mission, the Molt phase included (watching through a Warden's eyes)
      if ((e.key === 'c' || e.key === 'C') && s.seat === 'warden') {
        toggleVisor()
        return
      }
      if (!canAct()) return
      // the arrow keys step and turn like W / S and Q / E
      const arrow: Record<string, string> = { ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'q', ArrowRight: 'e' }
      if (arrow[e.key]) e.preventDefault()
      const k = arrow[e.key] ?? e.key.toLowerCase()
      if (k === ' ') {
        if (t instanceof HTMLButtonElement) return
        e.preventDefault()
        requestEndPhase()
        return
      }
      if (/^[1-9]$/.test(k)) {
        const own = s.seat === 'warden' ? v.units.filter((u): u is WardenUnit => u.kind === 'warden') : v.units.filter((u) => u.kind !== 'warden')
        const u = own[Number(k) - 1]
        if (u && (u.kind !== 'warden' || u.alive)) selectUnit(u.id, true)
        return
      }
      const u = ownUnit(v, s.selected)
      if (!u || v.pending) return
      const b = (u.kind === 'warden' ? buttonsFor(v, u) : moltButtonsFor(v, u)).find((x) => x.key?.toLowerCase() === k)
      if (!b) return
      if (b.action) dispatchHuman(b.action)
      else if (b.arm) armOrStrike(b.arm)
      else if (b.terminal) openTerminalPrompt(u.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [v])
}

// ------------------------------------------------------------------ the whole HUD
export function Hud() {
  const v = useStore((s) => s.presented)
  const prompt = useStore((s) => s.prompt)
  const confirm = useStore((s) => s.confirm)
  const menu = useStore((s) => s.menu)
  const notice = useStore((s) => s.notice)
  const storageError = useStore((s) => s.storageError)
  const animating = useStore((s) => s.animating)
  const visor = useStore((s) => s.visor)
  const seat = useStore((s) => s.seat)
  const [sheet, setSheet] = useState(false)
  const [logOpen, setLogOpen] = useState(true)
  useKeys(v)
  if (!v) return null
  const obj = objectiveOf(v, seat)
  void legalActions
  return (
    <div className={`hud ${visor ? 'hud--visor' : ''} hud--${seat}`} data-screen="mission" data-seat={seat} data-animating={animating ? 'yes' : 'no'}>
      {seat === 'warden' && <VisorHud v={v} />}
      <Clock v={v} />
      <div className="hud-objective panel" aria-label="Objective">
        <span className="eyebrow">Objective</span> {obj}
      </div>
      <div className="topright">
        <button type="button" className="panel" onClick={() => viewApi.topDown()} data-act="top-down">
          Top<span className="long"> down</span>
          <small>H</small>
        </button>
        {seat === 'warden' && (
          <button type="button" className="panel visorbtn" onClick={toggleVisor} data-act="visor" aria-pressed={visor}>
            {visor ? 'Map' : 'Visor'}
            <small>C</small>
          </button>
        )}
        <button type="button" className="panel" onClick={() => setStore({ menu: true })} data-act="menu">
          Menu
        </button>
        <button type="button" className="panel logbtn" onClick={() => setSheet(true)} data-act="comms">
          Comms
        </button>
        <button type="button" className="panel logtoggle" onClick={() => setLogOpen((x) => !x)} aria-pressed={logOpen}>
          {logOpen ? 'Hide log' : 'Show log'}
        </button>
      </div>
      {(storageError || notice) && (
        <p className="alertline" role="alert">
          {storageError || notice}
        </p>
      )}
      {logOpen && <Log sheet={false} />}
      {sheet && <Log sheet onClose={() => setSheet(false)} />}
      <Inspector v={v} />
      <div className="bottom">
        <ActionBar v={v} />
        {seat === 'warden' ? <Strip v={v} /> : <ContactStrip v={v} />}
      </div>
      {prompt?.kind === 'terminal' && <TerminalPrompt v={v} unit={prompt.unit} />}
      {confirm === 'end' && <EndConfirm />}
      {menu && <MenuPanel />}
    </div>
  )
}
