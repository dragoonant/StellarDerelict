// M6 plumbing. AUD-1..: the event map is exhaustive, music states, rate limiter, variant rotation, missing files.
import { describe, expect, it } from 'vitest'
import { assets } from '../../src/data'
import { createGame, view } from '../../src/engine'
import type { Event, View } from '../../src/engine'
import { BufferCache } from '../../src/client/audio/bufferCache'
import { VariantRotator, VoiceGate } from '../../src/client/audio/limits'
import { musicState, type MusicInput } from '../../src/client/audio/music'
import { parseAudioSettings, DEFAULT_AUDIO } from '../../src/client/audio/settings'
import { AMBIENCE, EVENT_SOUNDS, TIMER_SOUND, UI_SOUNDS, dedupeInstant, silentEvents, soundsFor, voiceFor } from '../../src/client/audio/soundMap'

const base = (): View => view(createGame({ mission: 'dead-reckoning', seed: 1 }), 'warden')
const soundIds = new Set(assets.sounds.map((s) => s.id))
const voiceIds = new Set(assets.voice.map((v) => v.id))

// One sample of every engine event type. The mapped type makes a new event type a compile error here too.
const SAMPLES: { [K in Event['type']]: Extract<Event, { type: K }> } = {
  phaseStarted: { type: 'phaseStarted', seat: 'warden', round: 1, cp: 3 },
  moved: { type: 'moved', unit: 'venn', from: [2, 14], to: [3, 14] },
  turned: { type: 'turned', unit: 'venn', facing: 'N' },
  doorChanged: { type: 'doorChanged', door: [1, 1], state: 'open' },
  fired: { type: 'fired', unit: 'venn', target: 's1', dice: [4, 4], need: 4, hit: true, heat: 1, watch: false },
  locked: { type: 'locked', unit: 'brandt' },
  vented: { type: 'vented', unit: 'okafor', heldCp: false },
  watchSet: { type: 'watchSet', unit: 'sato' },
  watchEnded: { type: 'watchEnded', unit: 'sato', why: 'phase' },
  scorched: { type: 'scorched', unit: 'riedel', at: [4, 4], burst: [[4, 4]], rolls: [] },
  burnCleared: { type: 'burnCleared' },
  meleeFought: { type: 'meleeFought', attacker: 'venn', defender: 's1', attackerRoll: 5, defenderRoll: 2, attackerDice: [5], defenderDice: [2], flank: false, outcome: 'attacker' },
  breached: { type: 'breached', unit: 'brandt' },
  destroyed: { type: 'destroyed', unit: 'brandt', kind: 'warden', at: [3, 14], by: 's1' },
  pingArrived: { type: 'pingArrived', unit: 'p9', duct: [5, 5] },
  pingHeld: { type: 'pingHeld' },
  revealed: { type: 'revealed', ping: 'p1', at: [4, 13], stalkers: 2, lost: 0, forced: false, units: [] },
  tearRolled: { type: 'tearRolled', unit: 's1', door: [1, 1], die: 5, torn: true },
  terminalUsed: { type: 'terminalUsed', unit: 'sato', terminal: 't1', op: 'unseal', door: [1, 1] },
  lit: { type: 'lit', section: 'a' },
  purged: { type: 'purged', section: 'a', ducts: [] },
  coreTaken: { type: 'coreTaken', unit: 'venn' },
  coreDropped: { type: 'coreDropped', at: [3, 3] },
  corePicked: { type: 'corePicked', unit: 'okafor' },
  alarm: { type: 'alarm' },
  roundEnded: { type: 'roundEnded', round: 1 },
  gameOver: { type: 'gameOver', winner: 'warden', reason: 'core-out' },
}

