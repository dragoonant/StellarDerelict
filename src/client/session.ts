// The session: starting, saving and reopening a mission, accepting actions, the Molt bot loop, the boarding clock and the
// tap resolver. The UI calls these; none of them does rules arithmetic (everything comes from the engine).
import { getMission } from '../data'
import { createGame, legalActions, query, step, view } from '../engine'
import { makeSave, writeSave, type SaveEnvelope } from '../engine/save'
import type { Action, Event, Pos, State, View, WardenUnit } from '../engine'
import { makeRand, randomAction } from '../ai/random'
import { wardenPolicy } from '../ai/warden'
import { isTier, tierOfSetup, type Tier } from '../ai/tiers'
import { chooseInWorker } from './moltBot'
import { viewApi } from './board/viewApi'
import { visorRt } from './board/visor'
import { toWorldX, toWorldZ, dimsOf } from './board/layout'
import { describeEvent, foldMoveLine } from './describe'
import { directorBusy, present, resetDirector, SPEED_FACTOR, whenDirectorIdle } from './director'
import { clearSave, loadSave, loadSettings, storeSave, storeSettings } from './storage'
import { getStore, setStore, type LogLine, type Screen, type Settings, type Speed, type TimerSetting } from './store'

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

const same = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1]
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
  setStore({ settings, botOverride: bot === 'random' ? 'random' : isTier(bot) ? bot : null })
  refreshSave()
}

export function refreshSave(): void {
  const r = loadSave()
  if (r.kind === 'refused') setStore({ saveRead: { kind: 'none' }, storageError: r.reason })
  else setStore({ saveRead: r })
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
    const max = fullTimer(wview(s.state), timer)
    setStore({ timerMax: max, timerLeft: Math.min(s.timerLeft, max) })
    if (timer !== 'off' && s.timerLeft <= 0 && max > 0) setStore({ timerLeft: max })
    persist()
  }
}

