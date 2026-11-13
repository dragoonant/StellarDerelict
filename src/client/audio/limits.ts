// Small pure helpers for playback: the voice-line rate limit and variant rotation without immediate repeats.

/** One voice line per `minGapMs`, never starting while another is still playing. */
export class VoiceGate {
  private last = -Infinity
  private busyUntil = -Infinity
  constructor(private readonly minGapMs = 2000) {}
  canPlay(nowMs: number): boolean {
    return nowMs - this.last >= this.minGapMs && nowMs >= this.busyUntil
  }
  /** Give the slot back (the line never played). */
  release(): void {
    this.last = -Infinity
    this.busyUntil = -Infinity
  }
  /** Record a line starting now and lasting `durationMs`. */
  start(nowMs: number, durationMs: number): void {
    this.last = nowMs
    this.busyUntil = nowMs + Math.max(0, durationMs)
  }
}

/** Pick a variant index in [0, n) that is not the last one picked for this id (when n > 1). */
export class VariantRotator {
  private readonly last = new Map<string, number>()
  next(id: string, n: number, rand: () => number = Math.random): number {
    if (n <= 1) return 0
    const prev = this.last.get(id)
    let k = Math.floor(rand() * n) % n
    if (k === prev) k = (k + 1 + Math.floor(rand() * (n - 1))) % n
    this.last.set(id, k)
    return k
  }
}
