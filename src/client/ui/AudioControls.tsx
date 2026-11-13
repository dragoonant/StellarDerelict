// Mix sliders (Settings) and the mute toggle (HUD menu). Settings are saved under `stellar-derelict-audio`.
import { useSyncExternalStore } from 'react'
import { audioEngine } from '../audio/engine'
import type { AudioSettings } from '../audio/settings'

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(
    (f) => audioEngine.subscribe(f),
    () => audioEngine.getSettings(),
  )
}

export function MuteToggle() {
  const a = useAudioSettings()
  return (
    <button type="button" className={a.muted ? 'on' : ''} aria-pressed={a.muted} onClick={() => audioEngine.setSettings({ muted: !a.muted })} data-act="mute">
      {a.muted ? 'Sound off' : 'Sound on'}
    </button>
  )
}

const BUSES: { id: 'sfx' | 'music' | 'voice'; label: string }[] = [
  { id: 'sfx', label: 'Effects' },
  { id: 'music', label: 'Music' },
  { id: 'voice', label: 'Voice' },
]

export function AudioControls() {
  const a = useAudioSettings()
  return (
    <div className="mix" role="group" aria-label="Sound">
      {BUSES.map((b) => (
        <label key={b.id} className="mix__row">
          <span className="seg__label">{b.label}</span>
          <input type="range" min={0} max={100} step={1} value={Math.round(a[b.id] * 100)} aria-label={`${b.label} volume`} onChange={(e) => audioEngine.setSettings({ [b.id]: Number(e.target.value) / 100 })} />
        </label>
      ))}
      <MuteToggle />
    </div>
  )
}
