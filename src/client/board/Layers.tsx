// Tile washes (instanced planes): lit sections, burning squares, highlights for legal squares, the hover and inspect marks,
// and the effects that are drawn from engine events (tracers, bursts, rings). No pointer handlers.
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BoxGeometry, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Vector3 } from 'three'
import type { MeshBasicMaterial, Texture } from 'three'
import type { Pos } from '../../engine'
import { setStore, useStore, type Fx } from '../store'
import { useBoardTextures } from './Deck'
import type { Scar } from './scars'
import { wreckOf } from './wreck'
import { tokens } from '../tokens'
import { toWorldX, toWorldZ, type Dims } from './layout'

const plane = new PlaneGeometry(0.88, 0.88).rotateX(-Math.PI / 2)

export function TileLayer({ dims, squares, color, opacity, y = 0.03, flicker = 0 }: { dims: Dims; squares: Pos[]; color: string; opacity: number; y?: number; flicker?: number }) {
  const ref = useRef<InstancedMesh>(null)
  const mat = useRef<MeshBasicMaterial>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const t = new Matrix4()
    squares.forEach((p, i) => m.setMatrixAt(i, t.makeTranslation(toWorldX(dims, p[0]), y, toWorldZ(dims, p[1]))))
    m.instanceMatrix.needsUpdate = true
  }, [squares, dims, y])
  useFrame(({ clock }) => {
    if (mat.current && flicker > 0) mat.current.opacity = opacity + flicker * Math.sin(clock.elapsedTime * 13) * Math.sin(clock.elapsedTime * 5.3)
  })
  if (squares.length === 0) return null
  return (
    <instancedMesh key={squares.length} ref={ref} args={[plane, undefined, squares.length]} frustumCulled={false}>
      <meshBasicMaterial ref={mat} color={color} transparent opacity={opacity} fog={false} depthWrite={false} blending={AdditiveBlending} />
    </instancedMesh>
  )
}

const mark = new PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2)

function ScarSet({ dims, scars, tex, y, opacity }: { dims: Dims; scars: Scar[]; tex: Texture; y: number; opacity: number }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const t = new Matrix4()
    const turn = new Matrix4()
    scars.forEach((s, i) => {
      // a turn and a small shift per mark, so two splashes on one square do not sit exactly on each other
      turn.makeRotationY(((s.n >>> 2) % 8) * (Math.PI / 4))
      const dx = (((s.n >>> 5) % 5) - 2) * 0.03
      const dz = (((s.n >>> 8) % 5) - 2) * 0.03
      m.setMatrixAt(i, t.makeTranslation(toWorldX(dims, s.at[0]) + dx, y + (i % 4) * 0.0005, toWorldZ(dims, s.at[1]) + dz).multiply(turn))
    })
    m.instanceMatrix.needsUpdate = true
  }, [scars, dims, y])
  return (
    <instancedMesh ref={ref} args={[mark, undefined, scars.length]} frustumCulled={false}>
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} />
    </instancedMesh>
  )
}

/** What the wreck already carries (spec 70 ART-9): old claw marks, debris, stains and scorching, from wreck.ts. */
export function Dressing({ mission, dims }: { mission: string; dims: Dims }) {
  const claw = useBoardTextures('dress:claw')
  const debris = useBoardTextures('dress:debris')
  const stain = useBoardTextures('scar:kill')
  const scorch = useBoardTextures('scar:burn')
  const sets = useMemo(() => {
    const out: { key: string; scars: Scar[]; tex: Texture; y: number; opacity: number }[] = []
    const dress = wreckOf(mission).dress
    const split = (kind: string, texs: Texture[], y: number, opacity: number): void => {
      texs.forEach((tex, k) => {
        const mine = dress.filter((d) => d.kind === kind && d.n % texs.length === k).map((d, i) => ({ id: i, at: d.at, kind: 'burn' as const, n: d.n }))
        if (mine.length) out.push({ key: `${kind}${k}-${mine.length}`, scars: mine, tex, y, opacity })
      })
    }
    split('scorch', scorch, 0.0135, 0.5)
    split('stain', stain, 0.014, 0.55)
    split('claw', claw, 0.0145, 0.9)
    split('debris', debris, 0.015, 0.95)
    return out
  }, [mission, claw, debris, stain, scorch])
  return (
    <group>
      {sets.map((s) => (
        <ScarSet key={s.key} dims={dims} scars={s.scars} tex={s.tex} y={s.y} opacity={s.opacity} />
      ))}
    </group>
  )
}

