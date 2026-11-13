// The music director's pure half: which state the score is in (spec 60). Alarm latches once the core is taken, because the
// view's `coreRound` never goes back to null.
import type { View } from '../../engine'
import type { MusicState } from '../../data'

/** How close a ping counts as near, in squares (Chebyshev). */
export const PING_NEAR = 8
/** The clock below this many seconds makes the music tense. */
export const TENSE_TIMER_S = 30

export interface MusicInput {
  screen: 'title' | 'briefing' | 'mission' | 'debrief'
  view: View | null
  /** seconds left on the boarding clock (0 with the clock off) */
  timerLeft: number
  timerMax: number
  /** a shot, burst or melee has happened this round */
  fightThisRound: boolean
}

export function musicState(i: MusicInput): MusicState {
  if (i.screen === 'title' || i.screen === 'briefing') return 'title'
  const v = i.view
  if (i.screen === 'debrief') return v?.result?.winner === 'warden' ? 'victory' : 'defeat'
  if (!v) return 'calm'
  if (v.result) return v.result.winner === 'warden' ? 'victory' : 'defeat'
  if (v.coreRound !== null) return 'alarm'
  if (i.fightThisRound || v.units.some((u) => u.kind === 'stalker')) return 'battle'
  const wardens = v.units.filter((u) => u.kind === 'warden' && u.alive)
  const near = v.units.some((p) => p.kind === 'ping' && wardens.some((w) => Math.max(Math.abs(w.at[0] - p.at[0]), Math.abs(w.at[1] - p.at[1])) <= PING_NEAR))
  const late = i.timerMax > 0 && i.timerLeft > 0 && i.timerLeft < TENSE_TIMER_S
  return near || late ? 'tense' : 'calm'
}
