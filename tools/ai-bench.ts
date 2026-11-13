/**
 * AI gate (spec 40): scripted Wardens against each Molt tier and the random Molt, seeds 1..N, invariants on after every action.
 *   npm run bench:ai -- --games 400 [--tiers random,recruit,regular,veteran] [--seed 1] [--jobs 4] [--no-gates]
 * Games run in worker threads; the decision timer is the only clock in the repo that the AI never sees.
 */
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { makeRand, randomAction } from '../src/ai/random'
import { wardenPolicy } from '../src/ai/warden'
import { chooseMoltAction, type Tier } from '../src/ai/tiers'
import { aiStats } from '../src/ai/molt/utility'
import { createGame, step, view } from '../src/engine'
import type { Action, Board, State } from '../src/engine'
import { checkInvariants } from './invariants'

type Side = Tier | 'random'
const STALL = 3000

interface GameResult {
  tier: Side
  seed: number
  winner: 'warden' | 'molt' | 'none'
  reason: string
  rounds: number
  actions: number
  violations: number
  samples: string[]
  stalled: boolean
  fallbacks: number
  decisions: number
  ms: number
  maxMs: number
  gameMs: number
}

function playGame(tier: Side, seed: number, mission: string): GameResult {
  const t0 = performance.now()
  let s: State = createGame({ mission, seed })
  const rand = makeRand(seed)
  const f0 = aiStats.fallbacks
  let n = 0
  let violations = 0
  let decisions = 0
  let ms = 0
  let maxMs = 0
  let stalled = false
  const samples: string[] = []
  while (!s.result) {
    if (n >= STALL) {
      stalled = true
      break
    }
    let a: Action
    if (s.toAct === 'warden') a = wardenPolicy(view(s, 'warden') as Board, rand)
    else {
      const t = performance.now()
      if (tier === 'random') a = randomAction(view(s, 'molt'), 'molt', rand) as Action
      else a = chooseMoltAction(s, tier, (seed + n * 7919) >>> 0)
      const dt = performance.now() - t
      decisions++
      ms += dt
      if (dt > maxMs) maxMs = dt
    }
    const r = step(s, a)
    if (!r.ok) {
      violations++
      if (samples.length < 5) samples.push(`seed ${seed} ${tier}: rejected ${JSON.stringify(a)} (${r.error})`)
      break
    }
    s = r.state
    n++
    for (const v of checkInvariants(s)) {
      violations++
      if (samples.length < 5) samples.push(`seed ${seed} ${tier} action ${n}: ${v}`)
    }
  }
  return {
    tier,
    seed,
    winner: s.result ? s.result.winner : 'none',
    reason: s.result ? s.result.reason : 'stall',
    rounds: s.round,
    actions: n,
    violations,
    samples,
    stalled,
    fallbacks: aiStats.fallbacks - f0,
    decisions,
    ms,
    maxMs,
    gameMs: performance.now() - t0,
  }
}

if (!isMainThread) {
  const job = workerData as { tier: Side; seeds: number[]; mission: string }
  const out: GameResult[] = []
  for (const seed of job.seeds) {
    const r = playGame(job.tier, seed, job.mission)
    out.push(r)
    parentPort?.postMessage({ progress: 1 })
  }
  parentPort?.postMessage({ done: out })
} else {
  void main()
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback
}

async function runTier(tier: Side, seeds: number[], jobs: number, mission: string): Promise<GameResult[]> {
  const chunks: number[][] = Array.from({ length: jobs }, () => [])
  seeds.forEach((s, i) => (chunks[i % jobs] as number[]).push(s))
  const file = fileURLToPath(import.meta.url)
  const parts = await Promise.all(
    chunks
      .filter((c) => c.length > 0)
      .map(
        (seedsChunk) =>
          new Promise<GameResult[]>((resolve, reject) => {
            const w = new Worker(file, { workerData: { tier, seeds: seedsChunk, mission } })
            w.on('message', (m: { done?: GameResult[] }) => {
              if (m.done) resolve(m.done)
            })
            w.on('error', reject)
            w.on('exit', (code) => {
              if (code !== 0) reject(new Error(`bench worker exited with ${code}`))
            })
          }),
      ),
  )
  return parts.flat()
}

interface Row {
  tier: Side
  games: number
  moltWins: number
  rounds: number
  reasons: Record<string, number>
  fallbacks: number
  violations: number
  stalls: number
  avgMs: number
  maxMs: number
  gameS: number
  samples: string[]
}

