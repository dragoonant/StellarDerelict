// A generated model in the scene, or its procedural stand-in. KB rule 26: the model is preloaded at startup and nothing is
// drawn for it while it loads (Suspense fallback null); the stand-in shows only when the slug is not enabled or its load
// failed. KB rule 25: no pointer handlers anywhere in here, and the model is not raycast.
import { Suspense, use, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { Color, Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three'
import { tokens } from '../tokens'
import { modelStore, type ModelSnapshot, type ModelStore } from './store'

export function useModelProgress(): ModelSnapshot {
  return useSyncExternalStore(modelStore.subscribe, modelStore.snapshot)
}

function Instance({ store, slug, tint, children }: { store: ModelStore; slug: string; tint: boolean; children: ReactNode }) {
  const peek = store.peek(slug)
  const rec = peek && peek.status !== 'loading' ? peek : use(store.load(slug))
  const node = useMemo<Object3D | null>(() => {
    if (rec.status !== 'ready' || !rec.proto) return null
    const root = rec.proto.clone(true)
    root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      m.raycast = () => undefined // never pickable
      const mats: Material[] = Array.isArray(m.material) ? m.material : [m.material]
      const own = mats.map((x) => x.clone())
      m.material = Array.isArray(m.material) ? own : (own[0] as Material)
    })
    return root
  }, [rec])
  useEffect(() => {
    if (!node) return
    store.mount(slug)
    return () => store.unmount(slug)
  }, [node, slug, store])
  useEffect(() => {
    if (!node) return
    node.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) {
        const s = x as MeshStandardMaterial
        if (s.emissive) {
          const base = (s.userData.baseEmissive ??= s.emissive.clone()) as Color
          s.emissive = tint ? new Color(tokens.alarm) : base.clone()
          s.emissiveIntensity = tint ? 0.25 : 1
        }
      }
    })
  }, [node, tint])
  if (!node) return <>{children}</>
  return <primitive object={node} />
}

/** `fallback` is the procedural figure; `tint` marks a breached Warden. */
export function ModelFigure({ slug, tint = false, fallback, store = modelStore }: { slug: string; tint?: boolean; fallback: ReactNode; store?: ModelStore }) {
  if (!store.enabled(slug)) return <>{fallback}</>
  return (
    <Suspense fallback={null}>
      <Instance store={store} slug={slug} tint={tint}>
        {fallback}
      </Instance>
    </Suspense>
  )
}
