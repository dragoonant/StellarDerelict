// The client store: what the screens and the board read. Rules live in the engine; this holds the session around it.
import { create } from 'zustand'
import type { Action, Pos, Seat, Setup, State, View } from '../engine'
import type { Tier } from '../ai/tiers'
import type { RunState } from './run'

export type Screen = 'title' | 'missions' | 'briefing' | 'mission' | 'debrief'
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

/** One Warden's tally for the debrief (spec 50 "Debrief"); every count comes from engine events. */
export interface WardenTally {
  shots: number
  hits: number
  watchShots: number
  kills: number
  meleeWins: number
  meleeLosses: number
  scorches: number
  terminals: number
  cp: number
  breached: boolean
  lost: boolean
}

export interface MissionStats {
  byWarden: Record<string, WardenTally>
  /** Molt units destroyed by any cause */
  kills: number
  /** stalkers destroyed by the purge */
  purged: number
  pingsResolved: number
  stalkersRevealed: number
  /** pings forced into the open by a Warden's sight */
  exposed: number
  doorsTorn: number
  cpSpent: number
}

export const emptyTally = (): WardenTally => ({ shots: 0, hits: 0, watchShots: 0, kills: 0, meleeWins: 0, meleeLosses: 0, scorches: 0, terminals: 0, cp: 0, breached: false, lost: false })
export const emptyStats = (): MissionStats => ({ byWarden: {}, kills: 0, purged: 0, pingsResolved: 0, stalkersRevealed: 0, exposed: 0, doorsTorn: 0, cpSpent: 0 })

export type ArmKind = 'fire' | 'scorch' | 'melee' | 'tear' | 'door'
export type Armed = { kind: ArmKind; unit: string } | null
export type Prompt = { kind: 'terminal'; unit: string } | null
export type Confirm = 'end' | 'replace' | null
export type SaveRead = { kind: 'none' } | { kind: 'ok'; save: import('../engine/save').SaveEnvelope } | { kind: 'bad'; reason: string }

export interface GameStore {
  screen: Screen
  settings: Settings
  setup: Setup | null
  state: State | null
  actions: Action[]
  /** the state the board shows: the player's view as of the last animated event */
  presented: View | null
  /** the side the person plays in the live mission (spec 50 "The Molt seat") */
  seat: Seat
  fx: Fx[]
  animating: boolean
  log: LogLine[]
  kills: number
  stats: MissionStats
  timerLeft: number
  timerMax: number
  selected: string | null
  armed: Armed
  hover: Pos | null
  inspect: Pos | null
  /** visor mode: the camera rides the selected Warden's helmet (spec 50 "Visor") */
  visor: boolean
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
  /** the mission and the seat picked on the Missions screen for the next single mission */
  missionPick: string
  seatPick: Seat
  /** the boarding run in progress (spec 10 section 15), or null for a single mission */
  run: RunState | null
  /** a run waiting on the title between missions, read from storage */
  runRead: RunState | null
}

export const useStore = create<GameStore>(() => ({
  screen: 'title',
  settings: { speed: 'normal', timer: 'standard' },
  setup: null,
  state: null,
  actions: [],
  presented: null,
  seat: 'warden',
  fx: [],
  animating: false,
  log: [],
  kills: 0,
  stats: emptyStats(),
  timerLeft: 0,
  timerMax: 0,
  selected: null,
  armed: null,
  hover: null,
  inspect: null,
  visor: false,
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
  missionPick: 'dead-reckoning',
  seatPick: 'warden',
  run: null,
  runRead: null,
}))

export const getStore = (): GameStore => useStore.getState()
export const setStore = (p: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)): void => useStore.setState(p)
