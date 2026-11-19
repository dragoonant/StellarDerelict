export type Pos = [number, number]
export type Facing = 'N' | 'E' | 'S' | 'W'
export type Seat = 'warden' | 'molt'
export type Role = 'sergeant' | 'warden' | 'scorcher' | 'tech'
export type Terrain = 'wall' | 'floor' | 'airlock' | 'duct' | 'door' | 'bulkhead' | 'terminal' | 'console'
/** [x1, y1, x2, y2], inclusive */
export type Rect = [number, number, number, number]

export interface Rules {
  wardenAp: number
  stalkerAp: number
  pingAp: number
  cpBase: number
  cpDie: number
  cpSergeant: number
  heldCpMax: number
  cost: {
    forward: number
    back: number
    turn: number
    door: number
    fire: number
    vent: number
    watch: number
    scorch: number
    melee: number
    terminal: number
    takeCore: number
  }
  terminalCp: number
  repeater: {
    dice: number
    closeRange: number
    closeTarget: number
    farTarget: number
    maxRange: number
    heatLock: number
    coolPerRound: number
    heldCpHeat: number
  }
  litBonus: number
  scorcher: { range: number; charges: number; killOn: number }
  melee: { stalkerDice: number; stalkerBonus: number; sergeantBonus: number; flankPenalty: number }
  stalker: { moveCost: number; doorCost: number; tearCost: number; tearOn: number }
  ductWatchRadius: number
  revealRadius: number
  timer: { base: number; perWarden: number }
  /** the boarding run (spec 10 section 15): the squad pulls out below this many living Wardens (R-3) */
  run: { minSquad: number }
}

export type RoleFlag = 'cpBonus' | 'meleeBonus' | 'noWatch' | 'freeTerminal'

export interface RoleDef {
  label: string
  weapon: 'repeater' | 'scorcher'
  flags: RoleFlag[]
}

export interface TerminalDef {
  id: string
  name: string
  at: Pos
  system: 'bulkheads' | 'purge' | 'lights'
  doors?: Pos[]
  section?: string
  ducts?: Pos[]
}

export interface SquadDef {
  id: string
  name: string
  role: Role
  at: Pos
  facing: Facing
}

/** A square and the facing to hold on it: a formation slot the Warden policy may be given (spec 40). */
export type Slot = [number, number, Facing]

/** Hints for the Warden policy only; no rule reads them. Missing lists fall back to the policy's generic goals. */
export interface AiHints {
  /** where the escorts stand while the flank bulkheads are sealed */
  staging?: Slot[]
  /** where the escorts stand while the lock terminal is worked (and the console, unless `core` is given) */
  arms?: Slot[]
  /** where the escorts stand while the console is worked; an empty list means: follow the operator in file */
  core?: Slot[]
  /** deep airlock squares the escorts clear into when the carrier comes home */
  deep?: Slot[]
}

export interface Objective {
  /** what the console holds, in the mission's words ("navigation core") */
  item: string
  /** where the console is ("archive") */
  place: string
  /** the squad's way out ("aft airlock") */
  exit: string
}

export interface Mission {
  id: string
  name: string
  wreck: string
  brief: string
  /** the mission's words for the core, the console's room and the exit (the engine's names stay core, console, airlock) */
  objective: Objective
  aiHints?: AiHints
  legend: Record<string, string>
  grid: string[]
  sealed: Pos[]
  terminals: TerminalDef[]
  sections: Record<string, Rect[]>
  squad: SquadDef[]
  startPings: Pos[]
  arrivals: { normal: number; alarm: number }
  roundLimit: number
  pingBag: number[]
}
