// Generated 2D art (spec 70): board textures and decals as three.js textures, portraits and key art as plain image URLs.
// Nothing is requested unless the manifest marks it enabled (`?art=none` turns it all off, for tests and for a look at the
// bare board). KB rule 26: board textures are loaded before a mission opens (the start buttons wait on `snapshot().ready`),
// so a plate is never shown flat first and textured a moment later. A file that fails to load is left out and listed.
import { DataTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three'
import { assets, type ImageEntry } from '../../data'

export interface ArtSnapshot {
  total: number
  loaded: number
  failed: { id: string; reason: string }[]
  ready: boolean
}

export const artUrl = (file: string): string => import.meta.env.BASE_URL + 'assets/' + file

const off = typeof location !== 'undefined' && new URLSearchParams(location.search).get('art') === 'none'
const isBoard = (im: ImageEntry): boolean => im.kind === 'texture' || im.kind === 'decal'

class ArtStore {
  private readonly want: ImageEntry[] = off ? [] : assets.images.filter((im) => im.enabled)
  private readonly tex = new Map<string, Texture>()
  private readonly state = new Map<string, 'loading' | 'ready' | 'failed'>()
  private readonly reasons = new Map<string, string>()
  private readonly listeners = new Set<() => void>()
  private snap: ArtSnapshot = this.compute()
  private started = false

  /** Enabled images for one `use`, in manifest order. */
  entries(use: string): ImageEntry[] {
    return this.want.filter((im) => im.use === use)
  }

  /** The URL of the first enabled image for a use (portraits and key art), or null: the screen then shows nothing there. */
  url(use: string): string | null {
    const im = this.entries(use)[0]
    return im && this.state.get(im.id) !== 'failed' ? artUrl(im.file) : null
  }

  /** Loaded board textures for a use (floor, wall, ceiling, door, duct, scar:burn, scar:kill); empty until they are in. */
  textures(use: string): Texture[] {
    const out: Texture[] = []
    for (const im of this.entries(use)) {
      const t = this.tex.get(im.id)
      if (t && this.state.get(im.id) === 'ready') out.push(t)
    }
    return out
  }

  /** At app start: every enabled board texture through the texture loader, every screen image through the browser cache. */
  preload(): void {
    if (this.started || typeof document === 'undefined') return
    this.started = true
    const loader = new TextureLoader()
    for (const im of this.want) {
      if (!isBoard(im)) {
        const el = new Image()
        el.decoding = 'async'
        el.onerror = () => this.settle(im.id, 'failed', 'did not load')
        el.src = artUrl(im.file)
        continue
      }
      this.state.set(im.id, 'loading')
      loader.load(
        artUrl(im.file),
        (t) => {
          // a greyscale surface texture is a multiplier for the tint, read as plain numbers; a decal is a picture
          t.colorSpace = im.kind === 'texture' ? NoColorSpace : SRGBColorSpace
          t.anisotropy = 8
          if (im.use === 'ceiling') t.wrapS = t.wrapT = RepeatWrapping
          this.tex.set(im.id, t)
          this.settle(im.id, 'ready')
        },
        undefined,
        () => this.settle(im.id, 'failed', 'did not load'),
      )
    }
    this.emit()
  }

  private settle(id: string, s: 'ready' | 'failed', reason = ''): void {
    this.state.set(id, s)
    if (s === 'failed') {
      this.reasons.set(id, reason)
      console.warn(`Stellar Derelict: image "${id}" failed to load; the screen goes without it.`)
    }
    this.emit()
  }

  private compute(): ArtSnapshot {
    const board = this.want.filter(isBoard)
    let loaded = 0
    for (const im of board) if ((this.state.get(im.id) ?? 'loading') !== 'loading') loaded++
    const failed = [...this.reasons].map(([id, reason]) => ({ id, reason }))
    return { total: board.length, loaded, failed, ready: loaded >= board.length }
  }
  private emit(): void {
    this.snap = this.compute()
    this.listeners.forEach((f) => f())
  }
  snapshot = (): ArtSnapshot => this.snap
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  /** ids enabled in this session (test hook) */
  enabledIds(): string[] {
    return this.want.map((im) => im.id)
  }
}

export const artStore = new ArtStore()

let white: DataTexture | null = null
/** A 1 x 1 white texture: a material that always carries a map needs no shader rebuild when the art arrives or is off. */
export function whiteTexture(): Texture {
  if (!white) {
    white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    white.colorSpace = NoColorSpace
    white.needsUpdate = true
  }
  return white
}
