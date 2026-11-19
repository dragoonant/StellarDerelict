import type { Facing, Pos, Role, Seat } from '../data/types'

export type { Facing, Pos, Role, Seat }

/**
 * Mission options (spec 00). `difficulty` is the Molt AI tier the client plays; `seat` is the side the person plays
 * (Wardens when absent); `roster` lists the squad members who board (the whole squad when absent: the boarding run, R-2).
 */
export type SetupOptions = {
  difficulty?: string
  seat?: Seat
  roster?: string[]
  [key: string]: unknown
}

export interface Setup {
  mission: string
  seed: number
  options?: SetupOptions
}

export interface WardenUnit {
  id: string
  kind: 'warden'
  name: string
  role: Role
  at: Pos
  facing: Facing
  ap: number
  heat: number
  watch: boolean
  breached: boolean
  alive: boolean
  charges: number
}
export interface StalkerUnit {
  id: string
  kind: 'stalker'
  at: Pos
  ap: number
}
export interface PingUnit {
  id: string
  kind: 'ping'
  at: Pos
  ap: number
  /** hidden from the Warden seat */
  stalkers: number
}
/** A ping as the Warden seat sees it: no stalker count. */
export interface PingView {
  id: string
  kind: 'ping'
  at: Pos
  ap: number
  stalkers?: number
}
export type Unit = WardenUnit | StalkerUnit | PingUnit
export type ViewUnit = WardenUnit | StalkerUnit | PingView

export interface DoorState {
  open: boolean
  sealed: boolean
  torn: boolean
}

export interface CoreState {
  where: 'console' | 'carried' | 'loose'
  /** square while in the console or loose; null while carried */
  at: Pos | null
  carrier: string | null
}

export interface RngState {
  s: [number, number, number, number]
  /** test hook: dice consumed before the generator (plain JSON, empty in real play) */
  queue: number[]
}

export interface Pending {
  kind: 'arrive'
  remaining: number
}

export interface GameResult {
  winner: Seat
  reason: 'core-out' | 'squad-lost' | 'time'
}

export interface State {
  mission: string
  seed: number
  round: number
  phase: Seat
  toAct: Seat | null
  pending: Pending | null
  /** Warden command points this phase */
  cp: number
  /** CP held for the Molt phase (C-3) */
  heldCp: number
  units: Unit[]
  /** keyed "x,y" */
  doors: Record<string, DoorState>
  burn: Pos[]
  lit: string[]
  purgedDucts: Pos[]
  usedTerminals: string[]
  core: CoreState
  /** round in which the core was taken, or null */
  coreRound: number | null
  heldOver: number
  /** ping bag, remaining draws (hidden) */
  bag: number[]
  nextId: number
  rng: RngState
  result: GameResult | null
}

/** What the readers (legalActions, query, AI) need: a State or a View. */
export type Board = Omit<State, 'rng' | 'bag' | 'units'> & { units: ViewUnit[]; bag?: number[] }
export type View = Board

export type DoorOp = 'open' | 'closed' | 'sealed' | 'torn'
export type TerminalOp = 'seal' | 'unseal' | 'lights' | 'purge'

export type Action =
  | { type: 'move'; unit: string; to: Pos }
  | { type: 'turn'; unit: string; facing: Facing }
  | { type: 'door'; unit: string; door: Pos }
  | { type: 'fire'; unit: string; target: string }
  | { type: 'vent'; unit: string }
  | { type: 'watch'; unit: string }
  | { type: 'scorch'; unit: string; at: Pos }
  | { type: 'melee'; unit: string; target: string }
  | { type: 'terminal'; unit: string; terminal: string; op: TerminalOp; door?: Pos }
  | { type: 'takeCore'; unit: string }
  | { type: 'reveal'; unit: string }
  | { type: 'tear'; unit: string; door: Pos }
  | { type: 'arrive'; duct: Pos }
  | { type: 'endPhase' }

export type Event =
  | { type: 'phaseStarted'; seat: Seat; round: number; cp?: number }
  | { type: 'moved'; unit: string; from: Pos; to: Pos }
  | { type: 'turned'; unit: string; facing: Facing }
  | { type: 'doorChanged'; door: Pos; state: DoorOp }
  | {
      type: 'fired'
      unit: string
      target: string
      dice: number[]
      need: number
      hit: boolean
      heat: number
      watch: boolean
    }
  | { type: 'locked'; unit: string }
  /** C-2: command points paid for this Warden's action (the shortfall and any flat CP) */
  | { type: 'cpSpent'; unit: string; cp: number; left: number }
  | { type: 'vented'; unit: string; heldCp: boolean }
  | { type: 'watchSet'; unit: string }
  | { type: 'watchEnded'; unit: string; why: 'phase' | 'acted' | 'attacked' | 'locked' | 'destroyed' }
  | {
      type: 'scorched'
      unit: string
      at: Pos
      burst: Pos[]
      rolls: { unit: string; die: number; hit: boolean }[]
    }
  | { type: 'burnCleared' }
  | {
      type: 'meleeFought'
      attacker: string
      defender: string
      attackerRoll: number
      defenderRoll: number
      attackerDice: number[]
      defenderDice: number[]
      flank: boolean
      outcome: 'attacker' | 'defender' | 'tie'
    }
  | { type: 'breached'; unit: string }
  | { type: 'destroyed'; unit: string; kind: 'warden' | 'stalker' | 'ping'; at: Pos; by: string }
  | { type: 'pingArrived'; unit: string; duct: Pos }
  | { type: 'pingHeld' }
  | {
      type: 'revealed'
      ping: string
      at: Pos
      stalkers: number
      lost: number
      forced: boolean
      units: { id: string; at: Pos }[]
    }
  | { type: 'tearRolled'; unit: string; door: Pos; die: number; torn: boolean }
  | { type: 'terminalUsed'; unit: string; terminal: string; op: TerminalOp; door?: Pos }
  | { type: 'lit'; section: string }
  | { type: 'purged'; section: string; ducts: Pos[] }
  | { type: 'coreTaken'; unit: string }
  | { type: 'coreDropped'; at: Pos }
  | { type: 'corePicked'; unit: string }
  | { type: 'alarm' }
  | { type: 'roundEnded'; round: number }
  | { type: 'gameOver'; winner: Seat; reason: GameResult['reason'] }

export type StepResult =
  | { ok: true; state: State; events: Event[] }
  | { ok: false; state: State; error: string }
