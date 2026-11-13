// Title, Briefing, Debrief and the two panels that open over the title (how to play, settings).
import { useEffect, useMemo, useState } from 'react'
import { getMission, roles, rules } from '../../data'
import { geoOf } from '../../engine/grid'
import { MISSION_ID, continueSave, discardSave, goto, setDifficulty, setSpeed, setTimerSetting, startMission } from '../session'
import { TIER_LABEL, tierOfSetup, type Tier } from '../../ai/tiers'
import { setStore, useStore, type Speed, type TimerSetting } from '../store'
import { roundLabel } from '../describe'

function TitleMap() {
  const d = useMemo(() => {
    const g = geoOf(MISSION_ID)
    let path = ''
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.terrain[y]?.[x] !== 'wall') path += `M${x} ${y}h1v1h-1z`
    return { path, w: g.w, h: g.h }
  }, [])
  return (
    <svg className="title__map" viewBox={`-1 -1 ${d.w + 2} ${d.h + 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d={d.path} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function savedWhen(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'earlier'
  return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function Title() {
  const saveRead = useStore((s) => s.saveRead)
  const storageError = useStore((s) => s.storageError)
  const confirm = useStore((s) => s.confirm)
  const howTo = useStore((s) => s.howTo)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const state = useStore((s) => s.state)

  const summary = useMemo(() => {
    if (saveRead.kind !== 'ok') return ''
    const st = saveRead.save.snapshot
    const m = getMission(st.mission)
    const alive = st.units.filter((u) => u.kind === 'warden' && u.alive).length
    const total = st.units.filter((u) => u.kind === 'warden').length
    return `${m?.name ?? st.mission}, round ${roundLabel(st.round)} of ${m?.roundLimit ?? '?'}, ${st.phase === 'warden' ? 'Warden' : 'Molt'} phase, ${alive} of ${total} Wardens alive, core ${st.core.where === 'carried' ? 'carried' : st.core.where === 'loose' ? 'dropped' : 'still in the archive'}, ${TIER_LABEL[tierOfSetup(saveRead.save.setup)]} difficulty, saved ${savedWhen(saveRead.save.savedAt)}`
  }, [saveRead])

  const board = (): void => {
    if (saveRead.kind === 'ok') setStore({ confirm: 'replace' })
    else goto('briefing')
  }
  void state

  return (
    <main className="title" data-screen="title">
      <div className="title__rings" />
      <TitleMap />
      <div className="title__sweep" />
      <h1 className="title__mark">
        Stellar<span>Derelict</span>
      </h1>
      <p className="title__sub">Lantern Squad // boarding channel</p>
      <nav className="title__menu" aria-label="Main menu">
        {storageError && (
          <p className="line line--alarm" role="alert">
            {storageError}
          </p>
        )}
        {saveRead.kind === 'bad' && (
          <div className="title__bad" role="alert">
            <p className="line line--alarm">The saved mission cannot be opened: {saveRead.reason}</p>
            <button type="button" onClick={discardSave}>
              Discard the saved mission
            </button>
          </div>
        )}
        {confirm === 'replace' ? (
          <div className="title__ask" role="alertdialog" aria-label="Replace the saved mission">
            <p className="line">Starting a new mission replaces the saved one:</p>
            <p className="line line--dim">{summary}</p>
            <div className="row">
              <button
                type="button"
                onClick={() => {
                  setStore({ confirm: null })
                  goto('briefing')
                }}
              >
                Replace it
              </button>
              <button type="button" onClick={() => setStore({ confirm: null })}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <>
            <button type="button" onClick={board} data-act="board">
              Board the Halcyon Drift
            </button>
            {saveRead.kind === 'ok' && (
              <button type="button" onClick={() => continueSave()} data-act="continue" className="title__continue">
                Continue
                <small>{summary}</small>
              </button>
            )}
            <button type="button" onClick={() => setStore({ howTo: true })}>
              How to play
            </button>
            <button type="button" onClick={() => setStore({ settingsOpen: true })}>
              Settings
            </button>
          </>
        )}
      </nav>
      <p className="title__note">An original game by evilgouki</p>
      {howTo && <HowTo />}
      {settingsOpen && <SettingsPanel onClose={() => setStore({ settingsOpen: false })} />}
    </main>
  )
}

function HowTo() {
  return (
    <section className="modal ticks" role="dialog" aria-label="How to play">
      <h2>How to play</h2>
      <div className="modal__body">
        <p>Five armoured Wardens board a dead ship, take its navigation core from the archive and carry it back to the airlock before the hull lets go. The Molt swarm answers every move you make.</p>
        <p>
          <b>Your turn.</b> Pick a Warden by tapping its square or its card. Each Warden has {rules.wardenAp} action points a round: moving forward costs {rules.cost.forward}, back {rules.cost.back}, a turn {rules.cost.turn}. Command points
          cover a shortfall. Tap a lit square to move there, or use the action bar.
        </p>
        <p>
          <b>Sight.</b> The bright squares are what the squad sees now. Molt contacts show only as sonar pings until they are seen or reveal themselves. A ping never enters a square the squad can see.
        </p>
        <p>
          <b>Guns.</b> Repeaters take {rules.repeater.dice} dice and heat up with every shot; at {rules.repeater.heatLock} heat they lock until vented. Watch holds fire for the Molt phase. The Scorcher burns a square and its neighbours.
        </p>
        <p>
          <b>Hardsuits.</b> The first lethal hit only breaches the plating. The second takes the Warden down.
        </p>
        <p>
          <b>The clock.</b> The Warden phase runs on a boarding clock (Standard, Relaxed or Off in Settings). When it runs out the phase ends.
        </p>
        <p>
          <b>Keys.</b> W forward, S back, Q and E turn, F fire, O watch, V vent, D door, T terminal, Space ends the phase. Mouse: wheel zooms, right-drag rotates, middle-drag pans. Touch: drag to pan, pinch and twist.
        </p>
        <p>
          <b>Saves.</b> The game saves after every action, in this browser only. A different browser, device or address has its own saves.
        </p>
      </div>
      <button type="button" onClick={() => setStore({ howTo: false })}>
        Close
      </button>
    </section>
  )
}

const SPEEDS: { id: Speed; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
  { id: 'instant', label: 'Instant' },
]
const DIFFICULTIES: { id: Tier; label: string }[] = [
  { id: 'recruit', label: 'Recruit' },
  { id: 'regular', label: 'Regular' },
  { id: 'veteran', label: 'Veteran' },
]
const DIFFICULTY_NOTE: Record<Tier, string> = {
  recruit: 'The swarm hesitates, strikes head on and reveals one contact at a time.',
  regular: 'The swarm as first scripted: steady, with no tricks.',
  veteran: 'The swarm flanks, gangs up on one Warden and reveals together.',
}
const TIMERS: { id: TimerSetting; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'off', label: 'Off' },
]

export function Segmented<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      <span className="seg__label">{label}</span>
      {options.map((o) => (
        <button key={o.id} type="button" className={value === o.id ? 'on' : ''} aria-pressed={value === o.id} onClick={() => onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings)
  return (
    <section className="modal ticks" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <div className="modal__body">
        <Segmented label="Animation speed" value={settings.speed} options={SPEEDS} onPick={setSpeed} />
        <Segmented label="Boarding clock" value={settings.timer} options={TIMERS} onPick={setTimerSetting} />
        <p className="line line--dim">
          Standard gives {rules.timer.base} seconds plus {rules.timer.perWarden} per living Warden for the Warden phase. Relaxed doubles it. Off removes it.
        </p>
      </div>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </section>
  )
}

export function Briefing() {
  const m = getMission(MISSION_ID)
  const settings = useStore((s) => s.settings)
  const difficulty = useStore((s) => s.difficulty)
  const [shown, setShown] = useState(0)
  const brief = m?.brief ?? ''
  useEffect(() => {
    if (settings.speed === 'instant') {
      setShown(brief.length)
      return
    }
    setShown(0)
    const t = setInterval(() => setShown((n) => (n >= brief.length ? n : n + 2)), 22)
    return () => clearInterval(t)
  }, [brief, settings.speed])
  if (!m) return null
  return (
    <main className="briefing" data-screen="briefing">
      <header>
        <p className="eyebrow">Transmission // Lantern Squad</p>
        <h2>{m.name}</h2>
      </header>
      <p className="brief" aria-label="Mission brief">
        {brief.slice(0, shown)}
        <span className="caret" />
      </p>
      <p className="objective">
        Objective: take the navigation core from the archive console and stand on an airlock square with it before round {m.roundLimit} ends.
      </p>
      <ul className="roster" aria-label="Squad roster">
        {m.squad.map((s) => (
          <li key={s.id} className="card">
            <strong>{s.name}</strong>
            <span>{roles[s.role].label}</span>
            <span className="dim">{roles[s.role].weapon === 'scorcher' ? `Scorcher, ${rules.scorcher.charges} charges` : 'Repeater'}</span>
          </li>
        ))}
      </ul>
      <Segmented label="Boarding clock" value={settings.timer} options={TIMERS} onPick={setTimerSetting} />
      <Segmented label="Difficulty" value={difficulty} options={DIFFICULTIES} onPick={setDifficulty} />
      <p className="line line--dim">{DIFFICULTY_NOTE[difficulty]}</p>
      <div className="row">
        <button type="button" className="primary" onClick={startMission} data-act="cut-in">
          Cut in
        </button>
        <button type="button" onClick={() => goto('title')}>
          Back
        </button>
      </div>
    </main>
  )
}

export function Debrief() {
  const state = useStore((s) => s.state)
  const kills = useStore((s) => s.kills)
  const setup = useStore((s) => s.setup)
  const m = getMission(MISSION_ID)
  if (!state || !state.result) return null
  const won = state.result.winner === 'warden'
  const wardens = state.units.filter((u) => u.kind === 'warden')
  const alive = wardens.filter((u) => u.kind === 'warden' && u.alive).length
  const why = state.result.reason === 'core-out' ? 'The core is out through the airlock.' : state.result.reason === 'time' ? 'The hull let go before the squad got out.' : 'No Warden was left standing.'
  return (
    <main className="debrief" data-screen="debrief">
      <h2 className={won ? 'win' : 'lose'}>{won ? 'Core recovered' : 'Signal lost'}</h2>
      <p className="line">{why}</p>
      <dl className="stats">
        <dt>Rounds used</dt>
        <dd>
          {state.round} of {m?.roundLimit ?? '?'}
        </dd>
        <dt>Wardens alive</dt>
        <dd>
          {alive} of {wardens.length}
        </dd>
        <dt>Molt destroyed</dt>
        <dd>{kills}</dd>
        <dt>Difficulty</dt>
        <dd>{TIER_LABEL[tierOfSetup(setup)]}</dd>
      </dl>
      <ul className="roster">
        {wardens.map((u) =>
          u.kind === 'warden' ? (
            <li key={u.id} className={`card ${u.alive ? '' : 'down'}`}>
              <strong>{u.name}</strong>
              <span>{u.alive ? (u.breached ? 'Breached, alive' : 'Intact') : 'Lost'}</span>
            </li>
          ) : null,
        )}
      </ul>
      <div className="row">
        <button type="button" className="primary" onClick={startMission} data-act="again">
          Again
        </button>
        <button type="button" onClick={() => goto('title')} data-act="to-title">
          Title
        </button>
      </div>
    </main>
  )
}
