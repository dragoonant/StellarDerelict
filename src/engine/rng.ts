import type { RngState } from './types'

/** sfc32 with its four words stored in State. Mutates the RngState it is given (callers hold a private clone). */
function mix(seed: number, i: number): number {
  // splitmix-style scrambler so close seeds give unrelated streams
  let z = (seed + Math.imul(i + 1, 0x9e3779b9)) | 0
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
  return (z ^ (z >>> 16)) >>> 0
}

function nextU32(r: RngState): number {
  const s = r.s
  let a = s[0]
  let b = s[1]
  let c = s[2]
  let d = s[3]
  const t = (((a + b) | 0) + d) | 0
  d = (d + 1) | 0
  a = b ^ (b >>> 9)
  b = (c + (c << 3)) | 0
  c = (c << 21) | (c >>> 11)
  c = (c + t) | 0
  r.s = [a >>> 0, b >>> 0, c >>> 0, d >>> 0]
  return t >>> 0
}

export function seedRng(seed: number): RngState {
  const r: RngState = { s: [mix(seed, 0), mix(seed, 1), mix(seed, 2), mix(seed, 3)], queue: [] }
  for (let i = 0; i < 15; i++) nextU32(r)
  return r
}

/** Uniform integer in 0..n-1 straight from the generator (never from the test queue). */
export function randInt(r: RngState, n: number): number {
  return Math.floor((nextU32(r) / 4294967296) * n)
}

/** One d6. The test queue, if any, is consumed first. */
export function d6(r: RngState): number {
  const q = r.queue.shift()
  if (q !== undefined) return q
  return randInt(r, 6) + 1
}

export function shuffle<T>(r: RngState, items: T[]): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(r, i + 1)
    const t = a[i] as T
    a[i] = a[j] as T
    a[j] = t
  }
  return a
}
