type Model = { slug: string; kind: 'warden' | 'stalker' | 'prop'; prompt: string; heightIn: number }
export const FLUX_BASE: string
export const CONCEPT_DIR: string
export const REFERENCE: string
export const CANDIDATES: number
export const REFERENCE_LINE: string
export function seedOf(slug: string): number
export function factionOf(m: Model): 'wardens' | 'molt' | 'props'
export function buildConceptJob(m: Model, referenceDataUrl?: string): Record<string, any>
export function planConcepts(manifest: { models: Model[] }, opts?: { only?: Set<string> | null; force?: boolean }, picks?: Record<string, unknown>, hasCandidates?: (slug: string) => boolean): Model[]
export function makeUnits(manifest: { models: Model[] }): Record<string, { prompt: string; height: number; base: number }>
export function makePicks(picks: Record<string, number | string>, root?: string): Record<string, number | string>
export function contactSheetHtml(title: string, rows: { slug: string; images: string[] }[]): string
