export const SR: number
export function kWeight(x: Float32Array): Float32Array
export function analyse(samples: Float32Array): { peakDb: number; rmsDb: number; lufs: number; crest: number; seconds: number }
export function silenceBounds(samples: Float32Array, thresholdDb?: number): { start: number; end: number } | null
export const GUNSHOT_IDS: string[]
export const MIN_CREST: number
export function crestFlag(id: string, crest: number): string | null