/** Marks the fight has left on the deck (spec 70 ART-6): burn marks and splashes, drawn only when their decals are loaded. */
export function Scars({ dims }: { dims: Dims }) {
  const scars = useStore((s) => s.scars)
  const burnTex = useBoardTextures('scar:burn')
  const killTex = useBoardTextures('scar:kill')
  const sets = useMemo(() => {
    const out: { key: string; scars: Scar[]; tex: Texture; y: number; opacity: number }[] = []
    const split = (kind: Scar['kind'], texs: Texture[], y: number, opacity: number): void => {
      texs.forEach((tex, k) => {
        const mine = scars.filter((s) => s.kind === kind && s.n % texs.length === k)
        if (mine.length) out.push({ key: `${kind}${k}-${mine.length}`, scars: mine, tex, y, opacity })
      })
    }
    split('burn', burnTex, 0.021, 0.68)
    split('kill', killTex, 0.023, 0.9)
    return out
  }, [scars, burnTex, killTex])
  return (
    <group>
      {sets.map((s) => (
        <ScarSet key={s.key} dims={dims} scars={s.scars} tex={s.tex} y={s.y} opacity={s.opacity} />
      ))}
    </group>
  )
}

const bar = new BoxGeometry(1, 0.05, 0.05)

function Tracer({ dims, fx }: { dims: Dims; fx: Fx }) {
  const ref = useRef<Mesh>(null)
  const spark = useRef<Mesh>(null)
  const { a, b, len, ang } = useMemo(() => {
    const from = fx.from as Pos
    const to = fx.to as Pos
    const a = new Vector3(toWorldX(dims, from[0]), 0.55, toWorldZ(dims, from[1]))
    const b = new Vector3(toWorldX(dims, to[0]), 0.55, toWorldZ(dims, to[1]))
    const d = b.clone().sub(a)
    return { a, b, len: d.length(), ang: Math.atan2(d.x, d.z) }
  }, [fx, dims])
  const miss = !fx.hit
  const total = miss ? len + 1.6 : len
  useFrame(() => {
    const t = (performance.now() - fx.born) / fx.ms
    const m = ref.current
    if (!m) return
    m.visible = t >= 0 && t < 1
    const head = Math.min(1, t * 2.2) * total
    const tail = Math.max(0, head - 3)
    m.scale.x = Math.max(0.01, head - tail)
    const mid = (head + tail) / 2
    m.position.set(a.x + (b.x - a.x) * (mid / len), 0.55, a.z + (b.z - a.z) * (mid / len))
    ;(m.material as { opacity: number }).opacity = 1 - t * t
    if (spark.current) {
      spark.current.visible = t > 0.35 && t < 1
      const s = fx.hit ? 0.5 * (1 - t) + 0.2 : 0.18
      spark.current.scale.setScalar(s)
      const at = miss ? total : len
      spark.current.position.set(a.x + (b.x - a.x) * (at / len), 0.55, a.z + (b.z - a.z) * (at / len))
    }
  })
  return (
    <>
      <mesh ref={ref} geometry={bar} rotation-y={ang - Math.PI / 2}>
        <meshBasicMaterial color={fx.hit ? tokens.lit : tokens.scan} transparent fog={false} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={spark}>
        <octahedronGeometry args={[1]} />
        <meshBasicMaterial color={fx.hit ? tokens.lit : tokens.alarm} transparent opacity={0.9} fog={false} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  )
}

