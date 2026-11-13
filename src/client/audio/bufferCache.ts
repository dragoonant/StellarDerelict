// Lazily fetched, cached buffers. A missing or failed file is remembered and skipped silently: nothing throws, nothing is logged.
export class BufferCache<B> {
  private readonly ok = new Map<string, B>()
  private readonly pending = new Map<string, Promise<B | null>>()
  private readonly failed = new Set<string>()
  constructor(
    private readonly fetchBytes: (url: string) => Promise<ArrayBuffer>,
    private readonly decode: (bytes: ArrayBuffer) => Promise<B>,
  ) {}

  peek(url: string): B | undefined {
    return this.ok.get(url)
  }
  hasFailed(url: string): boolean {
    return this.failed.has(url)
  }
  failures(): string[] {
    return [...this.failed]
  }

  get(url: string): Promise<B | null> {
    const hit = this.ok.get(url)
    if (hit !== undefined) return Promise.resolve(hit)
    if (this.failed.has(url)) return Promise.resolve(null)
    const p = this.pending.get(url)
    if (p) return p
    const job = (async (): Promise<B | null> => {
      try {
        const b = await this.decode(await this.fetchBytes(url))
        this.ok.set(url, b)
        return b
      } catch {
        this.failed.add(url)
        return null
      } finally {
        this.pending.delete(url)
      }
    })()
    this.pending.set(url, job)
    return job
  }
}
