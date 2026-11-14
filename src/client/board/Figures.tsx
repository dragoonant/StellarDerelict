// Procedural figures (the models for now: nothing loads, so nothing stands in for anything, KB rule 26).
// No pointer handlers and no hit volumes anywhere in this file (KB rule 25): a figure never blocks a tap on the tile behind it.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BoxGeometry, BufferGeometry, Color, Group, Matrix4, Mesh, SphereGeometry, Sprite, DoubleSide, AdditiveBlending, CanvasTexture, Float32BufferAttribute } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Facing, View, ViewUnit, WardenUnit } from '../../engine'
import { stalkerSlug, wardenSlug } from '../../data'
import { ModelFigure } from '../models/Model'
import { getStore, useStore } from '../store'
import { tokens } from '../tokens'
import { toWorldX, toWorldZ, type Dims } from './layout'
import { figurePose, visorRt } from './visor'

const ROT: Record<Facing, number> = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 }

function box(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  return new BoxGeometry(w, h, d).translate(x, y, z)
}

// A hardsuit from primitives: head about a third of the height, shoulders about twice the head's width, short thick legs.
const wardenGeo = (() => {
  const parts = [
    box(0.2, 0.32, 0.24, -0.13, 0.16, 0),
    box(0.2, 0.32, 0.24, 0.13, 0.16, 0),
    box(0.46, 0.34, 0.28, 0, 0.49, 0),
    box(0.15, 0.2, 0.28, -0.29, 0.62, 0),
    box(0.15, 0.2, 0.28, 0.29, 0.62, 0),
    box(0.3, 0.32, 0.3, 0, 0.84, -0.01),
    box(0.12, 0.08, 0.2, 0, 0.84, -0.17),
    box(0.1, 0.12, 0.5, 0.22, 0.5, -0.3),
    box(0.34, 0.36, 0.14, 0, 0.5, 0.2),
  ]
  const g = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return g
})()

const stalkerGeo = (() => {
  const body = new SphereGeometry(0.5, 10, 6).scale(0.3, 0.13, 0.5).translate(0, 0.3, 0)
  const head = new SphereGeometry(0.5, 8, 6).scale(0.16, 0.12, 0.2).translate(0, 0.32, -0.5)
  const parts: BufferGeometry[] = [body, head]
  for (const s of [-1, 1])
    for (const z of [-0.26, 0, 0.26]) {
      const leg = new BoxGeometry(0.5, 0.03, 0.04)
      leg.applyMatrix4(new Matrix4().makeRotationZ(s * 0.7))
      leg.translate(s * 0.34, 0.16, z)
      parts.push(leg)
    }
  const g = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return g
})()

// The arc of G-5 drawn as a wedge: forward is -z, so the far edge is 8 squares out and 8 either side.
const FAN_R = 6
const fanGeo = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0, -FAN_R, 0, -FAN_R, FAN_R, 0, -FAN_R], 3))
const fanEdge = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0, -FAN_R, 0, -FAN_R, 0, 0, 0, FAN_R, 0, -FAN_R], 3))

let qTex: CanvasTexture | null = null
function questionTexture(): CanvasTexture {
  if (qTex) return qTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d')
  if (x) {
    x.fillStyle = tokens.molt
    x.font = '700 48px "IBM Plex Mono", monospace'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText('?', 32, 36)
  }
  qTex = new CanvasTexture(c)
  return qTex
}

// facing wedge on the tile: a solid triangle in front of the figure (forward is -z)
const wedgeGeo = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([-0.22, 0, -0.4, 0.22, 0, -0.4, 0, 0, -0.74], 3))

const FIGURE_LERP = 14

function useSmoothPlacement(dims: Dims, at: [number, number], unit: string, facing: Facing | null) {
  const ref = useRef<Group>(null)
  const cur = useRef<{ x: number; z: number; r: number } | null>(null)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const tx = toWorldX(dims, at[0])
    const tz = toWorldZ(dims, at[1])
    const tr = facing ? ROT[facing] : 0
    const snap = getStore().settings.speed === 'instant'
    if (!cur.current || snap) cur.current = { x: tx, z: tz, r: tr }
    const k = 1 - Math.exp(-dt * FIGURE_LERP)
    const c = cur.current
    c.x += (tx - c.x) * k
    c.z += (tz - c.z) * k
    let dr = tr - c.r
    while (dr > Math.PI) dr -= Math.PI * 2
    while (dr < -Math.PI) dr += Math.PI * 2
    c.r += dr * k
    // melee lunge: a short jab toward the defender while the beat plays
    let ox = 0
    let oz = 0
    const now = performance.now()
    for (const f of getStore().fx) {
      if (f.kind !== 'lunge' || f.unit !== unit || !f.from || !f.to) continue
      const t = (now - f.born) / f.ms
      if (t < 0 || t > 1) continue
      const a = Math.sin(t * Math.PI) * 0.4
      ox += (f.to[0] - f.from[0]) * a
      oz += (f.to[1] - f.from[1]) * a
    }
    g.position.set(c.x + ox, 0, c.z + oz)
    g.rotation.y = c.r
    const pose = figurePose.get(unit)
    if (pose) {
      pose.x = c.x + ox
      pose.z = c.z + oz
      pose.r = c.r
    } else figurePose.set(unit, { x: c.x + ox, z: c.z + oz, r: c.r })
  })
  return ref
}

