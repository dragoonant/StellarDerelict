type Manifest = { sounds: any[]; music: any[]; voice: any[]; models: any[] }
export type AudioJob = { kind: 'sfx' | 'music' | 'voice'; id: string; body: Record<string, unknown>; files: string[]; missing: string[]; loop?: boolean }
export const DEFAULT_BASE: string
export const PUBLIC_ASSETS: string
export const RAW_DIR: string
export const KINDS: string[]
export function seedOf(id: string): number
export function buildSfxJob(s: any): Record<string, unknown>
export function buildMusicJob(m: any): Record<string, unknown>
export function buildVoiceJob(v: any): Record<string, unknown>
export function planAudio(manifest: Manifest, opts?: { only?: Set<string> | null; kind?: string | null; force?: boolean }, exists?: (f: string) => boolean): AudioJob[]
export function knownIds(manifest: Manifest): Set<string>
export function convertArgs(kind: string, input: string, output: string): string[]
export function withEnabled(manifest: Manifest, ids: Set<string>, value?: boolean): Manifest
