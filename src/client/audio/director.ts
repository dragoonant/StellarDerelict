// The audio director: turns the client director's presented events, the store and the clock into engine calls.
// Sound is driven by presented events only (so it stays in step with the animation at every speed). Nothing here
// runs unless an entry is enabled in the manifest.
import type { Event, View } from '../../engine'
import { getStore, useStore, type GameStore } from '../store'
import { audioEngine } from './engine'
import { musicState } from './music'
import { AMBIENCE, TIMER_SOUND, TIMER_WARN_S, UI_SOUNDS, dedupeInstant, soundsFor, voiceFor } from './soundMap'

let fight = false
let acked = new Set<string>()
let started = false

function bump(ev: Event): void {
  if (ev.type === 'fired' || ev.type === 'scorched' || ev.type === 'meleeFought') fight = true
  if (ev.type === 'roundEnded') fight = false
  if (ev.type === 'phaseStarted') acked = new Set()
}

function play(ev: Event, view: View | null): void {
  for (const id of soundsFor(ev, view)) audioEngine.playSfx(id)
  // one movement acknowledgement per Warden per phase, and one command-point line per phase
  const ackKey = ev.type === 'moved' ? ev.unit : ev.type === 'cpSpent' ? 'cp' : null
  if (ackKey && acked.has(ackKey)) return
  const v = voiceFor(ev, view)
  if (v) {
    if (ackKey) acked.add(ackKey)
    audioEngine.playVoice(v)
  }
}

/** One event the client director has just presented; `before` is the presented view before it was applied. */
export function onPresented(ev: Event, before: View | null): void {
  bump(ev)
  if (audioEngine.anyEnabled()) play(ev, before)
}

/** The Instant path: the whole action at once, at most one sound per event type per phase. */
export function onPresentedInstant(events: Event[], before: View | null): void {
  for (const ev of events) bump(ev)
  if (!audioEngine.anyEnabled()) return
  for (const ev of dedupeInstant(events, before?.phase ?? 'warden')) play(ev, before)
}

function currentMusic(s: GameStore) {
  return musicState({ screen: s.screen, view: s.presented, timerLeft: s.timerLeft, timerMax: s.timerMax, fightThisRound: fight })
}

/** Subscribe the store: music state, ambience, the timer tick and the interface sounds. Call once at startup. */
export function initAudio(): void {
  if (started) return
  started = true
  audioEngine.install()
  if (!audioEngine.anyEnabled()) return
  let lastMusic = ''
  let lastSecond = -1
  const sync = (s: GameStore, p: GameStore): void => {
    const m = currentMusic(s)
    if (m !== lastMusic) {
      lastMusic = m
      audioEngine.setMusic(m)
    }
    if (s.screen === 'mission' && p.screen !== 'mission') {
      fight = false
      acked = new Set()
      audioEngine.playSfx(UI_SOUNDS.confirm)
      audioEngine.startAmbience()
    } else if (s.screen !== 'mission' && p.screen === 'mission') audioEngine.stopAmbience()
    if (s.selected && s.selected !== p.selected) audioEngine.playSfx(UI_SOUNDS.select)
    if (s.armed && !p.armed) audioEngine.playSfx(UI_SOUNDS.arm)
    if (s.notice && s.notice !== p.notice) audioEngine.playSfx(UI_SOUNDS.deny)
    const sec = Math.floor(s.timerLeft)
    if (s.screen === 'mission' && s.timerMax > 0 && s.timerLeft > 0 && s.timerLeft <= TIMER_WARN_S && sec !== lastSecond && s.presented?.phase === 'warden') audioEngine.playSfx(TIMER_SOUND)
    lastSecond = sec
  }
  useStore.subscribe(sync)
  sync(getStore(), getStore())
  void AMBIENCE
}