function summarise(tier: Side, rs: GameResult[]): Row {
  const reasons: Record<string, number> = {}
  let dec = 0
  let ms = 0
  const row: Row = { tier, games: rs.length, moltWins: 0, rounds: 0, reasons, fallbacks: 0, violations: 0, stalls: 0, avgMs: 0, maxMs: 0, gameS: 0, samples: [] }
  for (const r of rs) {
    if (r.winner === 'molt') row.moltWins++
    row.rounds += r.rounds
    reasons[`${r.winner}:${r.reason}`] = (reasons[`${r.winner}:${r.reason}`] ?? 0) + 1
    row.fallbacks += r.fallbacks
    row.violations += r.violations
    if (r.stalled) row.stalls++
    dec += r.decisions
    ms += r.ms
    row.maxMs = Math.max(row.maxMs, r.maxMs)
    row.gameS += r.gameMs / 1000
    row.samples.push(...r.samples)
  }
  row.avgMs = dec ? ms / dec : 0
  return row
}

async function main(): Promise<void> {
  const games = Number(arg('games', '400'))
  const seed0 = Number(arg('seed', '1'))
  const mission = arg('mission', 'dead-reckoning')
  const jobs = Math.max(1, Number(arg('jobs', String(Math.min(4, availableParallelism())))))
  const sides = arg('tiers', 'random,recruit,regular,veteran').split(',') as Side[]
  const gates = !process.argv.includes('--no-gates')
  const seeds = Array.from({ length: games }, (_, i) => seed0 + i)
  const rows = new Map<Side, Row>()
  const t0 = Date.now()
  for (const tier of sides) {
    const rs = await runTier(tier, seeds, jobs, mission)
    const row = summarise(tier, rs)
    rows.set(tier, row)
    console.error(`  ${tier}: ${row.games} games, Molt ${((100 * row.moltWins) / row.games).toFixed(1)}% (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  }
  const pct = (r: Row): number => (100 * r.moltWins) / r.games
  console.log(`\nStellar Derelict AI bench: ${mission}, ${games} games per side, seeds ${seed0}..${seed0 + games - 1}, scripted Wardens`)
  console.log('| Molt | Molt win % | Avg rounds | Reasons | Fallbacks | Avg ms | Max ms | s/game | Violations | Stalls |')
  console.log('|---|---|---|---|---|---|---|---|---|---|')
  for (const tier of sides) {
    const r = rows.get(tier) as Row
    const reasons = Object.entries(r.reasons)
      .sort()
      .map(([k, v]) => `${k} ${((100 * v) / r.games).toFixed(0)}%`)
      .join(', ')
    console.log(
      `| ${tier} | ${pct(r).toFixed(1)} | ${(r.rounds / r.games).toFixed(1)} | ${reasons} | ${r.fallbacks} | ${r.avgMs.toFixed(2)} | ${r.maxMs.toFixed(0)} | ${(r.gameS / r.games).toFixed(2)} | ${r.violations} | ${r.stalls} |`,
    )
  }
  for (const r of rows.values()) for (const v of r.samples.slice(0, 5)) console.log('VIOLATION', v)
  if (!gates) return
  const fails: string[] = []
  const get = (t: Side): Row | undefined => rows.get(t)
  const vet = get('veteran')
  const reg = get('regular')
  const rec = get('recruit')
  const rnd = get('random')
  const check = (ok: boolean, msg: string): void => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
    if (!ok) fails.push(msg)
  }
  if (vet && reg) check(pct(vet) >= pct(reg) + 10, `veteran ${pct(vet).toFixed(1)}% >= regular ${pct(reg).toFixed(1)}% + 10`)
  if (rec && reg) check(pct(rec) <= pct(reg) - 10, `recruit ${pct(rec).toFixed(1)}% <= regular ${pct(reg).toFixed(1)}% - 10`)
  if (rec && rnd) check(pct(rec) >= pct(rnd) + 15, `recruit ${pct(rec).toFixed(1)}% >= random ${pct(rnd).toFixed(1)}% + 15`)
  if (vet) {
    check(vet.fallbacks === 0, `veteran fallbacks ${vet.fallbacks} = 0`)
    check(vet.avgMs <= 30, `veteran average decision ${vet.avgMs.toFixed(2)} ms <= 30`)
  }
  if (rec && reg && rnd && pct(rnd) > pct(reg) - 25)
    console.log(
      `NOTE  the two recruit gates need random <= regular - 25 (recruit is capped at ${(pct(reg) - 10).toFixed(1)}% and floored at ${(pct(rnd) + 15).toFixed(1)}%); measured random ${pct(rnd).toFixed(1)}% vs regular ${pct(reg).toFixed(1)}%: the scripted Wardens lose to the random Molt's clutter by running out of clock`,
    )
  const viol = [...rows.values()].reduce((a, r) => a + r.violations, 0)
  const stalls = [...rows.values()].reduce((a, r) => a + r.stalls, 0)
  check(viol === 0, `invariant violations ${viol} = 0`)
  check(stalls === 0, `stalls ${stalls} = 0`)
  process.exit(fails.length ? 1 : 0)
}
