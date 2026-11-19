// The session: starting, saving and reopening a mission, accepting actions, the bot loop for the side the person is not
// playing, the boarding clock, the boarding run and the tap resolver. The UI calls these; none of them does rules
// arithmetic (everything comes from the engine).
import { getMission } from '../data'
import { createGame, legalActions, query, step, view } from '../engine'
import { makeSave, writeSave, type SaveEnvelope } from '../engine/save'
import type { Action, Event, Pos, Seat, Setup, State, View, ViewUnit, WardenUnit } from '../engine'
import { makeRand, randomAction } from '../ai/random'
import { wardenPolicy } from '../ai/warden'
import { isTier, tierOfSetup, type Tier } from '../ai/tiers'
import { chooseInWorker } from './moltBot'
import { viewApi } from './board/viewApi'
import { visorRt } from './board/visor'
import { toWorldX, toWorldZ, dimsOf } from './board/layout'
import { describeEvent, foldMoveLine, objectiveWords } from './describe'
import { directorBusy, present, resetDirector, SPEED_FACTOR, whenDirectorIdle } from './director'
import { afterMission, currentMission, loadRun, missionSeed, newRun, storeRun, type RunState } from './run'
import { clearSave, loadSave, loadSettings, storeSave, storeSettings } from './storage'
import { emptyStats, emptyTally, getStore, setStore, type ArmKind, type LogLine, type MissionStats, type Screen, type Settings, type Speed, type TimerSetting } from './store'

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const timerOverride = Number(params.get('timer')) > 0 ? Number(params.get('timer')) : null
export const MISSION_ID = 'dead-reckoning'

let botEpoch = 0
let botRunning = false
let logId = 1

/** The tier the Molt bot plays: a URL override, else the mission's saved difficulty. */
export function activeBot(): 'random' | Tier {
  const s = getStore()
  return s.botOverride ?? tierOfSetup(s.setup)
}

export function setDifficulty(difficulty: Tier): void {
  setStore({ difficulty })
}

export function pickMission(id: string): void {
  if (getMission(id)) setStore({ missionPick: id })
}

export function pickSeat(seat: Seat): void {
  setStore({ seatPick: seat })
}

const same = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1]
/** The seat a setup was made for: the Molt when it says so, else the Wardens. */
export const seatOfSetup = (setup: Setup | null | undefined): Seat => (setup?.options?.seat === 'molt' ? 'molt' : 'warden')
/** The live view for the person's seat. */
export const hview = (s: State): View => view(s, getStore().seat)
/** The Warden view (test hooks and the title's save summary). */
export const wview = (s: State): View => view(s, 'warden')

// ------------------------------------------------------------------ settings and the save slot
export function initSession(): void {
  const stored = loadSettings()
  const speed = params.get('speed')
  const settings: Settings = {
    speed: speed === 'instant' || speed === 'fast' || speed === 'normal' ? speed : (stored.speed ?? 'normal'),
    timer: stored.timer ?? 'standard',
  }
  const bot = params.get('bot')
  const mission = params.get('mission')
  const seat = params.get('seat')
  setStore({
    settings,
    botOverride: bot === 'random' ? 'random' : isTier(bot) ? bot : null,
    missionPick: mission && getMission(mission) ? mission : MISSION_ID,
    seatPick: seat === 'molt' ? 'molt' : 'warden',
  })
  refreshSave()
}

export function refreshSave(): void {
  const r = loadSave()
  if (r.kind === 'refused') setStore({ saveRead: { kind: 'none' }, storageError: r.reason })
  else setStore({ saveRead: r })
  setStore({ runRead: loadRun() })
}

export function setSpeed(speed: Speed): void {
  const settings = { ...getStore().settings, speed }
  setStore({ settings })
  storeSettings(settings)
}

export function setTimerSetting(timer: TimerSetting): void {
  const s = getStore()
  const settings = { ...s.settings, timer }
  setStore({ settings })
  storeSettings(settings)
  if (s.state && s.screen === 'mission') {
    const max = fullTimer(hview(s.state), timer)
    setStore({ timerMax: max, timerLeft: Math.min(s.timerLeft, max) })
    if (timer !== 'off' && s.timerLeft <= 0 && max > 0) setStore({ timerLeft: max })
    persist()
  }
}

