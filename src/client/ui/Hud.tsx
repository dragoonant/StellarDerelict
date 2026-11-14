// The mission HUD: boarding clock, command points, objective, squad strip, action bar, comms log, inspector, prompts.
import { useEffect, useMemo, useRef, useState } from 'react'
import { getMission, roles, rules } from '../../data'
import { geoOf } from '../../engine/grid'
import { ahead } from '../../engine/grid'
import { query } from '../../engine'
import type { Action, Facing, Pos, View, WardenUnit } from '../../engine'
import { viewApi } from '../board/viewApi'
import { AudioControls } from './AudioControls'
import { VisorHud } from './Visor'
import { inspectSquare, nameOf, roundLabel } from '../describe'
import {
  armOrStrike,
  canAct,
  dispatchHuman,
  leaveToTitle,
  legalOf,
  openTerminalPrompt,
  requestEndPhase,
  selectWarden,
  setSpeed,
  setTimerSetting,
  setVisor,
  toggleVisor,
  wardenOf,
} from '../session'
import { setStore, useStore, type Side } from '../store'
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
      <div className="clock__phase">{warden ? 'WARDEN PHASE' : 'MOLT PHASE'}</div>
      {timer !== 'off' && warden && timerMax > 0 && (
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

function objectiveOf(v: View): string {
  const g = geoOf(v.mission)
  if (v.core.where === 'carried') return 'Carry the core to the airlock'
  if (v.core.where === 'loose') return 'Recover the core where it fell, then carry it to the airlock'
  const sealed = g.mission.sealed.some((p) => v.doors[`${p[0]},${p[1]}`]?.sealed)
  if (sealed) {
    const t = g.mission.terminals.find((x) => x.doors?.some((p) => g.mission.sealed.some((q) => same(p, q))))
    return `Unseal the archive at the ${t ? t.name.toLowerCase() : 'lock'} terminal`
  }
  return 'Take the core from the archive console'
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

function TraceCard({ u, selected, carrier }: { u: WardenUnit; selected: boolean; carrier: boolean }) {
  const scorcher = roles[u.role].weapon === 'scorcher'
  const locked = !scorcher && u.heat >= rules.repeater.heatLock
  return (
    <button type="button" className={`trace ${selected ? 'sel' : ''} ${u.alive ? '' : 'down'}`} data-unit={u.id} aria-pressed={selected} disabled={!u.alive} onClick={() => selectWarden(u.id, true)}>
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
  const ws = v.units.filter((u): u is WardenUnit => u.kind === 'warden')
  return (
    <section className="strip" aria-label="Squad">
      {ws.map((u) => (
        <TraceCard key={u.id} u={u} selected={selected === u.id} carrier={v.core.carrier === u.id} />
      ))}
    </section>
  )
}

// ------------------------------------------------------------------ action bar
interface Btn {
  id: string
  label: string
  action?: Action
  arm?: 'fire' | 'scorch' | 'melee'
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
  if (core) out.push({ id: 'take-core', label: 'Take core', action: core, cost: costText(v, core) })
  return out
}

function ActionBar({ v }: { v: View }) {
  const selected = useStore((s) => s.selected)
  const armed = useStore((s) => s.armed)
  const animating = useStore((s) => s.animating)
  const toAct = useStore((s) => s.state?.toAct)
  const visor = useStore((s) => s.visor)
  const w = wardenOf(v, selected)
  const enabled = canAct() && !animating && toAct === 'warden'
  const btns = useMemo(() => (w && enabled ? buttonsFor(v, w) : []), [v, w, enabled])
  const press = (b: Btn): void => {
    if (!w) return
    if (b.action) dispatchHuman(b.action)
    else if (b.arm) armOrStrike(b.arm)
    else if (b.terminal) openTerminalPrompt(w.id)
  }
  return (
    <section className="actions" aria-label="Actions" data-busy={enabled ? 'no' : 'yes'}>
      <div className="actions__who">
        {w ? (
          <>
            <b>{w.name}</b> facing {w.facing}, {w.ap} AP{v.cp > 0 ? `, ${v.cp} CP shared` : ''}. {armed ? (visor && armed.kind !== 'scorch' ? `Armed: ${armed.kind}. Press it again to shoot the locked bracket.` : `Armed: ${armed.kind}. Tap a highlighted square.`) : visor ? 'W / S to step, Q / E to turn, drag to look.' : 'Tap a lit square to move.'}
          </>
        ) : (
          <>{enabled ? 'Select a Warden: tap one on the board or on its card.' : v.phase === 'molt' ? 'The Molt move.' : 'Wait.'}</>
        )}
      </div>
      <div className="actions__row">
        {btns.map((b) => (
          <button key={b.id} type="button" className={`act ${armed && b.arm === armed.kind ? 'on' : ''}`} data-act={b.id} aria-pressed={b.arm ? armed?.kind === b.arm : undefined} onClick={() => press(b)}>
            {b.label}
            <small>{b.cost}</small>
          </button>
        ))}
        <button type="button" className="act act--end" data-act="end-phase" disabled={!enabled} onClick={requestEndPhase}>
          End phase
          <small>{v.units.some((u) => u.kind === 'warden' && u.alive && u.ap > 0) ? 'AP left' : 'all spent'}</small>
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
  const p = hover ?? inspect
  const info = useMemo(() => (p ? inspectSquare(v, p, selected) : null), [p, v, selected])
  const extra = useMemo(() => {
    if (!p || !armed || !selected) return null
    const t = v.units.find((u) => u.kind === 'stalker' && same(u.at, p))
    if (armed.kind === 'fire' && t) {
      const legal = legalOf(v, selected).some((a) => a.type === 'fire' && a.target === t.id)
      return legal ? `Odds: ${Math.round(query.hitChance(v, selected, t.id) * 100)}% to kill (need ${query.targetNumber(v, selected, t.id)}+ on any of ${rules.repeater.dice} dice).` : 'Not a legal shot.'
    }
    if (armed.kind === 'melee' && t) {
      const o = query.meleeOdds(v, selected, t.id)
      return `Odds: win ${Math.round(o.attackerWins * 100)}%, tie ${Math.round(o.tie * 100)}%, lose ${Math.round(o.defenderWins * 100)}%.`
    }
    if (armed.kind === 'scorch' && legalOf(v, selected).some((a) => a.type === 'scorch' && same(a.at, p))) {
      const burst = query.burst(v, selected, p)
      const caught = v.units.filter((u) => (u.kind !== 'warden' || u.alive) && burst.some((b) => same(b, u.at)))
      return `Burst covers ${burst.length} squares${caught.length ? `: ${caught.map((u) => (u.kind === 'ping' ? 'a contact' : nameOf(v, u.id))).join(', ')} caught` : ', nothing caught'}.`
    }
    return null
  }, [p, v, armed, selected])
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
  return (
    <section className="modal ticks" role="alertdialog" aria-label="End the phase" data-testid="end-confirm">
      <h2>End the phase?</h2>
      <p className="line">Some Wardens still have action points. End the Warden phase and hand the deck to the Molt?</p>
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
      if (e.key === 'c' || e.key === 'C') {
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
      if (/^[1-5]$/.test(k)) {
        const ws = v.units.filter((u): u is WardenUnit => u.kind === 'warden')
        const u = ws[Number(k) - 1]
        if (u && u.alive) selectWarden(u.id, true)
        return
      }
      const w = wardenOf(v, s.selected)
      if (!w) return
      const b = buttonsFor(v, w).find((x) => x.key?.toLowerCase() === k)
      if (!b) return
      if (b.action) dispatchHuman(b.action)
      else if (b.arm) armOrStrike(b.arm)
      else if (b.terminal) openTerminalPrompt(w.id)
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
  const [sheet, setSheet] = useState(false)
  const [logOpen, setLogOpen] = useState(true)
  useKeys(v)
  if (!v) return null
  const obj = objectiveOf(v)
  return (
    <div className={`hud ${visor ? 'hud--visor' : ''}`} data-screen="mission" data-animating={animating ? 'yes' : 'no'}>
      <VisorHud v={v} />
      <Clock v={v} />
      <div className="hud-objective panel" aria-label="Objective">
        <span className="eyebrow">Objective</span> {obj}
      </div>
      <div className="topright">
        <button type="button" className="panel visorbtn" onClick={toggleVisor} data-act="visor" aria-pressed={visor}>
          {visor ? 'Map' : 'Visor'}
          <small>C</small>
        </button>
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
        <Strip v={v} />
      </div>
      {prompt?.kind === 'terminal' && <TerminalPrompt v={v} unit={prompt.unit} />}
      {confirm === 'end' && <EndConfirm />}
      {menu && <MenuPanel />}
    </div>
  )
}
