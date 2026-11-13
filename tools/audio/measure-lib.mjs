// Pure audio measurement (unit-tested): peak, RMS, an integrated-loudness estimate (K-weighted mean square, no gating),
// crest factor and silence bounds. Samples are mono Float32 at 48 kHz (the K-weighting coefficients are for 48 kHz).
export const SR = 48000

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity)

function biquad(x, b, a) {
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]
    const yi = b[0] * xi + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
    y[i] = yi
    x2 = x1; x1 = xi; y2 = y1; y1 = yi
  }
  return y
}

/** ITU-R BS.1770 K-weighting (high shelf then high-pass), 48 kHz coefficients. */
export function kWeight(x) {
  const shelf = biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585])
  return biquad(shelf, [1, -2, 1], [1, -1.99004745483398, 0.99007225036621])
}

export function analyse(samples) {
  let peak = 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i])
    if (a > peak) peak = a
    sum += samples[i] * samples[i]
  }
  const rms = samples.length ? Math.sqrt(sum / samples.length) : 0
  const k = kWeight(samples)
  let ks = 0
  for (let i = 0; i < k.length; i++) ks += k[i] * k[i]
  const lufs = k.length && ks > 0 ? -0.691 + 10 * Math.log10(ks / k.length) : -Infinity
  return { peakDb: db(peak), rmsDb: db(rms), lufs, crest: rms > 0 ? peak / rms : 0, seconds: samples.length / SR }
}

/** First and last sample index above `thresholdDb`, or null when the file is silent. */
export function silenceBounds(samples, thresholdDb = -50) {
  const t = 10 ** (thresholdDb / 20)
  let a = -1
  let b = -1
  for (let i = 0; i < samples.length; i++)
    if (Math.abs(samples[i]) > t) {
      if (a < 0) a = i
      b = i
    }
  return a < 0 ? null : { start: a, end: b + 1 }
}

/** Gunshot-class sounds need a crest factor (peak / RMS, linear) of at least 8. */
export const GUNSHOT_IDS = ['repeater-shot', 'repeater-hit']
export const MIN_CREST = 8

export const isGunshot = (id) => GUNSHOT_IDS.some((g) => id === g || id.startsWith(g + '-'))

export function crestFlag(id, crest) {
  return isGunshot(id) && crest < MIN_CREST ? `${id}: crest ${crest.toFixed(1)} is under ${MIN_CREST}; layer a transient` : null
}

/**
 * Loudness targets (LUFS) per kind: one-shot effects, the ambience loop, music beds, voice. ACE-Step tracks come out
 * between -13 and -28 LUFS with peaks over 0 dBFS, so music is levelled too (the limiter catches the peaks).
 */
export const TARGET_LUFS = { sfx: -18, loop: -24, music: -16, voice: -16 }
/** A file this quiet is a failed generation, not a quiet sound: re-roll it rather than lift it 30 dB. */
export const SILENT_LUFS = -42

/** Gunshot-class one-shots are levelled by peak (to -1 dBFS), not loudness: a loudness target plus the limiter would flatten the crest the gate asks for. */
export const GUNSHOT_PEAK_DB = -1

/**
 * The gain in dB to bring a file to its level: gunshot ids to GUNSHOT_PEAK_DB by peak, everything else to its kind's
 * loudness target; 0 when it is within a dB, has no target, or is near silent (a failed generation).
 */
export function normalizeGainDb(kind, lufs, peakDb = -Infinity, id = '') {
  if (!Number.isFinite(lufs) || lufs < SILENT_LUFS) return 0
  if (isGunshot(id) && Number.isFinite(peakDb)) {
    const g = GUNSHOT_PEAK_DB - peakDb
    return Math.abs(g) <= 0.5 ? 0 : Math.round(g * 10) / 10
  }
  const target = TARGET_LUFS[kind]
  if (target === undefined) return 0
  const g = target - lufs
  return Math.abs(g) <= 1 ? 0 : Math.round(g * 10) / 10
}

export function silentFlag(id, lufs) {
  return !Number.isFinite(lufs) || lufs < SILENT_LUFS ? `${id}: ${Number.isFinite(lufs) ? lufs.toFixed(1) : '-inf'} LUFS is near silent; re-roll it (--force --reroll 1)` : null
}