function WardenFigure({ dims, u, slug, selected, carrier }: { dims: Dims; u: WardenUnit; slug: string; selected: boolean; carrier: boolean }) {
  const ref = useSmoothPlacement(dims, u.at, u.id, u.facing)
  const body = u.breached ? new Color(tokens.read).lerp(new Color(tokens.alarm), 0.35) : new Color(tokens.read).lerp(new Color(tokens.scan), 0.3)
  const glyph = useRef<Mesh>(null)
  const own = useRef<Group>(null)
  useFrame((_, dt) => {
    if (glyph.current) glyph.current.rotation.y += dt * 1.6
    // in the visor the camera is inside this helmet: the Warden's own figure, ring and marks are not drawn
    if (own.current) own.current.visible = !(visorRt.unit === u.id && visorRt.blend > 0.75)
  })
  return (
    <group ref={ref}>
      {u.alive && (
        <>
          <group ref={own}>
          <ModelFigure
            slug={slug}
            tint={u.breached}
            fallback={
              <mesh geometry={wardenGeo}>
                <meshLambertMaterial color={body} />
              </mesh>
            }
          />
          <mesh geometry={wedgeGeo} position={[0, 0.04, 0]}>
            <meshBasicMaterial color={tokens.lit} fog={false} side={DoubleSide} />
          </mesh>
          {selected && (
            <mesh position={[0, 0.025, 0]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.38, 0.46, 24]} />
              <meshBasicMaterial color={tokens.scan} transparent opacity={0.9} fog={false} blending={AdditiveBlending} depthWrite={false} />
            </mesh>
          )}
          {u.watch && (
            <mesh position={[0, 1.12, 0]}>
              <boxGeometry args={[0.2, 0.06, 0.06]} />
              <meshBasicMaterial color={tokens.alarm} fog={false} />
            </mesh>
          )}
          {carrier && (
            <mesh ref={glyph} position={[0, 1.4, 0]}>
              <octahedronGeometry args={[0.2]} />
              <meshBasicMaterial color={tokens.lit} fog={false} />
            </mesh>
          )}
          </group>
          {selected && (
            <>
              <mesh geometry={fanGeo} position={[0, 0.03, 0]}>
                <meshBasicMaterial color={tokens.scan} transparent opacity={0.07} fog={false} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
              </mesh>
              <lineSegments geometry={fanEdge} position={[0, 0.035, 0]}>
                <lineBasicMaterial color={tokens.scan} transparent opacity={0.3} fog={false} />
              </lineSegments>
            </>
          )}
        </>
      )}
    </group>
  )
}

function StalkerFigure({ dims, u }: { dims: Dims; u: ViewUnit }) {
  const ref = useSmoothPlacement(dims, u.at, u.id, null)
  return (
    <group ref={ref}>
      <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.46, 20]} />
        <meshBasicMaterial color={tokens.molt} transparent opacity={0.35} fog={false} depthWrite={false} />
      </mesh>
      <ModelFigure
        slug={stalkerSlug(u.id)}
        fallback={
          <mesh geometry={stalkerGeo} scale={1.35}>
            <meshBasicMaterial color={tokens.molt} />
          </mesh>
        }
      />
    </group>
  )
}

function PingMarker({ dims, u }: { dims: Dims; u: ViewUnit }) {
  const ref = useSmoothPlacement(dims, u.at, u.id, null)
  const ring = useRef<Mesh>(null)
  const ripple = useRef<Mesh>(null)
  const sprite = useRef<Sprite>(null)
  const tex = useMemo(() => questionTexture(), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ring.current) ring.current.scale.setScalar(1 + 0.12 * Math.sin(t * 4))
    if (ripple.current) {
      const p = (t * 0.5) % 1
      ripple.current.scale.setScalar(0.7 + p * 1.4)
      ;(ripple.current.material as { opacity: number }).opacity = 0.6 * (1 - p)
    }
    if (sprite.current) sprite.current.position.y = 0.55 + 0.05 * Math.sin(t * 3)
  })
  return (
    <group ref={ref}>
      <mesh ref={ring} position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.28, 0.36, 28]} />
        <meshBasicMaterial color={tokens.molt} transparent opacity={0.95} fog={false} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={ripple} position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.36, 0.4, 28]} />
        <meshBasicMaterial color={tokens.molt} transparent opacity={0.5} fog={false} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <sprite ref={sprite} position={[0, 0.55, 0]} scale={[0.5, 0.5, 1]}>
        <spriteMaterial map={tex} transparent fog={false} depthWrite={false} />
      </sprite>
    </group>
  )
}

function LooseCore({ dims, at }: { dims: Dims; at: [number, number] }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 1.6
  })
  return (
    <group ref={ref} position={[toWorldX(dims, at[0]), 0, toWorldZ(dims, at[1])]}>
      <ModelFigure
        slug="core"
        fallback={
          <mesh position={[0, 0.4, 0]}>
            <octahedronGeometry args={[0.2]} />
            <meshBasicMaterial color={tokens.lit} fog={false} />
          </mesh>
        }
      />
    </group>
  )
}

export function Units({ dims, v }: { dims: Dims; v: View }) {
  const selected = useStore((s) => s.selected)
  // the `warden`-role squad members take rifle-a then rifle-b by squad order (the unit list is in squad order)
  const rifle = new Map<string, number>()
  for (const u of v.units) if (u.kind === 'warden' && u.role === 'warden') rifle.set(u.id, rifle.size)
  return (
    <group>
      {v.units.map((u) =>
        u.kind === 'warden' ? (
          <WardenFigure key={u.id} dims={dims} u={u} slug={wardenSlug(u.role, rifle.get(u.id) ?? 0)} selected={selected === u.id} carrier={v.core.carrier === u.id} />
        ) : u.kind === 'stalker' ? (
          <StalkerFigure key={u.id} dims={dims} u={u} />
        ) : (
          <PingMarker key={u.id} dims={dims} u={u} />
        ),
      )}
      {v.core.where === 'loose' && v.core.at && <LooseCore dims={dims} at={v.core.at as [number, number]} />}
    </group>
  )
}
