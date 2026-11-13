import { describe, expect, it } from 'vitest'
import { makeRand } from '../../src/ai/random'
import { moltPolicy, wardenPolicy } from '../../src/ai/scripted'
import { patch } from '../../src/client/director'
import { createGame, step, view } from '../../src/engine'
import type { State, View } from '../../src/engine'

/** What the board draws, with the fields the director does not animate (AP) left out. */
function drawn(v: View, cooled = false) {
  return {
    round: v.round,
    phase: v.phase,
    units: v.units
      // heat cools at a Warden phase start with no event of its own (T-2); the final state replaces the cursor at the end of the action
      .map((u) => ({ ...u, ap: 0, ...(cooled && u.kind === 'warden' ? { heat: 0 } : {}) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    doors: v.doors,
    burn: [...v.burn].sort(),
    core: v.core,
    lit: [...v.lit].sort(),
    purged: [...v.purgedDucts].sort(),
  }
}

describe('presentation cursor', () => {
  it('PRES-1 patching a view with each event of an action reproduces the engine view after it', () => {
    for (const seed of [2, 3, 4]) {
      let s: State = createGame({ mission: 'dead-reckoning', seed })
      const rand = makeRand(seed)
      let n = 0
      while (!s.result && n < 1200) {
        const a = s.toAct === 'warden' ? wardenPolicy(view(s, 'warden'), rand) : moltPolicy(view(s, 'molt'), rand)
        const before = view(s, 'warden')
        const r = step(s, a)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        let v = before
        for (const e of r.events) v = patch(v, e)
        const cooled = r.events.some((e) => e.type === 'phaseStarted' && e.seat === 'warden')
        expect(drawn(v, cooled), `seed ${seed} action ${n} ${JSON.stringify(a)}`).toEqual(drawn(view(r.state, 'warden'), cooled))
        s = r.state
        n++
      }
      expect(n).toBeGreaterThan(100)
    }
  })

  it('E-7 patching never adds a hidden stalker count to a ping', () => {
    const s = createGame({ mission: 'dead-reckoning', seed: 9 })
    const v = view(s, 'warden')
    const p = patch(v, { type: 'pingArrived', unit: 'p99', duct: [27, 14] })
    expect(JSON.stringify(p)).not.toContain('stalkers')
  })
})
