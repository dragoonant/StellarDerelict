import { describe, expect, it } from 'vitest'
import { describeEvent, isMoltId, foldMoveLine } from '../../src/client/describe'
import { createGame, view } from '../../src/engine'

describe('log lines', () => {
  const b = view(createGame({ mission: 'dead-reckoning', seed: 1 }), 'warden')
  it('PRES-2 Warden ids that start with s or p are not Molt ids', () => {
    for (const id of ['sato', 'venn', 'brandt', 'okafor', 'riedel']) expect(isMoltId(id)).toBe(false)
    expect(isMoltId('s12')).toBe(true)
    expect(isMoltId('p3')).toBe(true)
  })
  it('PRES-2 a Warden move is a Warden line and a stalker move a Molt line', () => {
    expect(describeEvent({ type: 'moved', unit: 'sato', from: [3, 15], to: [4, 15] }, b)?.side).toBe('warden')
    expect(describeEvent({ type: 'moved', unit: 's4', from: [3, 15], to: [4, 15] }, b)?.side).toBe('molt')
  })
  it('PRES-2 consecutive moves by one unit fold into one line; doors use place names', () => {
    const a = describeEvent({ type: 'moved', unit: 'brandt', from: [4, 14], to: [5, 14] }, b)!
    const c = describeEvent({ type: 'moved', unit: 'brandt', from: [5, 14], to: [6, 14] }, b)!
    const f = foldMoveLine(a, c, b)!
    expect(f.text).toContain('advances 2 squares')
    expect(foldMoveLine(a, describeEvent({ type: 'moved', unit: 'venn', from: [1, 1], to: [2, 1] }, b)!, b)).toBeNull()
    expect(describeEvent({ type: 'doorChanged', door: [14, 4], state: 'sealed' }, b)?.text).toContain('archive bulkhead')
  })
})
