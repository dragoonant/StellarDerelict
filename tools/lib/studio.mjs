// Shared pieces for the studio runners (Flux Studio :7880, Audio Studio :7890): HTTP with timeouts, job polling,
// flag parsing. Node 22, no dependencies; paths use node:path only so it runs from a Windows shell too.
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A bad command line or an unreachable studio: the message is for the person at the keyboard; exit code 2. */
export class UsageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageError'
    this.exitCode = 2
  }
}

const DONE = ['done', 'completed', 'complete', 'succeeded', 'success', 'finished', 'ready']
const FAILED = ['error', 'failed', 'failure', 'cancelled', 'canceled']

/** 'done' | 'failed' | 'pending' from whatever status word the studio uses. */
export function classifyStatus(job) {
  const s = String(job?.status ?? job?.state ?? '').toLowerCase()
  if (DONE.includes(s)) return 'done'
  if (FAILED.includes(s)) return 'failed'
  return 'pending'
}

/** File names a finished job lists (strings or {name|file|filename}); `fallback` names are used when it lists none. */
export function jobFileNames(job, fallback = []) {
  for (const key of ['audios', 'images', 'files', 'outputs', 'audio', 'results']) {
    const v = job?.[key]
    if (Array.isArray(v) && v.length) {
      const names = v
        .map((e) => (typeof e === 'string' ? e : (e?.name ?? e?.file ?? e?.filename ?? '')))
        .map((s) => String(s).split(/[\\/]/).pop())
        .filter(Boolean)
      if (names.length) return names
    }
  }
  return fallback
}

export async function http(base, method, route, { body, timeoutMs = 30000, raw = false } = {}) {
  const res = await fetch(base + route, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${method} ${route} -> HTTP ${res.status} ${text.slice(0, 300)}`)
  }
  return raw ? Buffer.from(await res.arrayBuffer()) : await res.json().catch(() => ({}))
}

/**
 * Post one job, poll until it finishes, download its files. Cancels the job on timeout.
 * Returns { id, files: [{ name, data: Buffer }] }. `want` is how many files to download at most.
 */
export async function runJob(base, body, { pollMs = 2000, timeoutMs = 900000, want = 1, fallbackNames = [], onId = () => {} } = {}) {
  const created = await http(base, 'POST', '/api/jobs', { body })
  const id = created?.id ?? created?.jobId
  if (!id) throw new Error(`the studio did not return a job id: ${JSON.stringify(created).slice(0, 200)}`)
  onId(id)
  const t0 = Date.now()
  let wait = pollMs
  let job = {}
  try {
    for (;;) {
      await sleep(wait)
      wait = Math.min(Math.round(wait * 1.5), 10000)
      job = await http(base, 'GET', `/api/jobs/${encodeURIComponent(id)}`)
      const state = classifyStatus(job)
      if (state === 'done') break
      if (state === 'failed') throw new Error(`job ${id} ${job.status}: ${String(job.error ?? job.message ?? '').slice(0, 300)}`)
      if (Date.now() - t0 > timeoutMs) {
        await http(base, 'POST', `/api/jobs/${encodeURIComponent(id)}/cancel`, { body: {}, timeoutMs: 10000 }).catch(() => {})
        throw new Error(`job ${id} did not finish within ${Math.round(timeoutMs / 1000)} s (cancelled)`)
      }
    }
  } finally {
    onId(null)
  }
  const files = []
  for (const name of jobFileNames(job, fallbackNames).slice(0, want)) {
    const data = await http(base, 'GET', `/files/${encodeURIComponent(id)}/${encodeURIComponent(name)}`, { raw: true, timeoutMs: 120000 })
    files.push({ name, data })
  }
  return { id, files, seconds: (Date.now() - t0) / 1000 }
}

/** Parse flags with node:util; throws UsageError with a readable message. */
export function parseFlags(argv, options) {
  try {
    return parseArgs({ args: argv, options, allowPositionals: false, strict: true }).values
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e))
  }
}

export const list = (text) => String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean)

/** True when this module file was started directly with `node file.mjs`. */
export function isMain(metaUrl) {
  return !!process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(metaUrl))
}