function fullTimer(v: View, timer: TimerSetting): number {
  if (timer === 'off') return 0
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
    { timerLeft: s.timerLeft, timerMax: s.timerMax, timer: s.settings.timer, log: s.log, kills: s.kills },
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

export function startMission(): void {
  botEpoch++
  resetDirector()
  const seedParam = params.get('seed')
  const seed = seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) : Math.floor(Math.random() * 2147483647)
  const setup = { mission: MISSION_ID, seed, options: { difficulty: getStore().difficulty } }
  const state = createGame(setup)
  const v = wview(state)
  const mission = getMission(MISSION_ID)
  const max = fullTimer(v, getStore().settings.timer)
  logId = 1
  setStore({
    ...freshUi(),
    setup,
    state,
    actions: [],
    presented: v,
    fx: [],
    log: [{ id: logId++, side: 'sys', text: `Lantern Squad cuts in at the aft airlock of ${mission?.wreck ?? 'the wreck'}.` }],
    kills: 0,
    timerLeft: max,
    timerMax: max,
  })
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
  const ui = save.ui as { timerLeft?: number; timerMax?: number; log?: LogLine[]; kills?: number; timer?: TimerSetting }
  const state = save.snapshot
  const log = Array.isArray(ui.log) ? ui.log : []
  logId = log.reduce((m, l) => Math.max(m, l.id), 0) + 1
  const settings = getStore().settings
  const timer = ui.timer ?? settings.timer
  if (timer !== settings.timer) {
    const next = { ...settings, timer }
    setStore({ settings: next })
    storeSettings(next)
  }
  setStore({
    ...freshUi(),
    setup: save.setup,
    state,
    actions: save.actions,
    presented: wview(state),
    fx: [],
    log,
    kills: typeof ui.kills === 'number' ? ui.kills : 0,
    timerLeft: typeof ui.timerLeft === 'number' ? ui.timerLeft : fullTimer(wview(state), timer),
    timerMax: typeof ui.timerMax === 'number' ? ui.timerMax : fullTimer(wview(state), timer),
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
  const nv = wview(next)
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
  const newPhase = r.events.some((e) => e.type === 'phaseStarted' && e.seat === 'warden')
  const max = newPhase ? fullTimer(nv, s.settings.timer) : s.timerMax
  const sel = s.selected && nv.units.some((u) => u.id === s.selected && u.kind === 'warden' && u.alive) ? s.selected : null
  setStore({
    state: next,
    actions: [...s.actions, a],
    log: logOut.slice(-400),
    kills,
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
  } else persist()
  present(r.events, nv)
  if (next.result) {
    void whenDirectorIdle().then(() => {
      const cur = getStore()
      if (cur.state === next) setStore({ screen: 'debrief', ...{ armed: null, prompt: null, confirm: null, visor: false } })
    })
  } else if (next.toAct === 'molt') void runBot()
  return true
}

/** A Warden-side action from the UI or a test: refused while an action animates or when it is not the Wardens' turn. */
export function dispatchHuman(a: Action): boolean {
  const s = getStore()
  if (!s.state || s.state.toAct !== 'warden' || s.animating || directorBusy()) return false
  return accept(a)
}

// ------------------------------------------------------------------ the Molt bot
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function botIdle(): boolean {
  const s = getStore()
  return !directorBusy() && !botRunning && (!s.state || s.state.toAct !== 'molt' || s.state.result !== null)
}

export async function runBot(): Promise<void> {
  if (botRunning) return
  botRunning = true
  const mine = botEpoch
  try {
    for (;;) {
      const s = getStore().state
      if (!s || s.result || s.toAct !== 'molt' || mine !== botEpoch) break
      await whenDirectorIdle()
      if (mine !== botEpoch) break
      const f = SPEED_FACTOR[getStore().settings.speed]
      await sleep(f > 0 ? 320 * f : 0)
      const cur = getStore()
      if (mine !== botEpoch || !cur.state || cur.state.toAct !== 'molt' || cur.state.result) break
      const mv = view(cur.state, 'molt')
      const seed = (cur.state.seed + cur.actions.length * 7919) >>> 0
      const rand = makeRand(seed)
      const bot = cur.botOverride ?? tierOfSetup(cur.setup)
      let a: Action | null
      try {
        a = bot === 'random' ? randomAction(mv, 'molt', rand) : await chooseInWorker(mv, bot, seed)
      } catch {
        a = null
      }
      // the world may have moved on while the worker thought (a new mission, a reopened save)
      if (mine !== botEpoch || getStore().state !== cur.state) continue
      if (!a || !accept(a)) {
        const fallback = randomAction(mv, 'molt', rand) ?? ({ type: 'endPhase' } as Action)
        if (!accept(fallback)) accept({ type: 'endPhase' })
      }
      // yield so the page stays responsive between instant actions
      await sleep(0)
    }
  } finally {
    botRunning = false
  }
}

/** Test hook: the scripted Warden policy's next action for the live state. */
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
  if (s.screen !== 'mission' || !s.state || s.state.result || s.state.toAct !== 'warden') return
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

// ------------------------------------------------------------------ the Warden controls
export const legalOf = (v: View, unit: string): Action[] => legalActions(v).filter((a) => 'unit' in a && a.unit === unit)

export function canAct(): boolean {
  const s = getStore()
  return Boolean(s.state && s.state.toAct === 'warden' && !s.state.result && !s.animating && !directorBusy() && s.screen === 'mission')
}

export function selectWarden(id: string | null, fly = false): void {
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

export function arm(kind: 'fire' | 'scorch' | 'melee'): void {
  const s = getStore()
  if (!s.selected) return
  setStore({ armed: s.armed && s.armed.kind === kind ? null : { kind, unit: s.selected }, hover: null })
}

/** Fire or Melee pressed while it is already armed: in the visor that shoots what the reticle is on, else it disarms. */
export function armOrStrike(kind: 'fire' | 'scorch' | 'melee'): void {
  const s = getStore()
  if (s.visor && kind !== 'scorch' && s.armed?.kind === kind && visorRt.lock && s.selected && strikeTarget(visorRt.lock)) return
  arm(kind)
}

/** The armed Fire or Melee at one target, if that is a legal action for the selected Warden (the visor's brackets). */
export function strikeTarget(target: string): boolean {
  const s = getStore()
  const v = s.presented
  const kind = s.armed?.kind
  if (!v || !s.selected || !kind || kind === 'scorch' || !canAct()) return false
  const a = legalOf(v, s.selected).find((x) => x.type === kind && 'target' in x && x.target === target)
  return a ? dispatchHuman(a) : false
}

/** Visor mode on or off (spec 50 "Visor"). On rides the selected Warden, or the first one standing when none is selected. */
export function setVisor(on: boolean): void {
  const s = getStore()
  if (!on) {
    setStore({ visor: false })
    return
  }
  const v = s.presented
  if (!v || s.screen !== 'mission') return
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
  const spare = v.units.some((u) => u.kind === 'warden' && u.alive && u.ap > 0)
  if (spare) setStore({ confirm: 'end', prompt: null })
  else dispatchHuman({ type: 'endPhase' })
}

export function openTerminalPrompt(unit: string): void {
  setStore({ prompt: { kind: 'terminal', unit }, armed: null })
}

/** The one tap resolver (KB rule 25): armed action for that square, else select the Warden on it, else inspect, else clear. */
export function tapTile(p: Pos): void {
  const s = getStore()
  const v = s.presented
  if (!v || !s.state) return
  if (s.prompt || s.confirm) return
  const act = canAct()
  const sel = act ? wardenOf(v, s.selected) : undefined
  if (act && sel) {
    const legal = legalOf(v, sel.id)
    if (s.armed && s.armed.unit === sel.id) {
      const k = s.armed.kind
      const hit =
        k === 'scorch'
          ? legal.find((a) => a.type === 'scorch' && same(a.at, p))
          : legal.find((a) => (a.type === k) && 'target' in a && v.units.find((u) => u.id === a.target && same(u.at, p)))
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
      if (query.terrain(v, p) === 'terminal' && legal.some((a) => a.type === 'terminal')) {
        openTerminalPrompt(sel.id)
        return
      }
    }
  }
  const w = v.units.find((u): u is WardenUnit => u.kind === 'warden' && u.alive && same(u.at, p))
  if (w) {
    setStore({ selected: w.id, armed: null, inspect: p, hover: null })
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