function Ring({ dims, fx }: { dims: Dims; fx: Fx }) {
  const ref = useRef<Mesh>(null)
  const to = fx.to as Pos
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const t = (performance.now() - fx.born) / fx.ms
    m.visible = t >= 0 && t < 1
    // a revealing ping collapses inward; an arriving one ripples outward
    const s = fx.hit ? 1.8 - 1.3 * t : 0.4 + 1.4 * t
    m.scale.setScalar(s)
    ;(m.material as { opacity: number }).opacity = 0.9 * (1 - t)
  })
  return (
    <mesh ref={ref} position={[toWorldX(dims, to[0]), 0.06, toWorldZ(dims, to[1])]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.4, 0.46, 32]} />
      <meshBasicMaterial color={tokens.molt} transparent fog={false} blending={AdditiveBlending} depthWrite={false} />
    </mesh>
  )
}

function Wash({ dims, fx, color }: { dims: Dims; fx: Fx; color: string }) {
  const squares = fx.squares ?? []
  const mat = useRef<MeshBasicMaterial>(null)
  const grp = useRef<Mesh>(null)
  useFrame(() => {
    const t = (performance.now() - fx.born) / fx.ms
    if (mat.current) mat.current.opacity = t < 0 || t > 1 ? 0 : 0.7 * Math.sin(Math.PI * Math.min(1, t))
    if (grp.current) grp.current.visible = t >= 0 && t <= 1
  })
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const t = new Matrix4()
    squares.forEach((p, i) => m.setMatrixAt(i, t.makeTranslation(toWorldX(dims, p[0]), 0.05, toWorldZ(dims, p[1]))))
    m.instanceMatrix.needsUpdate = true
  }, [squares, dims])
  if (squares.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[plane, undefined, squares.length]} frustumCulled={false}>
      <meshBasicMaterial ref={mat} color={color} transparent opacity={0} fog={false} depthWrite={false} blending={AdditiveBlending} />
    </instancedMesh>
  )
}

function Wreck({ dims, fx }: { dims: Dims; fx: Fx }) {
  const ref = useRef<Mesh>(null)
  const to = fx.to as Pos
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const t = (performance.now() - fx.born) / fx.ms
    m.visible = t >= 0 && t < 1
    m.scale.setScalar(0.3 + t * 1.1)
    ;(m.material as { opacity: number }).opacity = 0.8 * (1 - t)
  })
  return (
    <mesh ref={ref} position={[toWorldX(dims, to[0]), 0.45, toWorldZ(dims, to[1])]}>
      <octahedronGeometry args={[0.5]} />
      <meshBasicMaterial color={fx.flag === 'warden' ? tokens.alarm : tokens.molt} transparent fog={false} blending={AdditiveBlending} depthWrite={false} />
    </mesh>
  )
}

export function Effects({ dims }: { dims: Dims }) {
  const fx = useStore((s) => s.fx)
  useEffect(() => {
    if (fx.length === 0) return
    const now = performance.now()
    const last = Math.max(...fx.map((f) => f.born + f.ms))
    const t = setTimeout(() => setStore((s) => ({ fx: s.fx.filter((f) => performance.now() < f.born + f.ms) })), Math.max(50, last - now + 60))
    return () => clearTimeout(t)
  }, [fx])
  return (
    <group>
      {fx.map((f) =>
        f.kind === 'tracer' ? (
          <Tracer key={f.id} dims={dims} fx={f} />
        ) : f.kind === 'ring' ? (
          <Ring key={f.id} dims={dims} fx={f} />
        ) : f.kind === 'burst' ? (
          <Wash key={f.id} dims={dims} fx={f} color={tokens.alarm} />
        ) : f.kind === 'purge' ? (
          <Wash key={f.id} dims={dims} fx={f} color={tokens.molt} />
        ) : f.kind === 'flash' ? (
          <Wash key={f.id} dims={dims} fx={f} color={tokens.lit} />
        ) : f.kind === 'wreck' ? (
          <Wreck key={f.id} dims={dims} fx={f} />
        ) : null,
      )}
    </group>
  )
}
