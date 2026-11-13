// The model store (KB rule 26): every ENABLED model is fetched and parsed when the app opens, the mission's start button
// waits for the loads, and a model that fails to load is recorded (one console warning) so the figure falls back to its
// procedural stand-in. Pure of React and of the DOM except through the injected byte fetcher, so unit tests drive it.
import { Box3, Group, Mesh, Vector3, type BufferGeometry, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { assets, modelEntry, type ModelEntry } from '../../data'
import { smoothNormals } from './smoothNormals'

/** World units per inch of figure height. A 1.6 in Warden stands 1.12 high: a little taller than a square is wide. */
export const WORLD_PER_INCH = 0.7
/** A model is never allowed to be wider than this many squares, whatever its height says. */
export const MAX_FOOTPRINT = 0.95

export type ModelStatus = 'loading' | 'ready' | 'failed'

export interface ModelRecord {
  slug: string
  status: ModelStatus
  /** the fitted model, facing the game's forward (-z), feet on y = 0, centred over the square */
  proto?: Group
  tris: number
  /** height in world units after fitting */
  height: number
  reason?: string
}

export interface ModelSnapshot {
  total: number
  loaded: number
  failed: { slug: string; reason: string }[]
  ready: boolean
}

export const modelUrl = (file: string): string => import.meta.env.BASE_URL + 'assets/' + file

/** Scale a loaded scene to `heightIn`, stand it on y = 0 over its own centre and turn it to face -z (generated models face +z). */
export function fitModel(scene: Object3D, heightIn: number, yawDeg: number): { proto: Group; tris: number; height: number } {
  scene.updateMatrixWorld(true)
  const box = new Box3().setFromObject(scene)
  const size = box.getSize(new Vector3())
  const centre = box.getCenter(new Vector3())
  const want = heightIn * WORLD_PER_INCH
  let k = size.y > 0 ? want / size.y : 1
  const wide = Math.max(size.x, size.z)
  if (wide > 0) k = Math.min(k, MAX_FOOTPRINT / wide)
  const inner = new Group()
  inner.add(scene)
  scene.position.set(-centre.x, -box.min.y, -centre.z)
  const fit = new Group()
  fit.add(inner)
  fit.scale.setScalar(k)
  const proto = new Group()
  proto.add(fit)
  proto.rotation.y = Math.PI + (yawDeg * Math.PI) / 180
  let tris = 0
  scene.traverse((o) => {
    const g = (o as Mesh).geometry as BufferGeometry | undefined
    if (!g) return
    tris += g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3
  })
  return { proto, tris, height: size.y * k }
}

type Bytes = (url: string) => Promise<ArrayBuffer>
const defaultBytes: Bytes = async (url) => {
  const r = await fetch(url)
  const type = r.headers.get('content-type') ?? ''
  if (!r.ok || type.includes('text/html')) throw new Error(`HTTP ${r.status}`)
  return r.arrayBuffer()
}

export class ModelStore {
  private readonly recs = new Map<string, ModelRecord>()
  private readonly jobs = new Map<string, Promise<ModelRecord>>()
  private readonly listeners = new Set<() => void>()
  private snap: ModelSnapshot
  private readonly mounted = new Map<string, number>()
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  private readonly want: Set<string>

  constructor(
    private readonly fetchBytes: Bytes = defaultBytes,
    enabled: (m: ModelEntry) => boolean = (m) => m.enabled,
    private readonly warn: (msg: string) => void = (m) => console.warn(m),
  ) {
    this.want = new Set(assets.models.filter(enabled).map((m) => m.slug))
    this.snap = this.compute()
  }

  enabled(slug: string): boolean {
    return this.want.has(slug)
  }
  enabledSlugs(): string[] {
    return [...this.want]
  }
  peek(slug: string): ModelRecord | undefined {
    return this.recs.get(slug)
  }

  /** Start (or join) the load of one model. `force` loads a model that is not enabled (the gallery). Never rejects. */
  load(slug: string, force = false): Promise<ModelRecord> {
    const hit = this.jobs.get(slug)
    if (hit) return hit
    const entry = modelEntry(slug)
    if (!entry || (!force && !this.want.has(slug))) {
      return Promise.resolve({ slug, status: 'failed', tris: 0, height: 0, reason: 'not enabled' })
    }
    this.recs.set(slug, { slug, status: 'loading', tris: 0, height: 0 })
    const job = (async (): Promise<ModelRecord> => {
      let rec: ModelRecord
      try {
        const bytes = await this.fetchBytes(modelUrl(entry.file))
        const gltf = await this.loader.parseAsync(bytes, '')
        smoothNormals(gltf.scene)
        const f = fitModel(gltf.scene, entry.heightIn, entry.yaw)
        rec = { slug, status: 'ready', proto: f.proto, tris: f.tris, height: f.height }
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        rec = { slug, status: 'failed', tris: 0, height: 0, reason }
        if (this.want.has(slug)) this.warn(`Stellar Derelict: model "${slug}" failed to load (${reason}); using the procedural figure.`)
      }
      this.recs.set(slug, rec)
      this.emit()
      return rec
    })()
    this.jobs.set(slug, job)
    this.emit()
    return job
  }

  /** At app start: every enabled model. */
  preloadEnabled(): void {
    for (const s of this.want) void this.load(s)
  }

  private compute(): ModelSnapshot {
    const failed: { slug: string; reason: string }[] = []
    let loaded = 0
    for (const s of this.want) {
      const r = this.recs.get(s)
      if (r && r.status !== 'loading') loaded++
      if (r?.status === 'failed') failed.push({ slug: s, reason: r.reason ?? 'unknown' })
    }
    return { total: this.want.size, loaded, failed, ready: loaded >= this.want.size }
  }
  private emit(): void {
    this.snap = this.compute()
    this.listeners.forEach((f) => f())
  }
  snapshot = (): ModelSnapshot => this.snap
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  mount(slug: string): void {
    this.mounted.set(slug, (this.mounted.get(slug) ?? 0) + 1)
  }
  unmount(slug: string): void {
    this.mounted.set(slug, Math.max(0, (this.mounted.get(slug) ?? 1) - 1))
  }
  mountedCounts(): Record<string, number> {
    const o: Record<string, number> = {}
    for (const [k, v] of this.mounted) if (v > 0) o[k] = v
    return o
  }
}

/** `?models=fixture` enables every model (the e2e test serves a fixture GLB for each); `?models=a,b` enables just those. */
function overrideFrom(search: string): Set<string> | 'all' | null {
  const v = new URLSearchParams(search).get('models')
  if (!v) return null
  if (v === 'fixture') return 'all'
  return new Set(v.split(',').filter(Boolean))
}

const ov = typeof location === 'undefined' ? null : overrideFrom(location.search)
export const modelStore = new ModelStore(undefined, (m) => m.enabled || ov === 'all' || (ov !== null && ov.has(m.slug)))
