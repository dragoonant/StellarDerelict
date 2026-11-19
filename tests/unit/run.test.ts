// The boarding run (spec 10 section 15), the roster option (R-2), the command-point event (C-2) and the mission plan the Warden
// policies read from any mission (spec 40 "Any mission").
import { describe, expect, it } from 'vitest'
import { getMission, listMissions, rules, runDef } from '../../src/data'
import { createGame, legalActions, replay, step, view } from '../../src/engine'
import type { Action, Event, State } from '../../src/engine'
import { makeRand } from '../../src/ai/random'
import { missionPlan, moltPolicy } from '../../src/ai/scripted'
import { wardenPolicy } from '../../src/ai/warden'
import { afterMission, missionSeed, newRun, tally } from '../../src/client/run'
import { checkInvariants } from '../../tools/invariants'
import { ok, start } from './helpers'

const finished = (s: State, winner: 'warden' | 'molt', alive: string[]): State => ({
  ...s,
  result: { winner, reason: winner === 'warden' ? 'core-out' : 'squad-lost' },
  toAct: null,
  units: s.units.map((u) => (u.kind === 'warden' ? { ...u, alive: alive.includes(u.id) } : u)),
})

describe('the boarding run', () => {
  it('R-1 a new run lists the missions of run.json in order and boards the whole squad', () => {
    const run = newRun('regular', 7)
    expect(run.missions).toEqual(runDef.missions)
    expect(run.index).toBe(0)
    expect(run.roster).toEqual(getMission(runDef.missions[0] as string)?.squad.map((q) => q.id))
    expect(run.status).toBe('open')
  })

  it('R-2 the survivors of a won mission board the next one, with their plating repaired', () => {
    const run = newRun('veteran', 7)
    const s = createGame({ mission: 'dead-reckoning', seed: 1 })
    const after = afterMission(run, finished(s, 'warden', ['venn', 'sato', 'riedel']), 9)
    expect(after.status).toBe('open')
    expect(after.index).toBe(1)
    expect(after.roster).toEqual(['venn', 'riedel', 'sato'])
    expect(after.results).toHaveLength(1)
    expect(after.results[0]).toMatchObject({ mission: 'dead-reckoning', won: true, lost: ['brandt', 'okafor'], kills: 9 })
    const next = createGame({ mission: after.missions[1] as string, seed: missionSeed(after, 1), options: { roster: after.roster, difficulty: after.difficulty } })
    const ws = next.units.filter((u) => u.kind === 'warden')
    expect(ws.map((u) => u.id)).toEqual(['venn', 'riedel', 'sato'])
    expect(ws.every((u) => u.kind === 'warden' && !u.breached && u.alive)).toBe(true)
  })

  it('R-2 the roster option keeps squad order, ignores unknown ids and never empties the squad', () => {
    const s = createGame({ mission: 'dead-reckoning', seed: 1, options: { roster: ['sato', 'venn', 'ghost'] } })
    expect(s.units.filter((u) => u.kind === 'warden').map((u) => u.id)).toEqual(['venn', 'sato'])
    const empty = createGame({ mission: 'dead-reckoning', seed: 1, options: { roster: ['nobody'] } })
    expect(empty.units.filter((u) => u.kind === 'warden')).toHaveLength(5)
    // E-5: a reduced squad replays from its setup
    const setup = { mission: 'dead-reckoning', seed: 3, options: { roster: ['venn', 'brandt'] } }
    let live = createGame(setup)
    const acts: Action[] = []
    for (let i = 0; i < 12 && !live.result; i++) {
      const a = legalActions(live)[0] as Action
      acts.push(a)
      live = ok(live, a).s
    }
    expect(replay(setup, acts)).toStrictEqual(live)
  })

  it('R-3 a lost mission ends the run; so does a squad below rules.run.minSquad', () => {
    const run = newRun('regular', 7)
    const s = createGame({ mission: 'dead-reckoning', seed: 1 })
    expect(afterMission(run, finished(s, 'molt', ['venn']), 0).status).toBe('lost')
    const thin = afterMission(run, finished(s, 'warden', ['venn']), 4)
    expect(rules.run.minSquad).toBe(2)
    expect(thin.status).toBe('pulled-out')
    expect(thin.roster).toEqual(['venn'])
  })

  it('R-4 a win on the last mission completes the run and the tally sums every mission', () => {
    let run = newRun('regular', 7)
    const s = createGame({ mission: 'dead-reckoning', seed: 1 })
    run = afterMission(run, finished(s, 'warden', ['venn', 'brandt', 'okafor', 'riedel', 'sato']), 5)
    run = afterMission(run, finished({ ...s, mission: 'cold-berth', round: 9 }, 'warden', ['venn', 'brandt', 'okafor', 'sato']), 7)
    run = afterMission(run, finished({ ...s, mission: 'last-light', round: 12 }, 'warden', ['venn', 'sato']), 11)
    expect(run.status).toBe('complete')
    expect(tally(run)).toEqual({ missionsWon: 3, missions: 3, wardensLost: 0 + 1 + 3, kills: 23, rounds: 1 + 9 + 12 })
  })

  it('R-5 mission seeds derive from the run seed and differ per mission', () => {
    const run = newRun('regular', 99)
    const seeds = run.missions.map((_, i) => missionSeed(run, i))
    expect(new Set(seeds).size).toBe(seeds.length)
    expect(seeds).toEqual(run.missions.map((_, i) => missionSeed(newRun('veteran', 99), i)))
    expect(seeds[0]).not.toBe(missionSeed(newRun('regular', 100), 0))
  })
})

