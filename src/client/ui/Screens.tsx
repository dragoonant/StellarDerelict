// Title, Missions, Briefing, Debrief and the two panels that open over the title (how to play, settings).
import { useEffect, useMemo, useState } from 'react'
import { getMission, listMissions, roles, rules, runDef } from '../../data'
import type { Mission } from '../../data'
import { geoOf } from '../../engine/grid'
import type { Seat, WardenUnit } from '../../engine'
import { abandonRun, continueRun, continueSave, discardSave, goto, pickMission, pickSeat, seatOfSetup, setDifficulty, setSpeed, setTimerSetting, startMission, startRun } from '../session'
import { TIER_LABEL, tierOfSetup, type Tier } from '../../ai/tiers'
import { emptyTally, setStore, useStore, type Speed, type TimerSetting } from '../store'
import { roundLabel } from '../describe'
import { currentMission, tally, type RunState } from '../run'
import { useModelProgress } from '../models/Model'
import { AudioControls } from './AudioControls'

function TitleMap({ mission }: { mission: string }) {
  const d = useMemo(() => {
    const g = geoOf(mission)
    let path = ''
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.terrain[y]?.[x] !== 'wall') path += `M${x} ${y}h1v1h-1z`
    return { path, w: g.w, h: g.h }
  }, [mission])
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

const seatLabel = (seat: Seat): string => (seat === 'molt' ? 'playing the Molt' : 'playing the Wardens')

