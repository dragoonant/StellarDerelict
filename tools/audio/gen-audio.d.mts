export function hasFfmpeg(): boolean
export function parseArgv(argv: string[], manifest: { sounds: any[]; music: any[]; voice: any[] }): { help: boolean; dryRun: boolean; force: boolean; enable: boolean; kind: string | null; only: Set<string> | null; base: string; timeoutMs: number }
export function main(argv: string[], io?: { log: (m: string) => void; err: (m: string) => void }): Promise<number>