/** K-1 applies to the Warden phase played by a person; the Molt seat has no clock (the squad's phase is the AI's). */
function fullTimer(v: View, timer: TimerSetting): number {
  if (timer === 'off' || getStore().seat !== 'warden') return 0
  const base = timerOverride ?? query.timerSeconds(v)
  return timer === 'relaxed' ? base * 2 : base
}

function persist(): void {
  const s = getStore()
  if (!s.setup || !s.state || s.state.result) return
  const env = makeSave(
    s.setup,
    s.actions,
    s.state,
    { timerLeft: s.timerLeft, timerMax: s.timerMax, timer: s.settings.timer, log: s.log, kills: s.kills, stats: s.stats, run: s.run },
    new Date().toISOString(),
  )
  const err = storeSave(writeSave(env))
  if (err !== s.storageError) setStore({ storageError: err })
}

export function discardSave(): void {
  clearSave()
  setStore({ saveRead: { kind: 'none' } })
}

// ------------------------------------------------------------------ starting and reopening
function freshUi(): Partial<ReturnType<typeof getStore>> {
  return { selected: null, armed: null, hover: null, inspect: null, prompt: null, confirm: null, menu: false, notice: '', visor: false }
}

function pickSeed(): number {
  const seedParam = params.get('seed')
  return seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) : Math.floor(Math.random() * 2147483647)
}

/** R-1: a new boarding run from its first mission; the Briefing shows it before the squad cuts in. */
export function startRun(): void {
  const run = newRun(getStore().difficulty, pickSeed())
  setStore({ run, missionPick: currentMission(run), seatPick: 'warden', screen: 'briefing', confirm: null })
}

/** Carry on a run parked between missions (the title's Continue run). */
export function continueRun(): void {
  const run = loadRun()
  if (!run) {
    refreshSave()
    return
  }
  setStore({ run, difficulty: run.difficulty, missionPick: currentMission(run), seatPick: 'warden', screen: 'briefing', confirm: null })
}

/** Leave a run on the Briefing without playing on; its progress is dropped. */
export function abandonRun(): void {
  storeRun(null)
  setStore({ run: null, runRead: null })
}

export function startMission(): void {
  const s0 = getStore()
  const run = s0.run
  const missionId = run ? currentMission(run) : s0.missionPick
  const mission = getMission(missionId)
  if (!mission) return
  botEpoch++
  resetDirector()
  const seat: Seat = run ? 'warden' : s0.seatPick
  const seed = run ? missionSeed(run, run.index) : pickSeed()
  const options: NonNullable<Setup['options']> = { difficulty: run ? run.difficulty : s0.difficulty }
  if (seat === 'molt') options.seat = 'molt'
  if (run) options.roster = [...run.roster]
  const setup: Setup = { mission: missionId, seed, options }
  const state = createGame(setup)
  setStore({ seat })
  const v = hview(state)
  const max = fullTimer(v, s0.settings.timer)
  const words = objectiveWords(v)
  logId = 1
  const opening = seat === 'warden' ? `Lantern Squad cuts in at the ${words.exit} of ${mission.wreck}.` : `Lantern Squad cuts in at the ${words.exit} of ${mission.wreck}. The hull stirs: you are the Molt.`
  setStore({
    ...freshUi(),
    setup,
    state,
    actions: [],
    presented: v,
    fx: [],
    log: [{ id: logId++, side: 'sys', text: opening }],
    kills: 0,
    stats: emptyStats(),
    timerLeft: max,
    timerMax: max,
  })
  if (run) storeRun(run)
  persist()
  setStore({ screen: 'mission' })
  void runBot()
}

