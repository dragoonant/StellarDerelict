type Manifest = { sounds: any[]; music: any[]; voice: any[]; models?: any[]; voices?: Record<string, any>; audio?: any }
export type ElevenRequest = { route: string; body: Record<string, any> }
export type ElevenJob = { kind: 'sfx' | 'music' | 'voice'; id: string; file: string; request: ElevenRequest | { error: string }; estimate: number }
export const API: string
export const RAW_DIR: string
export const OUTPUT_FORMAT: string
export const MODELS: { sfx: string; music: string; tts: string; design: string }
export const CREDITS: { sfxPerSecond: number; musicPerSecond: number; ttsPerChar: number }
export const SFX_SECONDS: [number, number]
export const MUSIC_MS: [number, number]
export const KINDS: string[]
export function sfxRequest(s: any): ElevenRequest
export function musicRequest(m: any): ElevenRequest
export function spokenText(v: any): string
export function voiceRequest(v: any, voices: Record<string, any> | undefined): ElevenRequest
export function estimateCredits(kind: 'sfx' | 'music' | 'voice', entry: any): number
export function planEleven(manifest: Manifest, opts?: { only?: Set<string> | null; kind?: string | null; force?: boolean }, exists?: (f: string) => boolean): ElevenJob[]
export function totalEstimate(jobs: ElevenJob[]): number
export function knownIds(manifest: Manifest): Set<string>
export function designRequest(speaker: string, manifest: Manifest): ElevenRequest
export function adoptRequest(speaker: string, manifest: Manifest, generatedVoiceId: string): ElevenRequest
export function withVoiceId<M extends Manifest>(manifest: M, speaker: string, voiceId: string): M
export function retryDelayMs(status: number, attempt: number, retryAfterHeader?: string | null): number | null
