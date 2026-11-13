import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGame, legalActions, step } from '../../src/engine'
import type { Action, Event, State } from '../../src/engine'

const FILE = 'tests/fixtures/golden-round.json'

/** One worked round on the real mission with a fixed seed: the squad breaches the airlock door, the Molt arrive and creep. */
function playRound(): { actions: Action[]; events: Event[]; state: State } {
  let s = createGame({ mission: 'dead-reckoning', seed: 2026 })
  const actions: Action[] = []
  const events: Event[] = []
  const go = (a: Action): void => {
    const r = step(s, a)
    if (!r.ok) throw new Error(`${JSON.stringify(a)}: ${r.error}`)
    s = r.state
    actions.push(a)
    events.push(...r.events)
  }
  go({ type: 'move', unit: 'brandt', to: [4, 14] })
  go({ type: 'door', unit: 'brandt', door: [5, 14] })
  go({ type: 'move', unit: 'brandt', to: [5, 14] })
  go({ type: 'watch', unit: 'okafor' })
  go({ type: 'turn', unit: 'sato', facing: 'N' })
  go({ type: 'turn', unit: 'venn', facing: 'S' })
  go({ type: 'endPhase' })
  // Molt: place the arrivals on the first two open ducts, then wake the first ping and walk it
  while (s.pending) go({ type: 'arrive', duct: (legalActions(s)[0] as Extract<Action, { type: 'arrive' }>).duct })
  const ping = s.units.find((u) => u.kind === 'ping')
  if (ping) go({ type: 'reveal', unit: ping.id })
  go({ type: 'endPhase' })
  return { actions, events, state: s }
}

describe('golden round', () => {
  it('E-5 the worked round with seed 2026 matches the recorded event list', () => {
    const run = playRound()
    const record = { setup: { mission: 'dead-reckoning', seed: 2026 }, actions: run.actions, events: run.events }
    if (!existsSync(FILE) || process.env.UPDATE_GOLDEN) {
      mkdirSync(dirname(FILE), { recursive: true })
      writeFileSync(FILE, JSON.stringify(record, null, 1) + '\n')
    }
    const golden = JSON.parse(readFileSync(FILE, 'utf8'))
    expect(JSON.parse(JSON.stringify(record))).toStrictEqual(golden)
    expect(run.events.length).toBeGreaterThan(10)
  })
})