export function continueSave(): boolean {
  const r = loadSave()
  if (r.kind !== 'ok') {
    refreshSave()
    return false
  }
  const save: SaveEnvelope = r.save
  botEpoch++
  resetDirector()
  const ui = save.ui as { timerLeft?: number; timerMax?: number; log?: LogLine[]; kills?: number; stats?: MissionStats; timer?: TimerSetting; run?: RunState | null }
  const state = save.snapshot
  const seat = seatOfSetup(save.setup)
  setStore({ seat })
  const log = Array.isArray(ui.log) ? ui.log : []
  logId = log.reduce((m, l) => Math.max(m, l.id), 0) + 1
  const settings = getStore().settings
  const timer = ui.timer ?? settings.timer
  if (timer !== settings.timer) {
    const next = { ...settings, timer }
    setStore({ settings: next })
    storeSettings(next)
  }
  const run = ui.run && typeof ui.run === 'object' && Array.isArray(ui.run.missions) ? ui.run : null
  setStore({
    ...freshUi(),
    setup: save.setup,
    state,
    actions: save.actions,
    presented: hview(state),
    fx: [],
    log,
    kills: typeof ui.kills === 'number' ? ui.kills : 0,
    stats: ui.stats && typeof ui.stats === 'object' ? { ...emptyStats(), ...ui.stats } : emptyStats(),
    run,
    timerLeft: typeof ui.timerLeft === 'number' ? ui.timerLeft : fullTimer(hview(state), timer),
    timerMax: typeof ui.timerMax === 'number' ? ui.timerMax : fullTimer(hview(state), timer),
    screen: 'mission',
  })
  void runBot()
  return true
}

export function leaveToTitle(): void {
  persist()
  botEpoch++
  resetDirector()
  setStore({ ...freshUi(), screen: 'title' })
  refreshSave()
}

export function goto(screen: Screen): void {
  setStore({ screen, confirm: null })
  if (screen === 'title') refreshSave()
}

// ------------------------------------------------------------------ the debrief tally (presentation only: counts of events)
function tallyEvents(stats: MissionStats, events: Event[], before: State): MissionStats {
  const out: MissionStats = { ...stats, byWarden: { ...stats.byWarden } }
  const w = (id: string) => {
    const u = before.units.find((x) => x.id === id)
    if (!u || u.kind !== 'warden') return null
    const t = { ...(out.byWarden[id] ?? emptyTally()) }
    out.byWarden[id] = t
    return t
  }
  for (const ev of events) {
    switch (ev.type) {
      case 'fired': {
        const t = w(ev.unit)
        if (t) {
          t.shots++
          if (ev.hit) t.hits++
          if (ev.watch) t.watchShots++
        }
        break
      }
      case 'destroyed':
        if (ev.kind === 'warden') {
          const t = w(ev.unit)
          if (t) t.lost = true
        } else {
          out.kills++
          if (ev.by === 'purge') out.purged++
          else {
            const t = w(ev.by)
            if (t) t.kills++
          }
        }
        break
      case 'meleeFought': {
        const a = w(ev.attacker)
        const d = w(ev.defender)
        if (a) {
          if (ev.outcome === 'attacker') a.meleeWins++
          else if (ev.outcome === 'defender') a.meleeLosses++
        }
        if (d) {
          if (ev.outcome === 'defender') d.meleeWins++
          else if (ev.outcome === 'attacker') d.meleeLosses++
        }
        break
      }
      case 'scorched': {
        const t = w(ev.unit)
        if (t) t.scorches++
        break
      }
      case 'terminalUsed': {
        const t = w(ev.unit)
        if (t) t.terminals++
        break
      }
      case 'cpSpent': {
        const t = w(ev.unit)
        if (t) t.cp += ev.cp
        out.cpSpent += ev.cp
        break
      }
      case 'breached': {
        const t = w(ev.unit)
        if (t) t.breached = true
        break
      }
      case 'revealed':
        out.pingsResolved++
        out.stalkersRevealed += ev.stalkers - ev.lost
        if (ev.forced) out.exposed++
        break
      case 'tearRolled':
        if (ev.torn) out.doorsTorn++
        break
      default:
        break
    }
  }
  return out
}