describe('C-2 command points spent', () => {
  it('cpSpent reports the CP a Warden action drew, and the CP left; AP-only actions report nothing', () => {
    const s0 = start({ grid: ['###########', '#A........#', '###########'], squad: [['a', 'warden', 1, 1, 'E']] }, { cp: 2 })
    const r1 = ok(s0, { type: 'move', unit: 'a', to: [2, 1] })
    expect(r1.ev.some((e) => e.type === 'cpSpent')).toBe(false)
    // four AP spent, the fifth step is paid from CP
    let s = r1.s
    for (const x of [3, 4, 5]) s = ok(s, { type: 'move', unit: 'a', to: [x, 1] }).s
    const r = ok(s, { type: 'move', unit: 'a', to: [6, 1] })
    const ev = r.ev.find((e): e is Extract<Event, { type: 'cpSpent' }> => e.type === 'cpSpent')
    expect(ev).toEqual({ type: 'cpSpent', unit: 'a', cp: 1, left: 1 })
    expect(r.s.cp).toBe(1)
  })
})

describe('the missions of the run', () => {
  it('every mission has an objective in its own words and plays through with the sim policies and the invariants', () => {
    for (const m of listMissions()) {
      expect(m.objective.item.length).toBeGreaterThan(2)
      expect(m.objective.place.length).toBeGreaterThan(2)
      let s = createGame({ mission: m.id, seed: 11 })
      const rand = makeRand(11)
      for (let n = 0; n < 3000 && !s.result; n++) {
        const b = view(s, s.toAct as 'warden' | 'molt')
        const a = s.toAct === 'warden' ? wardenPolicy(b, rand) : moltPolicy(b, rand)
        const r = step(s, a)
        expect(r.ok, `${m.id} ${JSON.stringify(a)}: ${r.ok ? '' : r.error}`).toBe(true)
        if (!r.ok) break
        s = r.state
        if (n % 10 === 0) expect(checkInvariants(s), m.id).toEqual([])
      }
      expect(s.result, m.id).not.toBeNull()
    }
  })

  it('spec 40 "Any mission": the mission plan finds the lock, the flank terminal and the slots from the data', () => {
    const dr = missionPlan(view(createGame({ mission: 'dead-reckoning', seed: 1 }), 'warden'))
    expect(dr.lockTerminal).toBe('archive-lock')
    expect(dr.sealedDoors).toEqual([[14, 4]])
    expect(dr.flankTerminal).toBe('flank-doors')
    expect(dr.flankDoors).toEqual([[10, 6], [18, 6], [23, 14]])
    expect(dr.arms).toHaveLength(4)
    expect(dr.core).toEqual(dr.arms)
    const ll = missionPlan(view(createGame({ mission: 'last-light', seed: 1 }), 'warden'))
    expect(ll.lockTerminal).toBe('reactor-lock')
    expect(ll.sealedDoors).toEqual([[14, 5], [14, 10]])
    // Last Light has no second bulkhead terminal: no flank stage, and the console stage follows in file
    expect(ll.flankTerminal).toBeNull()
    expect(ll.flankDoors).toEqual([])
    expect(ll.core).toEqual([])
    const cb = missionPlan(view(createGame({ mission: 'cold-berth', seed: 1 }), 'warden'))
    expect(cb.lockTerminal).toBe('berth-lock')
    expect(cb.flankTerminal).toBe('gallery-doors')
    expect(cb.flankDoors).toHaveLength(4)
    // a map with no terminals: no lock, no flanks, no slots, and the policy still acts
    const bare = start({ grid: ['#########', '#A.....X#', '#########'], squad: [['a', 'warden', 1, 1, 'E']] })
    const plan = missionPlan(view(bare, 'warden'))
    expect(plan).toMatchObject({ lockTerminal: null, flankTerminal: null, flankDoors: [], arms: [] })
    expect(wardenPolicy(view(bare, 'warden'), makeRand(1)).type).toBe('move')
  })

  it('E-7 on the Molt seat the view carries each contact\'s stalker count and the Warden seat\'s never does', () => {
    const s = createGame({ mission: 'cold-berth', seed: 5 })
    const molt = view(s, 'molt')
    const warden = view(s, 'warden')
    const pings = molt.units.filter((u) => u.kind === 'ping')
    expect(pings.length).toBeGreaterThan(0)
    for (const p of pings) expect(typeof (p as { stalkers?: number }).stalkers).toBe('number')
    for (const p of warden.units.filter((u) => u.kind === 'ping')) expect('stalkers' in p).toBe(false)
  })
})