export function Title() {
  const saveRead = useStore((s) => s.saveRead)
  const runRead = useStore((s) => s.runRead)
  const storageError = useStore((s) => s.storageError)
  const confirm = useStore((s) => s.confirm)
  const howTo = useStore((s) => s.howTo)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const missionPick = useStore((s) => s.missionPick)
  const models = useModelProgress()
  const [intent, setIntent] = useState<'run' | 'single'>('single')

  const summary = useMemo(() => {
    if (saveRead.kind !== 'ok') return ''
    const st = saveRead.save.snapshot
    const m = getMission(st.mission)
    const alive = st.units.filter((u) => u.kind === 'warden' && u.alive).length
    const total = st.units.filter((u) => u.kind === 'warden').length
    const run = (saveRead.save.ui as { run?: RunState | null }).run
    const where = st.core.where === 'carried' ? 'carried' : st.core.where === 'loose' ? 'dropped' : `still in the ${m?.objective.place ?? 'vault'}`
    return `${m?.name ?? st.mission}${run ? ` (boarding run, mission ${run.index + 1} of ${run.missions.length})` : ''}, round ${roundLabel(st.round)} of ${m?.roundLimit ?? '?'}, ${st.phase === 'warden' ? 'Warden' : 'Molt'} phase, ${alive} of ${total} Wardens alive, ${m?.objective.item ?? 'core'} ${where}, ${seatLabel(seatOfSetup(saveRead.save.setup))}, ${TIER_LABEL[tierOfSetup(saveRead.save.setup)]} difficulty, saved ${savedWhen(saveRead.save.savedAt)}`
  }, [saveRead])

  const runSummary = useMemo(() => {
    if (!runRead) return ''
    const m = getMission(currentMission(runRead))
    const t = tally(runRead)
    return `${runRead.name}: ${t.missionsWon} of ${t.missions} missions done, ${runRead.roster.length} Wardens left, ${TIER_LABEL[runRead.difficulty]} difficulty. Next: ${m?.name ?? '?'}`
  }, [runRead])

  const begin = (what: 'run' | 'single'): void => {
    setIntent(what)
    if (saveRead.kind === 'ok') setStore({ confirm: 'replace' })
    else if (what === 'run') startRun()
    else goto('missions')
  }
  const replace = (): void => {
    setStore({ confirm: null })
    discardSave()
    if (intent === 'run') startRun()
    else goto('missions')
  }

  return (
    <main className="title" data-screen="title">
      <div className="title__rings" />
      <TitleMap mission={missionPick} />
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
              <button type="button" onClick={replace}>
                Replace it
              </button>
              <button type="button" onClick={() => setStore({ confirm: null })}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <>
            {saveRead.kind === 'ok' && (
              <button type="button" onClick={() => continueSave()} data-act="continue" className="title__continue" disabled={!models.ready}>
                {models.ready ? 'Continue' : `Loading models ${models.loaded}/${models.total}`}
                <small>{summary}</small>
              </button>
            )}
            {runRead && saveRead.kind !== 'ok' && (
              <button type="button" onClick={continueRun} data-act="continue-run" className="title__continue" disabled={!models.ready}>
                {models.ready ? 'Continue the boarding run' : `Loading models ${models.loaded}/${models.total}`}
                <small>{runSummary}</small>
              </button>
            )}
            <button type="button" onClick={() => begin('run')} data-act="run">
              Boarding run
              <small>
                {runDef.missions.length} missions into {getMission(runDef.missions[0] ?? '')?.wreck ?? 'the wreck'}; the survivors of one board the next
              </small>
            </button>
            <button type="button" onClick={() => begin('single')} data-act="board">
              Single mission
              <small>Pick a mission and a side: the Wardens, or the Molt against the squad</small>
            </button>
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
        <p>Five armoured Wardens board a dead ship, take what the mission names from its console and carry it back to the airlock before the hull lets go. The Molt swarm answers every move you make.</p>
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
          <b>The boarding run.</b> Three missions into the same wreck, in order. Whoever is standing at the end of one boards the next; a lost mission ends the run, and so does a squad down to {rules.run.minSquad - 1} Warden{rules.run.minSquad - 1 === 1 ? '' : 's'}. Plating is patched between missions.
        </p>
        <p>
          <b>Playing the Molt.</b> Pick the Molt on the Missions screen and the ship's own squad AI runs the Wardens. Each Molt phase you place the arriving contacts on open ducts, creep them where the squad cannot see, reveal them into stalkers and strike. You see how many stalkers each contact hides; the squad does not.
        </p>
        <p>
          <b>Keys.</b> W forward, S back, Q and E turn, F fire, O watch, V vent, D door, T terminal, Space ends the phase. As the Molt: M move, D door, T tear, G strike, R reveal. Mouse: wheel zooms, right-drag rotates, middle-drag pans. Touch: drag to pan, pinch and twist. H (or the Top down button) looks straight down with north up.
        </p>
        <p>
          <b>Visor.</b> C (or the Visor button) puts you behind the selected Warden's visor: W and S (or the up and down arrows) step, Q and E (or left and right) turn, drag to look around. With Fire armed, the bracket nearest the reticle is locked; press Fire again to shoot it. C or Esc returns to the map.
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
const SEATS: { id: Seat; label: string }[] = [
  { id: 'warden', label: 'Wardens' },
  { id: 'molt', label: 'Molt' },
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
  const models = useModelProgress()
  return (
    <section className="modal ticks" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <div className="modal__body">
        <Segmented label="Animation speed" value={settings.speed} options={SPEEDS} onPick={setSpeed} />
        <Segmented label="Boarding clock" value={settings.timer} options={TIMERS} onPick={setTimerSetting} />
        <p className="line line--dim">
          Standard gives {rules.timer.base} seconds plus {rules.timer.perWarden} per living Warden for the Warden phase. Relaxed doubles it. Off removes it.
        </p>
        <AudioControls />
        {models.failed.map((f) => (
          <p key={f.slug} className="diag" role="status">
            Model {f.slug} failed to load ({f.reason}); the procedural figure is used instead.
          </p>
        ))}
      </div>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </section>
  )
}

/** A line drawing of a mission map for the Missions screen's cards (generated from the grid, never an image). */
function MapThumb({ m }: { m: Mission }) {
  const d = useMemo(() => {
    const g = geoOf(m.id)
    let path = ''
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.terrain[y]?.[x] !== 'wall') path += `M${x} ${y}h1v1h-1z`
    return { path, w: g.w, h: g.h }
  }, [m.id])
  return (
    <svg className="mcard__map" viewBox={`-1 -1 ${d.w + 2} ${d.h + 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d={d.path} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function Missions() {
  const missionPick = useStore((s) => s.missionPick)
  const seatPick = useStore((s) => s.seatPick)
  const missions = listMissions()
  const order = new Map(runDef.missions.map((id, i) => [id, i]))
  const sorted = [...missions].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
  return (
    <main className="missions" data-screen="missions">
      <header>
        <p className="eyebrow">Boarding channel // single mission</p>
        <h2>Choose the cut</h2>
      </header>
      <Segmented label="Play as" value={seatPick} options={SEATS} onPick={pickSeat} />
      <p className="line line--dim">{seatPick === 'warden' ? 'You command Lantern Squad against the swarm.' : 'You are the swarm: the ship’s squad AI runs Lantern Squad against you. No boarding clock.'}</p>
      <ul className="mlist" aria-label="Missions">
        {sorted.map((m, i) => (
          <li key={m.id}>
            <button type="button" className={`mcard ticks ${missionPick === m.id ? 'on' : ''}`} aria-pressed={missionPick === m.id} data-mission={m.id} onClick={() => pickMission(m.id)}>
              <span className="mcard__n">{String(i + 1).padStart(2, '0')}</span>
              <strong>{m.name}</strong>
              <MapThumb m={m} />
              <span className="dim">
                {m.grid[0]?.length ?? 0} x {m.grid.length} deck, {m.roundLimit} rounds, {m.arrivals.normal} contacts a round ({m.arrivals.alarm} on alarm)
              </span>
              <span>
                Bring the {m.objective.item} out of the {m.objective.place} by the {m.objective.exit}.
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" className="primary" onClick={() => goto('briefing')} data-act="brief">
          Brief
        </button>
        <button type="button" onClick={() => goto('title')}>
          Back
        </button>
      </div>
    </main>
  )
}

export function Briefing() {
  const missionPick = useStore((s) => s.missionPick)
  const run = useStore((s) => s.run)
  const seatPick = useStore((s) => s.seatPick)
  const seat: Seat = run ? 'warden' : seatPick
  const m = getMission(run ? currentMission(run) : missionPick)
  const settings = useStore((s) => s.settings)
  const difficulty = useStore((s) => s.difficulty)
  const models = useModelProgress()
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
  const roster = run ? m.squad.filter((q) => run.roster.includes(q.id)) : m.squad
  const back = (): void => {
    if (run) abandonRun()
    goto(run ? 'title' : 'missions')
  }
  return (
    <main className="briefing" data-screen="briefing">
      <header>
        <p className="eyebrow">{run ? `${run.name} // boarding run, mission ${run.index + 1} of ${run.missions.length}` : `Transmission // ${seat === 'molt' ? 'the hull' : 'Lantern Squad'}`}</p>
        <h2>{m.name}</h2>
      </header>
      <p className="brief" aria-label="Mission brief">
        {brief.slice(0, shown)}
        <span className="caret" />
      </p>
      <p className="objective">
        {seat === 'warden'
          ? `Objective: take the ${m.objective.item} from the ${m.objective.place} console and stand on a square of the ${m.objective.exit} with it before round ${m.roundLimit} ends.`
          : `Objective: no Warden stands on the ${m.objective.exit} with the ${m.objective.item} before round ${m.roundLimit} ends, or no Warden stands at all.`}
      </p>
      {run && run.results.length > 0 && (
        <p className="line line--dim">
          {run.results.filter((r) => r.won).length} mission{run.results.filter((r) => r.won).length === 1 ? '' : 's'} done; {roster.length} of {m.squad.length} Wardens board. Plating patched.
        </p>
      )}
      <ul className="roster" aria-label="Squad roster">
        {roster.map((s) => (
          <li key={s.id} className="card">
            <strong>{s.name}</strong>
            <span>{roles[s.role].label}</span>
            <span className="dim">{roles[s.role].weapon === 'scorcher' ? `Scorcher, ${rules.scorcher.charges} charges` : 'Repeater'}</span>
          </li>
        ))}
      </ul>
      {seat === 'warden' ? (
        <>
          <Segmented label="Boarding clock" value={settings.timer} options={TIMERS} onPick={setTimerSetting} />
          <Segmented label="Difficulty" value={difficulty} options={DIFFICULTIES} onPick={setDifficulty} />
          <p className="line line--dim">{DIFFICULTY_NOTE[difficulty]}</p>
        </>
      ) : (
        <p className="line line--dim">You play the Molt. The squad is run by the ship’s own utility AI at full strength; there is no boarding clock. Your contacts’ stalker counts are yours to see.</p>
      )}
      <div className="row">
        <button type="button" className="primary" onClick={startMission} data-act="cut-in" disabled={!models.ready}>
          {models.ready ? (seat === 'warden' ? 'Cut in' : 'Let them in') : `Loading models ${models.loaded}/${models.total}`}
        </button>
        <button type="button" onClick={back}>
          {run ? 'Abandon the run' : 'Back'}
        </button>
      </div>
    </main>
  )
}

const pct = (n: number, d: number): string => (d > 0 ? `${Math.round((n / d) * 100)}%` : '-')

export function Debrief() {
  const state = useStore((s) => s.state)
  const stats = useStore((s) => s.stats)
  const setup = useStore((s) => s.setup)
  const seat = useStore((s) => s.seat)
  const run = useStore((s) => s.run)
  const m = state ? getMission(state.mission) : undefined
  if (!state || !state.result || !m) return null
  const wardenWon = state.result.winner === 'warden'
  const won = seat === 'warden' ? wardenWon : !wardenWon
  const wardens = state.units.filter((u): u is WardenUnit => u.kind === 'warden')
  const alive = wardens.filter((u) => u.alive).length
  const why = state.result.reason === 'core-out' ? `The ${m.objective.item} is out through the ${m.objective.exit}.` : state.result.reason === 'time' ? 'The hull let go before the squad got out.' : 'No Warden was left standing.'
  const heading = seat === 'warden' ? (won ? `${m.objective.item} recovered` : 'Signal lost') : won ? 'The hull keeps its own' : 'Prey escaped'
  const shots = Object.values(stats.byWarden).reduce((n, t) => n + t.shots, 0)
  const hits = Object.values(stats.byWarden).reduce((n, t) => n + t.hits, 0)
  const runTally = run ? tally(run) : null
  const nextId = run && run.status === 'open' ? currentMission(run) : null
  const next = nextId ? getMission(nextId) : undefined
  const runLine = !run
    ? null
    : run.status === 'open'
      ? `Boarding run: ${runTally?.missionsWon} of ${run.missions.length} missions done. ${run.roster.length} Wardens board ${next?.name ?? 'the next cut'}.`
      : run.status === 'complete'
        ? `Boarding run complete: ${run.missions.length} missions, ${runTally?.wardensLost} Warden${runTally?.wardensLost === 1 ? '' : 's'} lost, ${runTally?.kills} Molt destroyed in ${runTally?.rounds} rounds.`
        : run.status === 'pulled-out'
          ? `Boarding run over: with ${run.roster.length} Warden${run.roster.length === 1 ? '' : 's'} left the squad pulls out. ${runTally?.missionsWon} of ${run.missions.length} missions done.`
          : `Boarding run over: the squad is lost on mission ${run.results.length} of ${run.missions.length}.`
  return (
    <main className="debrief" data-screen="debrief" data-run={run ? run.status : 'none'}>
      <h2 className={won ? 'win' : 'lose'}>{heading}</h2>
      <p className="line">{why}</p>
      {runLine && (
        <p className="line runline" data-testid="run-line">
          {runLine}
        </p>
      )}
      <dl className="stats">
        <dt>Mission</dt>
        <dd>{m.name}</dd>
        <dt>Rounds used</dt>
        <dd>
          {state.round} of {m.roundLimit}
        </dd>
        <dt>Wardens alive</dt>
        <dd>
          {alive} of {wardens.length}
        </dd>
        <dt>Molt destroyed</dt>
        <dd>
          {stats.kills}
          {stats.purged > 0 ? ` (${stats.purged} by the purge)` : ''}
        </dd>
        <dt>Repeater fire</dt>
        <dd>
          {shots} shot{shots === 1 ? '' : 's'}, {hits} hit{hits === 1 ? '' : 's'} ({pct(hits, shots)})
        </dd>
        <dt>Contacts resolved</dt>
        <dd>
          {stats.pingsResolved} ({stats.stalkersRevealed} stalker{stats.stalkersRevealed === 1 ? '' : 's'}; {stats.exposed} exposed by sight)
        </dd>
        <dt>Command points spent</dt>
        <dd>{stats.cpSpent}</dd>
        <dt>Doors torn</dt>
        <dd>{stats.doorsTorn}</dd>
        <dt>Side</dt>
        <dd>{seat === 'warden' ? 'Wardens' : 'Molt'}</dd>
        <dt>Difficulty</dt>
        <dd>{seat === 'warden' ? TIER_LABEL[tierOfSetup(setup)] : 'Squad AI'}</dd>
      </dl>
      <ul className="roster roster--debrief" aria-label="Squad debrief">
        {wardens.map((u) => {
          const t = stats.byWarden[u.id] ?? emptyTally()
          const scorcher = roles[u.role].weapon === 'scorcher'
          return (
            <li key={u.id} className={`card ${u.alive ? '' : 'down'}`} data-unit={u.id}>
              <strong>{u.name}</strong>
              <span>{u.alive ? (u.breached ? 'Breached, alive' : 'Intact') : 'Lost'}</span>
              <span className="dim">{scorcher ? `${t.scorches} burst${t.scorches === 1 ? '' : 's'}` : `${t.shots} shot${t.shots === 1 ? '' : 's'}, ${t.hits} hit${t.hits === 1 ? '' : 's'}${t.watchShots ? ` (${t.watchShots} on watch)` : ''}`}</span>
              <span className="dim">
                {t.kills} kill{t.kills === 1 ? '' : 's'}
                {t.meleeWins + t.meleeLosses > 0 ? `, melee ${t.meleeWins}-${t.meleeLosses}` : ''}
                {t.terminals > 0 ? `, ${t.terminals} terminal op${t.terminals === 1 ? '' : 's'}` : ''}
                {t.cp > 0 ? `, ${t.cp} CP` : ''}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="row">
        {next ? (
          <button type="button" className="primary" onClick={() => goto('briefing')} data-act="next-mission">
            Next: {next.name}
          </button>
        ) : (
          <button type="button" className="primary" onClick={startMission} data-act="again">
            Again
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (run && run.status !== 'open') setStore({ run: null })
            goto('title')
          }}
          data-act="to-title"
        >
          Title
        </button>
      </div>
    </main>
  )
}