describe('AUD-1 every engine event is mapped or explicitly silent', () => {
  it('has a rule for exactly the event types sampled', () => {
    expect(Object.keys(EVENT_SOUNDS).sort()).toEqual(Object.keys(SAMPLES).sort())
  })
  it('every mapped event plays only sounds that exist in the manifest', () => {
    const v = base()
    for (const ev of Object.values(SAMPLES)) for (const id of soundsFor(ev, v)) expect(soundIds.has(id), `${ev.type} -> ${id}`).toBe(true)
  })
  it('the silent list is the documented one', () => {
    expect(silentEvents().sort()).toEqual(['burnCleared', 'pingHeld', 'roundEnded', 'turned', 'watchEnded'])
  })
  it('every manifest sound is reachable from an event, the interface, the timer or the ambience', () => {
    const v = base()
    const reached = new Set<string>([...Object.values(UI_SOUNDS), TIMER_SOUND, AMBIENCE])
    const wardens = v.units.filter((u) => u.kind === 'warden')
    const stalker = { id: 's1', kind: 'stalker' as const, at: [4, 14] as [number, number], ap: 0 }
    const ping = { id: 'p1', kind: 'ping' as const, at: [6, 6] as [number, number], ap: 0 }
    const withUnits: View = { ...v, units: [...v.units, stalker, ping] }
    const evs: Event[] = [
      ...Object.values(SAMPLES),
      { ...SAMPLES.fired, hit: false },
      { ...SAMPLES.meleeFought, outcome: 'defender' },
      { ...SAMPLES.meleeFought, attacker: 'brandt' },
      { ...SAMPLES.destroyed, kind: 'stalker' },
      { ...SAMPLES.phaseStarted, seat: 'molt' },
      { ...SAMPLES.gameOver, winner: 'molt' },
      ...(['closed', 'sealed', 'torn'] as const).map((state) => ({ ...SAMPLES.doorChanged, state })),
      { ...SAMPLES.moved, unit: 's1' },
      { ...SAMPLES.moved, unit: 'p1' },
    ]
    for (const ev of evs) for (const id of soundsFor(ev, withUnits)) reached.add(id)
    void wardens
    const missing = assets.sounds.filter((s) => !reached.has(s.id)).map((s) => s.id)
    expect(missing).toEqual([])
  })
  it('manifest events are engine event types or ui, timer, always', () => {
    for (const s of assets.sounds) expect([...Object.keys(EVENT_SOUNDS), 'ui', 'timer', 'always'], s.id).toContain(s.event)
  })
  it('a Warden footstep, a stalker skitter, a ping blip; the Sergeant maul replaces the melee hit', () => {
    const v = base()
    const withS: View = { ...v, units: [...v.units, { id: 's1', kind: 'stalker', at: [9, 9], ap: 0 }, { id: 'p1', kind: 'ping', at: [8, 8], ap: 0 }] }
    expect(soundsFor({ ...SAMPLES.moved, unit: 'venn' }, withS)).toEqual(['footstep'])
    expect(soundsFor({ ...SAMPLES.moved, unit: 's1' }, withS)).toEqual(['skitter'])
    expect(soundsFor({ ...SAMPLES.moved, unit: 'p1' }, withS)).toEqual(['ping'])
    expect(soundsFor(SAMPLES.meleeFought, withS)).toEqual(['maul'])
    expect(soundsFor({ ...SAMPLES.meleeFought, outcome: 'tie' }, withS)).toEqual(['melee-hit'])
  })
})

