// The client store: what the screens and the board read. Rules live in the engine; this holds the session around it.
import { create } from 'zustand'
import type { Action, Pos, Setup, State, View } from '../engine'
import type { Tier } from '../ai/tiers'

export type Screen = 'title' | 'briefing' | 'mission' | 'debrief'
export type Speed = 'normal' | 'fast' | 'instant'
export type TimerSetting = 'standard' | 'relaxed' | 'off'
export type Side = 'warden' | 'molt' | 'sys'

export interface LogLine {
  id: number
  side: Side
  text: string
  moved?: { unit: string; squares: number; to: [number, number] }
}

export interface Settings {
  speed: Speed
  timer: TimerSetting
}

export interface Fx {
  id: number
  kind: 'tracer' | 'burst' | 'lunge' | 'ring' | 'purge' | 'wreck' | 'flash'
  born: number
  ms: number
  from?: Pos
  to?: Pos
  squares?: Pos[]
  unit?: string
  hit?: boolean
  flag?: string
}

export type Armed = { kind: 'fire' | 'scorch' | 'melee'; unit: string } | null
export type Prompt = { kind: 'terminal'; unit: string } | null
export type Confirm = 'end' | 'replace' | null
export type SaveRead = { kind: 'none' } | { kind: 'ok'; save: import('../engine/save').SaveEnvelope } | { kind: 'bad'; reason: string }

export interface GameStore {
  screen: Screen
  settings: Settings
  setup: Setup | null
  state: State | null
  actions: Action[]
  /** the state the board shows: the Warden's view as of the last animated event */
  presented: View | null
  fx: Fx[]
  animating: boolean
  log: LogLine[]
  kills: number
  timerLeft: number
  timerMax: number
  selected: string | null
  armed: Armed
  hover: Pos | null
  inspect: Pos | null
  prompt: Prompt
  confirm: Confirm
  menu: boolean
  notice: string
  storageError: string
  saveRead: SaveRead
  howTo: boolean
  settingsOpen: boolean
  /** the difficulty picked on the Briefing for the next mission */
  difficulty: Tier
  /** a URL override: the random bot, or a tier that beats the Briefing's choice */
  botOverride: 'random' | Tier | null
}

export const useStore = create<GameStore>(() => ({
  screen: 'title',
  settings: { speed: 'normal', timer: 'standard' },
  setup: null,
  state: null,
  actions: [],
  presented: null,
  fx: [],
  animating: false,
  log: [],
  kills: 0,
  timerLeft: 0,
  timerMax: 0,
  selected: null,
  armed: null,
  hover: null,
  inspect: null,
  prompt: null,
  confirm: null,
  menu: false,
  notice: '',
  storageError: '',
  saveRead: { kind: 'none' },
  howTo: false,
  settingsOpen: false,
  difficulty: 'regular',
  botOverride: null,
}))

export const getStore = (): GameStore => useStore.getState()
export const setStore = (p: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)): void => useStore.setState(p)
