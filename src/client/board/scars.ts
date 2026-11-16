// Scars (spec 70 ART-6): marks the fight leaves on the deck. Presentation only, tallied from engine events like the debrief:
// a burn mark where a scorcher burst burned out, a splash where a stalker was destroyed. Pure, so it is unit-tested.
import type { Event, Pos } from '../../engine'
import { tileHash } from '../../data'

export interface Scar {
  id: number
  at: Pos
  kind: 'burn' | 'kill'
  /** picks the decal variant and its turn; stable for a square */
  n: number
}

/** The board keeps the newest marks only. */
export const SCAR_CAP = 96

const key = (p: Pos): string => `${p[0]},${p[1]}`

/**
 * The scars a run of events leaves. `burning` is the squares on fire before the first event (`View.burn`): `burnCleared`
 * names no squares, so the squares are the ones that were burning, plus any burst earlier in the same run.
 */
export function scarsOf(events: readonly Event[], burning: readonly Pos[]): Omit<Scar, 'id'>[] {
  const out: Omit<Scar, 'id'>[] = []
  const fire = new Map<string, Pos>(burning.map((p) => [key(p), p]))
  for (const ev of events) {
    if (ev.type === 'scorched') for (const p of ev.burst) fire.set(key(p), p)
    else if (ev.type === 'burnCleared') {
      for (const p of fire.values()) out.push({ at: p, kind: 'burn', n: tileHash(p[0], p[1]) })
      fire.clear()
    } else if (ev.type === 'destroyed' && ev.kind === 'stalker') out.push({ at: ev.at, kind: 'kill', n: tileHash(ev.at[0], ev.at[1]) + out.length })
  }
  return out
}

/** Add marks: a square holds one burn mark and at most two splashes; past the cap the oldest go. */
export function addScars(have: readonly Scar[], more: readonly Omit<Scar, 'id'>[], nextId: number): Scar[] {
  const out = [...have]
  let id = nextId
  for (const m of more) {
    const same = out.filter((s) => s.kind === m.kind && key(s.at) === key(m.at)).length
    if (same >= (m.kind === 'burn' ? 1 : 2)) continue
    out.push({ ...m, n: m.n + same * 7, id: id++ })
  }
  return out.length > SCAR_CAP ? out.slice(out.length - SCAR_CAP) : out
}
