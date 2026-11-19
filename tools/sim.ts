import { deepStrictEqual } from 'node:assert'
import { readFileSync } from 'node:fs'
import { makeRand } from '../src/ai/random'
import { listMissions, getMission, registerMission } from '../src/data'
import type { Mission } from '../src/data'
import { createGame, legalActions, query, step, view } from '../src/engine'
import type { Action, Board, State } from '../src/engine'
import { checkInvariants } from './invariants'
import { moltPolicy } from '../src/ai/scripted'
import { wardenPolicy } from '../src/ai/warden'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback
}

const games = Number(arg('games', '100'))
const seed0 = Number(arg('seed', '1'))
const missionId = arg('mission', 'dead-reckoning')
const checkEvery = Number(arg('check-every', '8'))
// --roster venn,sato,riedel: the squad members who board (a run's survivors, R-2)
const roster = arg('roster', '')
const STALL = 3000
if (!getMission(missionId)) {
  console.error(`unknown mission ${missionId}; known: ${listMissions().map((m) => m.id).join(', ')}`)
  process.exit(2)
}
// --override '{"arrivals":{"normal":3},"roundLimit":20}': try mission numbers without editing the file (balance rows, spec 10 section 13)
const override = arg('override', '')
const overrideFile = arg('override-file', '')
if (override || overrideFile) {
  const base = getMission(missionId) as Mission
  const patch = JSON.parse(overrideFile ? readFileSync(overrideFile, 'utf8') : override) as Partial<Mission>
  registerMission({ ...structuredClone(base), ...patch, arrivals: { ...base.arrivals, ...(patch.arrivals ?? {}) } })
  console.log(`override: ${override || overrideFile}`)
}

const reasons: Record<string, number> = {}
let wardenWins = 0
let violations = 0
let stalls = 0
let rejected = 0
let totalActions = 0
let totalRounds = 0
let coreTaken = 0
const violationSamples: string[] = []
const t0 = Date.now()
const key = (a: Action): string => JSON.stringify(a)

for (let g = 0; g < games; g++) {
  const seed = seed0 + g
  let s: State = createGame(roster ? { mission: missionId, seed, options: { roster: roster.split(',') } } : { mission: missionId, seed })
  const rand = makeRand(seed)
  let n = 0
  const note = (msg: string): void => {
    violations++
    if (violationSamples.length < 10) violationSamples.push(`seed ${seed} action ${n}: ${msg}`)
  }
  while (!s.result) {
    if (n >= STALL) {
      stalls++
      break
    }
    const board: Board = view(s, s.toAct as 'warden' | 'molt')
    const a = s.toAct === 'warden' ? wardenPolicy(board, rand) : moltPolicy(board, rand)
    if (n % checkEvery === 0) {
      const legal = legalActions(s)
      if (legal.length === 0) note('legalActions empty')
      if (!legal.some((x) => key(x) === key(a))) note(`policy chose an action not in legalActions: ${key(a)}`)
      for (let i = 0; i < 6 && legal.length; i++) {
        const pick = legal[Math.floor(rand() * legal.length)] as Action
        const r = step(s, pick)
        if (!r.ok) note(`legal action rejected: ${key(pick)} (${r.error})`)
      }
    }
    const r = step(s, a)
    if (!r.ok) {
      rejected++
      note(`policy action rejected: ${key(a)} (${r.error})`)
      break
    }
    s = r.state
    n++
    for (const v of checkInvariants(s)) note(v)
  }
  totalActions += n
  totalRounds += s.round
  if (s.core.where !== 'console') coreTaken++
  if (s.result) {
    reasons[`${s.result.winner}:${s.result.reason}`] = (reasons[`${s.result.winner}:${s.result.reason}`] ?? 0) + 1
    if (s.result.winner === 'warden') wardenWins++
  }
}
void query

const pct = (n: number): string => ((100 * n) / games).toFixed(1)
console.log(`\nStellar Derelict sim: ${missionId}, ${games} games, seeds ${seed0}..${seed0 + games - 1}`)
console.log('| Measure | Value |')
console.log('|---|---|')
console.log(`| Warden wins | ${wardenWins} (${pct(wardenWins)}%) |`)
console.log(`| Molt wins | ${games - wardenWins - stalls} (${pct(games - wardenWins - stalls)}%) |`)
for (const [k, v] of Object.entries(reasons).sort()) console.log(`| ${k} | ${v} (${pct(v)}%) |`)
console.log(`| Core taken | ${coreTaken} (${pct(coreTaken)}%) |`)
console.log(`| Avg rounds | ${(totalRounds / games).toFixed(1)} |`)
console.log(`| Avg actions | ${(totalActions / games).toFixed(0)} |`)
console.log(`| Invariant violations | ${violations} |`)
console.log(`| Stalls (>${STALL} actions) | ${stalls} |`)
console.log(`| Rejected policy actions | ${rejected} |`)
console.log(`| Seconds | ${((Date.now() - t0) / 1000).toFixed(1)} |`)
for (const v of violationSamples) console.log('VIOLATION', v)
void deepStrictEqual
process.exit(violations > 0 || stalls > 0 ? 1 : 0)
