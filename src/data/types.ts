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

export interface Mission {
  id: string
  name: string
  wreck: string
  brief: string
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
