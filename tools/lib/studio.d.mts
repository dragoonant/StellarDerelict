export const REPO_ROOT: string
export const sleep: (ms: number) => Promise<void>
export class UsageError extends Error {
  exitCode: number
}
export function classifyStatus(job: unknown): 'done' | 'failed' | 'pending'
export function jobFileNames(job: unknown, fallback?: string[]): string[]
export function http(base: string, method: string, route: string, opts?: { body?: unknown; timeoutMs?: number; raw?: boolean }): Promise<any>
export function runJob(
  base: string,
  body: unknown,
  opts?: { pollMs?: number; timeoutMs?: number; want?: number; fallbackNames?: string[]; onId?: (id: string | null) => void },
): Promise<{ id: string; files: { name: string; data: Buffer }[]; seconds: number }>
export function parseFlags(argv: string[], options: Record<string, { type: 'string' | 'boolean'; short?: string }>): Record<string, string | boolean | undefined>
export const list: (text: unknown) => string[]
export function isMain(metaUrl: string): boolean