describe('AUD-2 voice lines', () => {
  it('has six lines for each Warden and four for the carrier, all short and original-length', () => {
    for (const w of ['venn', 'brandt', 'okafor', 'riedel', 'sato']) expect(assets.voice.filter((v) => v.speaker === w)).toHaveLength(6)
    expect(assets.voice.filter((v) => v.speaker === 'carrier')).toHaveLength(4)
    for (const v of assets.voice) expect(v.text.length).toBeLessThan(60)
  })
  it('keys lines to the unit that acted, and the carrier lines to the core events', () => {
    const v = base()
    expect(voiceFor({ ...SAMPLES.moved, unit: 'brandt' }, v)).toBe('brandt-moved')
    expect(voiceFor(SAMPLES.locked, v)).toBe('brandt-locked')
    expect(voiceFor(SAMPLES.scorched, v)).toBe('riedel-scorched')
    expect(voiceFor(SAMPLES.terminalUsed, v)).toBe('sato-terminal-used')
    expect(voiceFor(SAMPLES.coreTaken, v)).toBe('carrier-core-taken')
    expect(voiceFor(SAMPLES.fired, v)).toBeNull()
    expect(voiceFor({ ...SAMPLES.moved, unit: 'ghost' }, v)).toBeNull()
  })
  it('the nearest living Warden calls a contact', () => {
    const v = base()
    const w = v.units.filter((u) => u.kind === 'warden')[0]!
    expect(voiceFor({ ...SAMPLES.revealed, at: w.at }, v)).toBe(`${w.id}-revealed`)
  })
  it('every line an event can ask for exists', () => {
    const v = base()
    for (const ev of Object.values(SAMPLES)) {
      const id = voiceFor(ev, v)
      if (id) expect(voiceIds.has(id), id).toBe(true)
    }
  })
})

const idle: MusicInput = { screen: 'mission', view: null, timerLeft: 300, timerMax: 300, fightThisRound: false }
describe('AUD-3 music state', () => {
  const b0 = base()
  const v: View = { ...b0, units: b0.units.filter((u) => u.kind === 'warden') }
  const wd = v.units.find((u) => u.kind === 'warden')!
  it('title and briefing are the title theme; the debrief is victory or defeat', () => {
    expect(musicState({ ...idle, screen: 'title' })).toBe('title')
    expect(musicState({ ...idle, screen: 'briefing' })).toBe('title')
    expect(musicState({ ...idle, screen: 'debrief', view: { ...v, result: { winner: 'warden', reason: 'core-out' } } })).toBe('victory')
    expect(musicState({ ...idle, screen: 'debrief', view: { ...v, result: { winner: 'molt', reason: 'squad-lost' } } })).toBe('defeat')
  })
  it('calm with nothing near', () => {
    expect(musicState({ ...idle, view: v })).toBe('calm')
  })
  it('tense with a ping within 8 squares, or the clock under 30 s', () => {
    const near: View = { ...v, units: [...v.units, { id: 'p1', kind: 'ping', at: [wd.at[0] + 8, wd.at[1]], ap: 0 }] }
    const far: View = { ...v, units: [...v.units, { id: 'p1', kind: 'ping', at: [wd.at[0] + 14, wd.at[1] - 12], ap: 0 }] }
    expect(musicState({ ...idle, view: near })).toBe('tense')
    expect(musicState({ ...idle, view: far })).toBe('calm')
    expect(musicState({ ...idle, view: v, timerLeft: 29 })).toBe('tense')
    expect(musicState({ ...idle, view: v, timerLeft: 31 })).toBe('calm')
    expect(musicState({ ...idle, view: v, timerLeft: 10, timerMax: 0 })).toBe('calm')
  })
  it('battle once a stalker is seen or a fight has happened this round', () => {
    const seen: View = { ...v, units: [...v.units, { id: 's1', kind: 'stalker', at: [9, 9], ap: 0 }] }
    expect(musicState({ ...idle, view: seen })).toBe('battle')
    expect(musicState({ ...idle, view: v, fightThisRound: true })).toBe('battle')
  })
  it('alarm latches once the core is taken, whatever else is going on', () => {
    const taken: View = { ...v, coreRound: 3, core: { where: 'carried', at: null, carrier: wd.id } }
    expect(musicState({ ...idle, view: taken })).toBe('alarm')
    expect(musicState({ ...idle, view: taken, fightThisRound: true, timerLeft: 5 })).toBe('alarm')
    const dropped: View = { ...taken, core: { where: 'loose', at: [3, 3], carrier: null } }
    expect(musicState({ ...idle, view: dropped })).toBe('alarm')
  })
  it('has a track for every state the function can return', () => {
    expect(assets.music.map((m) => m.state).sort()).toEqual(['alarm', 'battle', 'calm', 'defeat', 'tense', 'title', 'victory'])
  })
})