// ------------------------------------------------------------------ accepting actions
function accept(a: Action): boolean {
  const s = getStore()
  if (!s.state || s.state.result) return false
  const r = step(s.state, a)
  if (!r.ok) {
    setStore({ notice: r.error })
    return false
  }
  const next = r.state
  const nv = hview(next)
  // consecutive moves by one unit fold into one line
  const lines: LogLine[] = s.log.slice(-1)
  const had = lines.length
  for (const ev of r.events) {
    const l = describeEvent(ev, nv)
    if (!l) continue
    const f = foldMoveLine(lines[lines.length - 1], l, nv)
    const last = lines[lines.length - 1]
    if (f && last) lines[lines.length - 1] = { ...last, text: f.text, moved: f.moved }
    else lines.push({ id: logId++, side: l.side, text: l.text, ...(l.moved ? { moved: l.moved } : {}) })
  }
  const logOut = [...s.log.slice(0, s.log.length - had), ...lines]
  const kills = s.kills + r.events.filter((e: Event) => e.type === 'destroyed' && e.kind !== 'warden').length
  const stats = tallyEvents(s.stats, r.events, s.state)
  const newPhase = r.events.some((e) => e.type === 'phaseStarted' && e.seat === 'warden')
  const max = newPhase ? fullTimer(nv, s.settings.timer) : s.timerMax
  const sel = s.selected && nv.units.some((u) => u.id === s.selected && (u.kind !== 'warden' || u.alive)) ? s.selected : null
  setStore({
    state: next,
    actions: [...s.actions, a],
    log: logOut.slice(-400),
    kills,
    stats,
    timerMax: max,
    timerLeft: newPhase ? max : s.timerLeft,
    selected: sel,
    armed: null,
    prompt: null,
    confirm: null,
    notice: '',
  })
  if (next.result) {
    clearSave()
    setStore({ saveRead: { kind: 'none' } })
    // R-2..R-4: the run records the mission and carries the survivors (or ends)
    const run = getStore().run
    if (run) {
      const after = afterMission(run, next, kills)
      storeRun(after)
      setStore({ run: after, runRead: after.status === 'open' ? after : null })
    }
  } else persist()
  present(r.events, nv)
  if (next.result) {
    void whenDirectorIdle().then(() => {
      const cur = getStore()
      if (cur.state === next) setStore({ screen: 'debrief', ...{ armed: null, prompt: null, confirm: null, visor: false } })
    })
  } else if (next.toAct !== getStore().seat) void runBot()
  return true
}

/** An action from the person's seat (the UI or a test): refused while an action animates or when it is not that seat's turn. */
export function dispatchHuman(a: Action): boolean {
  const s = getStore()
  if (!s.state || s.state.toAct !== s.seat || s.animating || directorBusy()) return false
  return accept(a)
}

// ------------------------------------------------------------------ the bot: whichever side the person is not playing
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function botIdle(): boolean {
  const s = getStore()
  return !directorBusy() && !botRunning && (!s.state || s.state.toAct === s.seat || s.state.result !== null)
}

export async function runBot(): Promise<void> {
  if (botRunning) return
  botRunning = true
  const mine = botEpoch
  try {
    for (;;) {
      const s = getStore().state
      const seat = getStore().seat
      if (!s || s.result || s.toAct === seat || mine !== botEpoch) break
      await whenDirectorIdle()
      if (mine !== botEpoch) break
      const f = SPEED_FACTOR[getStore().settings.speed]
      await sleep(f > 0 ? 320 * f : 0)
      const cur = getStore()
      if (mine !== botEpoch || !cur.state || cur.state.toAct === cur.seat || cur.state.result) break
      const side = cur.state.toAct as Seat
      const bv = view(cur.state, side)
      const seed = (cur.state.seed + cur.actions.length * 7919) >>> 0
      const rand = makeRand(seed)
      let a: Action | null
      try {
        if (side === 'molt') {
          const bot = cur.botOverride ?? tierOfSetup(cur.setup)
          a = bot === 'random' ? randomAction(bv, 'molt', rand) : await chooseInWorker(bv, bot, seed)
        } else a = wardenPolicy(bv, rand)
      } catch {
        a = null
      }
      // the world may have moved on while the bot thought (a new mission, a reopened save)
      if (mine !== botEpoch || getStore().state !== cur.state) continue
      if (!a || !accept(a)) {
        const fallback = randomAction(bv, side, rand) ?? ({ type: 'endPhase' } as Action)
        if (!accept(fallback)) accept({ type: 'endPhase' })
      }
      // yield so the page stays responsive between instant actions
      await sleep(0)
    }
  } finally {
    botRunning = false
  }
}

