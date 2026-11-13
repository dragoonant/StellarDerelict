// sounds.html: audition every manifest sound, music track and voice line. Not part of the game. Audio is "not verified by
// ear" until the owner has listened here (KB rule 9). Loudness figures come from public/assets/audio/measure.json when it exists.
import '../client/theme.css'
import { assets } from '../data'

interface Measure {
  peakDb?: number
  rmsDb?: number
  lufs?: number
  crest?: number
  seconds?: number
  trimmedMs?: number
}
const base = import.meta.env.BASE_URL + 'assets/'
const root = document.getElementById('root') as HTMLElement

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

async function exists(file: string): Promise<boolean> {
  try {
    const r = await fetch(base + file, { method: 'HEAD' })
    return r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')
  } catch {
    return false
  }
}

async function loadMeasure(): Promise<Record<string, Measure>> {
  try {
    const r = await fetch(base + 'audio/measure.json')
    if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) return {}
    const j = (await r.json()) as { files?: Record<string, Measure> }
    return j.files ?? {}
  } catch {
    return {}
  }
}

let current: HTMLAudioElement | null = null
function play(file: string): void {
  current?.pause()
  current = new Audio(base + file)
  void current.play().catch(() => undefined)
}

function row(parent: HTMLElement, file: string, title: string, meta: string, prompt: string, flag: string, measure: Record<string, Measure>): void {
  const r = el('article', 'sx')
  const head = el('div', 'sx__head')
  head.append(el('strong', undefined, title), el('span', 'dim', meta))
  const status = el('span', 'sx__status', 'checking')
  const btn = el('button', undefined, 'Play')
  btn.type = 'button'
  btn.disabled = true
  btn.addEventListener('click', () => play(file))
  head.append(status, btn)
  r.append(head, el('p', 'sx__prompt', prompt))
  if (flag) r.append(el('p', 'sx__flag', flag))
  const m = measure[file]
  if (m) {
    const bits = [m.peakDb !== undefined && `peak ${m.peakDb.toFixed(1)} dB`, m.lufs !== undefined && `loudness ${m.lufs.toFixed(1)} LUFS`, m.rmsDb !== undefined && `rms ${m.rmsDb.toFixed(1)} dB`, m.crest !== undefined && `crest ${m.crest.toFixed(1)}`].filter(Boolean)
    r.append(el('p', 'sx__measure', bits.join(', ')))
    if (m.crest !== undefined && m.crest < 8 && /shot|scorch/.test(file)) r.append(el('p', 'sx__flag', 'Crest factor under 8: too flat for a gunshot. Layer a transient.'))
  }
  void exists(file).then((ok) => {
    status.textContent = ok ? 'generated' : 'not generated'
    status.className = ok ? 'sx__status ok' : 'sx__status miss'
    btn.disabled = !ok
  })
  parent.append(r)
}

async function main(): Promise<void> {
  const measure = await loadMeasure()
  root.append(el('h1', 'sx__title', 'Stellar Derelict sounds'), el('p', 'line line--dim', 'Not verified by ear until the owner has listened here. Entries stay disabled in src/data/assets.json until they pass.'))
  const sfx = el('section')
  sfx.append(el('h2', undefined, `Effects (${assets.sounds.length})`))
  for (const s of assets.sounds)
    s.files.forEach((f, i) => row(sfx, f, s.files.length > 1 ? `${s.id} #${i + 1}` : s.id, `${s.event}${s.when ? ' / ' + s.when : ''}, gain ${s.gain}, ${s.seconds}s${s.enabled ? ', enabled' : ', disabled'}`, s.prompt, '', measure))
  const mus = el('section')
  mus.append(el('h2', undefined, `Music (${assets.music.length})`))
  for (const m of assets.music) row(mus, m.file, m.state, `${m.bpm} bpm, ${m.seconds}s${m.enabled ? ', enabled' : ', disabled'}`, m.prompt, '', measure)
  const voc = el('section')
  voc.append(el('h2', undefined, `Voice (${assets.voice.length})`))
  for (const v of assets.voice) row(voc, v.file, v.id, `${v.speaker}, ${v.event}${v.when ? ' / ' + v.when : ''}${v.enabled ? ', enabled' : ', disabled'}`, `"${v.text}" - ${v.voiceDesign}`, '', measure)
  root.append(sfx, mus, voc)
}
void main()
