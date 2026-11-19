type Image = { id: string; kind: string; file: string; enabled: boolean; aspect: string; size: [number, number] | number[]; use: string; ref?: string; pick?: number; seed?: number; weight?: number; prompt: string }
type Manifest = { images?: Image[]; art?: { candidates: number }; models?: any[] }
export const FLUX_BASE: string
export const CANDIDATE_DIR: string
export const PUBLISH_DIR: string
export const CONCEPT_PICKS: string
export const KINDS: string[]
export const ASPECTS: string[]
export const TEXTURE_MEAN: number
export const UNLEVELLED_USES: string[]
export const STEEL_RECOMB: number[][]
export function luma(r: number, g: number, b: number): number
export function seedFor(image: Image, reroll?: number): number
export function buildArtJob(image: Image, opts?: { candidates?: number; reroll?: number; refDataUrl?: string }): { model: string; prompt: string; aspect: string; megapixels: number; batch: number; seed: number; mode?: string; images?: string[] }
export function planArt(manifest: Manifest, opts?: { only?: Set<string> | null; kind?: string | null; force?: boolean }, hasCandidates?: (id: string) => boolean): Image[]
export function publishRecipe(image: Image): { width: number; height: number; grey: boolean; normalise: boolean; mean?: number; recomb?: number[][]; alphaFromDarkness: boolean; quality: number }
export function alphaFromLuma(l: number, white?: number, black?: number): number
export function withPick<M extends Manifest>(manifest: M, id: string, pick: number, seed: number | undefined, enabled?: boolean): M
export function knownImageIds(manifest: Manifest): Set<string>
export function lintImages(manifest: Manifest): { slug: string; word: string }[]