/** Test hook: the utility Warden policy's next action for the live state. */
export function wardenSuggestion(): Action | null {
  const s = getStore().state
  if (!s || s.toAct !== 'warden' || s.result) return null
  return wardenPolicy(wview(s), makeRand((s.seed + getStore().actions.length) >>> 0))
}

// ------------------------------------------------------------------ the boarding clock (K-1)
let lastTick = 0
export function tickTimer(): void {
  const now = performance.now()
  const dt = lastTick === 0 ? 0 : Math.min(1, (now - lastTick) / 1000)
  lastTick = now
  const s = getStore()
  if (s.screen !== 'mission' || !s.state || s.state.result || s.state.toAct !== 'warden' || s.seat !== 'warden') return
  if (s.settings.timer === 'off' || s.timerMax <= 0) return
  if (s.animating || directorBusy() || s.prompt || s.confirm || s.menu) return
  const left = s.timerLeft - dt
  if (left > 0) {
    setStore({ timerLeft: left })
    return
  }
  setStore({ timerLeft: 0 })
  setStore((x) => ({ log: [...x.log, { id: logId++, side: 'sys', text: 'The boarding clock runs out: the phase ends.' }] }))
  accept({ type: 'endPhase' })
}

export function pageHidden(): void {
  persist()
}

// ------------------------------------------------------------------ the controls (both seats)
export const legalOf = (v: View, unit: string): Action[] => legalActions(v).filter((a) => 'unit' in a && a.unit === unit)

export function canAct(): boolean {
  const s = getStore()
  return Boolean(s.state && s.state.toAct === s.seat && !s.state.result && !s.animating && !directorBusy() && s.screen === 'mission')
}

/** A living unit of the person's own side by id, or undefined. */
export function ownUnit(v: View, id: string | null): ViewUnit | undefined {
  if (!id) return undefined
  const u = v.units.find((x) => x.id === id)
  if (!u) return undefined
  const seat = getStore().seat
  if (seat === 'warden') return u.kind === 'warden' && u.alive ? u : undefined
  return u.kind !== 'warden' ? u : undefined
}

export function selectUnit(id: string | null, fly = false): void {
  const s = getStore()
  setStore({ selected: id, armed: null, prompt: null })
  if (id && fly && s.presented) {
    const u = s.presented.units.find((x) => x.id === id)
    if (u) {
      const d = dimsOf(s.presented.mission)
      viewApi.flyTo(toWorldX(d, u.at[0]), toWorldZ(d, u.at[1]))
    }
  }
}

/** Kept for the Warden seat's callers and tests. */
export const selectWarden = selectUnit

export function arm(kind: ArmKind): void {
  const s = getStore()
  if (!s.selected) return
  setStore({ armed: s.armed && s.armed.kind === kind ? null : { kind, unit: s.selected }, hover: null })
}

/** Fire or Melee pressed while it is already armed: in the visor that shoots what the reticle is on, else it disarms. */
export function armOrStrike(kind: ArmKind): void {
  const s = getStore()
  if (s.visor && (kind === 'fire' || kind === 'melee') && s.armed?.kind === kind && visorRt.lock && s.selected && strikeTarget(visorRt.lock)) return
  arm(kind)
}

/** The armed Fire or Melee at one target, if that is a legal action for the selected unit (the visor's brackets). */
export function strikeTarget(target: string): boolean {
  const s = getStore()
  const v = s.presented
  const kind = s.armed?.kind
  if (!v || !s.selected || !kind || kind === 'scorch' || !canAct()) return false
  const a = legalOf(v, s.selected).find((x) => x.type === kind && 'target' in x && x.target === target)
  return a ? dispatchHuman(a) : false
}

