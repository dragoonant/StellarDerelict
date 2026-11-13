import { describe, expect, it } from 'vitest'
import { makeRand, randomAction } from '../../src/ai/random'
import { registerMission, unregisterMission, getMission } from '../../src/data'
import { createGame, replay, step, view } from '../../src/engine'
import type { Action, Setup, State } from '../../src/engine'
import { makeSave, readSave, writeSave } from '../../src/engine/save'
import { start } from './helpers'

const setup: Setup = { mission: 'dead-reckoning', seed: 4 }

function play(s: State, rand: () => number, n: number): { s: State; actions: Action[] } {
  const actions: Action[] = []
  for (let i = 0; i < n && !s.result; i++) {
    const a = randomAction(view(s, s.toAct as 'warden'), s.toAct as 'warden', rand) as Action
    const r = step(s, a)
    if (!r.ok) throw new Error(r.error)
    s = r.state
    actions.push(a)
  }
  return { s, actions }
}

describe('save envelope', () => {
  it('SAVE round trip: write then read gives the same save', () => {
    const { s, actions } = play(createGame(setup), makeRand(1), 80)
    const save = makeSave(setup, actions, s, { camera: 'iso' }, '2026-01-01T00:00:00Z')
    const back = readSave(writeSave(save))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.save).toStrictEqual(save)
    expect(back.save.game).toBe('stellar-derelict')
    expect(back.save.version).toBe(1)
  })

  it('SAVE refuses bad JSON, a foreign game, an unknown version, an unknown mission and a finished game', () => {
    const { s, actions } = play(createGame(setup), makeRand(2), 20)
    const good = makeSave(setup, actions, s)
    const reason = (text: string): string => {
      const r = readSave(text)
      expect(r.ok).toBe(false)
      return r.ok ? '' : r.reason
    }
    expect(reason('{nope')).toMatch(/JSON/)
    expect(reason('[]')).toMatch(/not a save/)
    expect(reason(JSON.stringify({ ...good, game: 'other-game' }))).toMatch(/different game/)
    expect(reason(JSON.stringify({ ...good, version: 2 }))).toMatch(/version/)
    expect(reason(JSON.stringify({ ...good, setup: { ...setup, mission: 'gone' } }))).toMatch(/no longer/)
    expect(reason(JSON.stringify({ ...good, snapshot: { ...s, mission: 'gone' } }))).toMatch(/no longer/)
    expect(reason(JSON.stringify({ ...good, snapshot: { ...s, result: { winner: 'molt', reason: 'time' } } }))).toMatch(/finished/)
    expect(reason(JSON.stringify({ ...good, snapshot: 5 }))).toMatch(/damaged/)
    expect(reason(JSON.stringify({ ...good, actions: 'x' }))).toMatch(/damaged/)
    // a mission removed from the registry after saving
    const t = start({ grid: ['#####', '#.a.#', '#####'] })
    const tSave = makeSave({ mission: t.mission, seed: 1 }, [], t)
    expect(readSave(writeSave(tSave)).ok).toBe(true)
    const m = getMission(t.mission)
    unregisterMission(t.mission)
    expect(reason(writeSave(tSave))).toMatch(/no longer/)
    if (m) registerMission(m)
  })

  it('SAVE setup plus actions replay to the snapshot', () => {
    const { s, actions } = play(createGame(setup), makeRand(3), 200)
    const back = readSave(writeSave(makeSave(setup, actions, s)))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(replay(back.save.setup, back.save.actions)).toStrictEqual(back.save.snapshot)
  })

  it('SAVE playing on from a reopened snapshot ends identical to never saving', () => {
    const rand = makeRand(9)
    const first = play(createGame(setup), rand, 120)
    const tail = []
    // decide the rest of the game up front so both routes take the same actions
    let probe = first.s
    const probeRand = makeRand(1234)
    for (let i = 0; i < 150 && !probe.result; i++) {
      const a = randomAction(probe, probe.toAct as 'warden', probeRand) as Action
      tail.push(a)
      probe = (step(probe, a) as { state: State }).state
    }
    const reopened = readSave(writeSave(makeSave(setup, first.actions, first.s)))
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) return
    let resumed = reopened.save.snapshot
    for (const a of tail) resumed = (step(resumed, a) as { state: State }).state
    expect(resumed).toStrictEqual(probe)
    expect(replay(setup, [...first.actions, ...tail])).toStrictEqual(probe)
  })
})