describe('AUD-4 voice rate limit', () => {
  it('allows one line per two seconds and never overlaps', () => {
    const g = new VoiceGate(2000)
    expect(g.canPlay(0)).toBe(true)
    g.start(0, 1500)
    expect(g.canPlay(1000)).toBe(false)
    expect(g.canPlay(1999)).toBe(false)
    expect(g.canPlay(2000)).toBe(true)
    g.start(2000, 5000) // a long line holds the gate past the gap
    expect(g.canPlay(4500)).toBe(false)
    expect(g.canPlay(7000)).toBe(true)
  })
  it('gives the slot back when a line never plays', () => {
    const g = new VoiceGate(2000)
    g.start(0, 1500)
    g.release()
    expect(g.canPlay(10)).toBe(true)
  })
})

describe('AUD-5 variant rotation', () => {
  it('never repeats the previous variant immediately', () => {
    const r = new VariantRotator()
    let seed = 7
    const rand = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    let prev = -1
    for (let i = 0; i < 500; i++) {
      const k = r.next('x', 3, rand)
      expect(k).not.toBe(prev)
      expect(k).toBeGreaterThanOrEqual(0)
      expect(k).toBeLessThan(3)
      prev = k
    }
  })
  it('a single variant is always index 0; ids rotate independently', () => {
    const r = new VariantRotator()
    expect(r.next('a', 1)).toBe(0)
    expect(r.next('a', 1)).toBe(0)
    const a = r.next('a', 2, () => 0)
    expect(r.next('b', 2, () => 0)).toBe(0)
    expect(r.next('a', 2, () => 0)).not.toBe(a)
  })
})

describe('AUD-6 a missing file does not throw', () => {
  it('skips a failed fetch or decode, remembers it, and does not retry', async () => {
    let calls = 0
    const cache = new BufferCache<string>(
      async (u) => {
        calls++
        if (u.includes('gone')) throw new Error('HTTP 404')
        return new ArrayBuffer(4)
      },
      async () => 'decoded',
    )
    await expect(cache.get('gone.mp3')).resolves.toBeNull()
    await expect(cache.get('gone.mp3')).resolves.toBeNull()
    expect(calls).toBe(1)
    expect(cache.hasFailed('gone.mp3')).toBe(true)
    await expect(cache.get('here.mp3')).resolves.toBe('decoded')
    expect(cache.peek('here.mp3')).toBe('decoded')
    const bad = new BufferCache<string>(async () => new ArrayBuffer(1), async () => Promise.reject(new Error('decode')))
    await expect(bad.get('x')).resolves.toBeNull()
  })
})

describe('AUD-7 Instant speed and settings', () => {
  it('plays at most one event of each type per phase', () => {
    const f = SAMPLES.fired
    const evs: Event[] = [f, f, f, SAMPLES.moved, SAMPLES.moved, { ...SAMPLES.phaseStarted, seat: 'molt' }, f, f, SAMPLES.moved]
    const out = dedupeInstant(evs, 'warden')
    expect(out.map((e) => e.type)).toEqual(['fired', 'moved', 'phaseStarted', 'fired', 'moved'])
  })
  it('parses saved mix settings, falling back to defaults on junk', () => {
    expect(parseAudioSettings('{"sfx":0.2,"music":2,"voice":-1,"muted":true}')).toEqual({ sfx: 0.2, music: 1, voice: 0, muted: true })
    expect(parseAudioSettings('not json')).toEqual(DEFAULT_AUDIO)
    expect(parseAudioSettings(null)).toEqual(DEFAULT_AUDIO)
  })
})