/** Visor mode on or off (spec 50 "Visor"): the Warden seat only. On rides the selected Warden, or the first one standing. */
export function setVisor(on: boolean): void {
  const s = getStore()
  if (!on) {
    setStore({ visor: false })
    return
  }
  const v = s.presented
  if (!v || s.screen !== 'mission' || s.seat !== 'warden') return
  const id = wardenOf(v, s.selected)?.id ?? v.units.find((u) => u.kind === 'warden' && u.alive)?.id
  if (!id) return
  setStore({ visor: true, selected: id, inspect: null, hover: null })
}

export function toggleVisor(): void {
  setVisor(!getStore().visor)
}

export function wardenOf(v: View, id: string | null): WardenUnit | undefined {
  const u = id ? v.units.find((x) => x.id === id) : undefined
  return u && u.kind === 'warden' && u.alive ? u : undefined
}

export function requestEndPhase(): void {
  if (!canAct()) return
  const s = getStore()
  const v = s.presented
  if (!v) return
  if (v.pending) return
  const spare = s.seat === 'warden' ? v.units.some((u) => u.kind === 'warden' && u.alive && u.ap > 0) : v.units.some((u) => u.kind !== 'warden' && u.ap > 0)
  if (spare) setStore({ confirm: 'end', prompt: null })
  else dispatchHuman({ type: 'endPhase' })
}

export function openTerminalPrompt(unit: string): void {
  setStore({ prompt: { kind: 'terminal', unit }, armed: null })
}

/**
 * The one tap resolver (KB rule 25): a pending arrival takes the duct; else the armed action for that square; else the
 * selected unit's move or door there; else select the own unit on it; else inspect; else clear.
 */
export function tapTile(p: Pos): void {
  const s = getStore()
  const v = s.presented
  if (!v || !s.state) return
  if (s.prompt || s.confirm) return
  const act = canAct()
  // P-2: the Molt player places an arriving contact
  if (act && v.pending && s.seat === 'molt') {
    const arrive = legalActions(v).find((a) => a.type === 'arrive' && same(a.duct, p))
    if (arrive) dispatchHuman(arrive)
    else setStore({ inspect: p })
    return
  }
  const sel = act ? ownUnit(v, s.selected) : undefined
  if (act && sel) {
    const legal = legalOf(v, sel.id)
    if (s.armed && s.armed.unit === sel.id) {
      const k = s.armed.kind
      const hit =
        k === 'scorch'
          ? legal.find((a) => a.type === 'scorch' && same(a.at, p))
          : k === 'tear' || k === 'door'
            ? legal.find((a) => a.type === k && same(a.door, p))
            : legal.find((a) => a.type === k && 'target' in a && v.units.find((u) => u.id === a.target && same(u.at, p)))
      if (hit) {
        dispatchHuman(hit)
        return
      }
    } else {
      const mv = legal.find((a) => a.type === 'move' && same(a.to, p))
      if (mv) {
        dispatchHuman(mv)
        return
      }
      const dr = legal.find((a) => a.type === 'door' && same(a.door, p))
      if (dr) {
        dispatchHuman(dr)
        return
      }
      if (sel.kind === 'warden' && query.terrain(v, p) === 'terminal' && legal.some((a) => a.type === 'terminal')) {
        openTerminalPrompt(sel.id)
        return
      }
    }
  }
  const own = v.units.find((u) => (u.kind !== 'warden' || u.alive) && same(u.at, p) && (s.seat === 'warden' ? u.kind === 'warden' : u.kind !== 'warden'))
  if (own) {
    setStore({ selected: own.id, armed: null, inspect: p, hover: null })
    return
  }
  const t = query.terrain(v, p)
  const here = v.units.some((u) => (u.kind !== 'warden' || u.alive) && same(u.at, p))
  const interesting = here || (t !== 'wall' && t !== 'floor' && t !== 'airlock') || v.burn.some((b) => same(b, p)) || (v.core.at !== null && same(v.core.at, p))
  if (interesting) setStore({ inspect: p })
  // in the visor an empty square keeps the Warden: losing the selection would leave the player looking through no one's eyes
  else if (s.visor) setStore({ inspect: null, armed: null })
  else setStore({ selected: null, inspect: null, armed: null })
}

export function setHover(p: Pos | null): void {
  const s = getStore()
  const h = s.hover
  if (h === p || (h && p && same(h, p))) return
  setStore({ hover: p })
}
