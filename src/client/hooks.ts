// Test hooks: window.__sd (the e2e tests drive the game through these; nothing in the game reads them).
import { legalActions, view } from '../engine'
import type { Action, State, View } from '../engine'
import { viewApi } from './board/viewApi'
import { dimsOf, toWorldX, toWorldZ } from './board/layout'
import { activeBot, botIdle, dispatchHuman, MISSION_ID, setSpeed, wardenSuggestion } from './session'
import { botInfo } from './moltBot'
import { modelStore } from './models/store'
import { audioEngine } from './audio/engine'
import { getStore, type Speed } from './store'

export interface SdHooks {
  state(): State | null
  view(): View | null
  presented(): View | null
  legal(): Action[]
  dispatch(a: Action): boolean
  /** the scripted Warden policy's next action for the live state */
  wardenAction(): Action | null
  project(x: number, y: number, height?: number): { x: number; y: number } | null
  camera(): ReturnType<typeof viewApi.camera>
  setView(p: { x?: number; z?: number; az?: number; zoom?: number; tilt?: number }): void
  speed(v: Speed): void
  /** the Molt bot: its tier, whether decisions come from the worker or the main thread, and how many were asked for */
  bot(): { tier: string; mode: string; reason: string; decisions: number }
  idle(): Promise<void>
  /** generated models: which are enabled, load progress, failures, and how many of each are in the scene */
  models(): { enabled: string[]; loaded: number; total: number; failed: string[]; mounted: Record<string, number> }
  /** audio: whether anything is enabled, ids played so far, files that failed to load */
  audio(): { enabled: boolean; played: string[]; failed: string[] }
  ui(): { screen: string; selected: string | null; armed: string | null; actions: number; log: number; timerLeft: number; hover: [number, number] | null }
}

declare global {
  interface Window {
    __sd?: SdHooks
  }
}

export function installHooks(): void {
  const dims = () => dimsOf(getStore().state?.mission ?? MISSION_ID)
  window.__sd = {
    state: () => getStore().state,
    view: () => (getStore().state ? view(getStore().state as State, 'warden') : null),
    presented: () => getStore().presented,
    legal: () => (getStore().state ? legalActions(getStore().state as State) : []),
    dispatch: (a) => dispatchHuman(a),
    wardenAction: wardenSuggestion,
    project: (x, y, h = 0) => viewApi.project(toWorldX(dims(), x), h, toWorldZ(dims(), y)),
    camera: () => viewApi.camera(),
    setView: (p) => viewApi.setView(p),
    speed: (v) => setSpeed(v),
    bot: () => ({ tier: activeBot(), ...botInfo() }),
    idle: () =>
      new Promise((resolve) => {
        const check = (): void => {
          if (botIdle()) resolve()
          else setTimeout(check, 15)
        }
        check()
      }),
    models: () => {
      const s = modelStore.snapshot()
      return { enabled: modelStore.enabledSlugs(), loaded: s.loaded, total: s.total, failed: s.failed.map((f) => f.slug), mounted: modelStore.mountedCounts() }
    },
    audio: () => ({ enabled: audioEngine.anyEnabled(), played: [...audioEngine.played], failed: audioEngine.failures() }),
    ui: () => {
      const s = getStore()
      return { screen: s.screen, selected: s.selected, armed: s.armed?.kind ?? null, actions: s.actions.length, log: s.log.length, timerLeft: s.timerLeft, hover: s.hover }
    },
  }
}
