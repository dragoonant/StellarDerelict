// The fires of the wreck (spec 70 ART-9): flames at each burning breach and the light they throw on the deck. Drawn in a
// shader (no image, no pointer handlers, KB rule 25). A burning bulkhead is scenery: the rule state "burning square" is the
// flickering square fill of spec 50, which these never use (their light is a soft round pool that crosses square edges).
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial } from 'three'
import type { Group, MeshBasicMaterial } from 'three'
import type { Pos } from '../../engine'
import { geoOf } from '../../engine/grid'
import { tileHash } from '../../data'
import { WALL_H, toWorldX, toWorldZ, type Dims } from './layout'
import { visorRt } from './visor'
import { ease, VISOR_WALL_H } from './visorModel'

const VERT = /* glsl */ `
attribute vec2 corner;
attribute vec2 size;
attribute float seed;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = corner;
  vSeed = seed;
  // a billboard: the quad is laid out in view space around its foot, and sways a little
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float sway = sin(uTime * 3.1 + seed * 40.0) * 0.04 * corner.y;
  mv.x += (corner.x - 0.5 + sway) * size.x;
  mv.y += corner.y * size.y;
  gl_Position = projectionMatrix * mv;
}`

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uGain;
varying vec2 vUv;
varying float vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return 0.55 * noise(p) + 0.3 * noise(p * 2.1 + 3.7) + 0.15 * noise(p * 4.3 + 9.1); }
void main() {
  float t = uTime * (1.5 + fract(vSeed * 7.0) * 0.6);
  float n = fbm(vec2(vUv.x * 3.2 + vSeed * 17.0, vUv.y * 2.6 - t * 1.25));
  float n2 = fbm(vec2(vUv.x * 6.0 - vSeed * 9.0, vUv.y * 5.0 - t * 2.1));
  float w = 1.0 - abs(vUv.x - 0.5) * 2.0;
  // a teardrop that the noise eats from the top and the sides
  float body = w * (1.2 - vUv.y) - vUv.y * 0.45 + (n - 0.5) * 0.95 + (n2 - 0.5) * 0.3;
  float a = smoothstep(0.06, 0.5, body) * smoothstep(0.0, 0.07, vUv.y);
  float heat = clamp(body * (1.25 - vUv.y * 0.8), 0.0, 1.0);
  vec3 col = mix(vec3(0.75, 0.1, 0.02), vec3(1.0, 0.42, 0.06), smoothstep(0.1, 0.45, heat));
  col = mix(col, vec3(1.0, 0.8, 0.32), smoothstep(0.45, 0.8, heat));
  col = mix(col, vec3(1.0, 0.97, 0.8), smoothstep(0.82, 1.0, heat));
  gl_FragColor = vec4(col * a * uGain, a);
}`

let glowTex: CanvasTexture | null = null
function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const x = c.getContext('2d')
  if (x) {
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.14)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g
    x.fillRect(0, 0, 128, 128)
  }
  glowTex = new CanvasTexture(c)
  return glowTex
}

const FIRE_LIGHT = new Color(1.0, 0.42, 0.1)
const pool = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

interface Flame {
  x: number
  y: number
  z: number
  w: number
  h: number
  seed: number
}

function flameGeometry(flames: Flame[]): BufferGeometry {
  const n = flames.length
  const pos = new Float32Array(n * 4 * 3)
  const corner = new Float32Array(n * 4 * 2)
  const size = new Float32Array(n * 4 * 2)
  const seed = new Float32Array(n * 4)
  const index: number[] = []
  const corners = [0, 0, 1, 0, 1, 1, 0, 1]
  flames.forEach((f, i) => {
    for (let k = 0; k < 4; k++) {
      pos.set([f.x, f.y, f.z], (i * 4 + k) * 3)
      corner.set([corners[k * 2] as number, corners[k * 2 + 1] as number], (i * 4 + k) * 2)
      size.set([f.w, f.h], (i * 4 + k) * 2)
      seed[i * 4 + k] = f.seed
    }
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('corner', new BufferAttribute(corner, 2))
  g.setAttribute('size', new BufferAttribute(size, 2))
  g.setAttribute('seed', new BufferAttribute(seed, 1))
  g.setIndex(index)
  return g
}

export function Fires({ mission, dims, fires }: { mission: string; dims: Dims; fires: Pos[] }) {
  const { foot, crown } = useMemo(() => {
    const g = geoOf(mission)
    const open = (x: number, y: number): boolean => (g.terrain[y]?.[x] ?? 'wall') !== 'wall'
    const foot: Flame[] = []
    const crown: Flame[] = []
    for (const [x, y] of fires) {
      const cx = toWorldX(dims, x)
      const cz = toWorldZ(dims, y)
      const s = (tileHash(x, y) % 1000) / 1000
      // on the map: the fire that has eaten through the top of the bulkhead
      crown.push({ x: cx - 0.12, y: WALL_H, z: cz + 0.05, w: 0.7, h: 0.95, seed: s })
      crown.push({ x: cx + 0.16, y: WALL_H, z: cz - 0.1, w: 0.5, h: 0.7, seed: s + 0.37 })
      // in every view: flames licking out of the breach at the foot of each face that meets the deck
      const faces: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]
      faces.forEach(([dx, dy], k) => {
        if (!open(x + dx, y + dy)) return
        foot.push({ x: cx + dx * 0.56, y: 0.04, z: cz + dy * 0.56, w: 0.5, h: 0.62, seed: s + 0.11 * (k + 1) })
        foot.push({ x: cx + dx * 0.53 + dy * 0.2, y: 0.04, z: cz + dy * 0.53 + dx * 0.2, w: 0.3, h: 0.4, seed: s + 0.23 * (k + 1) })
      })
    }
    return { foot, crown }
  }, [mission, dims, fires])
  const footGeo = useMemo(() => flameGeometry(foot), [foot])
  const crownGeo = useMemo(() => flameGeometry(crown), [crown])
  const mat = useMemo(() => new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTime: { value: 0 }, uGain: { value: 1 } }, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }), [])
  const crownRef = useRef<Group>(null)
  const poolRef = useRef<InstancedMesh>(null)
  const poolMat = useRef<MeshBasicMaterial>(null)
  const topRef = useRef<InstancedMesh>(null)
  const topMat = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    ;(mat.uniforms.uTime as { value: number }).value = t
    const e = ease(visorRt.blend)
    // under the deckhead of the visor the crown is above the ceiling: only the breach flames show
    if (crownRef.current) crownRef.current.visible = e < 0.5
    const flick = 0.82 + 0.12 * Math.sin(t * 9.1) * Math.sin(t * 5.3) + 0.06 * Math.sin(t * 23.0)
    if (poolMat.current) poolMat.current.opacity = (0.3 + 0.16 * e) * flick
    if (topMat.current) topMat.current.opacity = 0.5 * flick
    if (topRef.current) {
      topRef.current.visible = e < 0.5
      topRef.current.position.y = WALL_H * (1 + e * (VISOR_WALL_H / WALL_H - 1)) + 0.012
    }
  })
  // the pools: one on the deck around each fire (the walls stand in it and hide their share), one on the wall tops
  const place = (m: InstancedMesh | null, y: number, size: number): void => {
    if (!m) return
    const t = new Matrix4()
    fires.forEach(([x, yy], i) => {
      t.makeScale(size, 1, size).setPosition(toWorldX(dims, x), y, toWorldZ(dims, yy))
      m.setMatrixAt(i, t)
    })
    m.instanceMatrix.needsUpdate = true
  }
  if (fires.length === 0) return null
  return (
    <group>
      <instancedMesh
        key={`pool-${fires.length}`}
        ref={(m) => {
          poolRef.current = m
          place(m, 0.036, 4.4)
        }}
        args={[pool, undefined, fires.length]}
        frustumCulled={false}
      >
        <meshBasicMaterial ref={poolMat} map={glowTexture()} color={FIRE_LIGHT} transparent opacity={0.3} depthWrite={false} blending={AdditiveBlending} fog={false} />
      </instancedMesh>
      <instancedMesh
        key={`top-${fires.length}`}
        ref={(m) => {
          topRef.current = m
          place(m, 0, 2.6)
        }}
        args={[pool, undefined, fires.length]}
        frustumCulled={false}
      >
        <meshBasicMaterial ref={topMat} map={glowTexture()} color={FIRE_LIGHT} transparent opacity={0.5} depthWrite={false} blending={AdditiveBlending} fog={false} />
      </instancedMesh>
      <mesh geometry={footGeo} material={mat} frustumCulled={false} renderOrder={5} />
      <group ref={crownRef}>
        <mesh geometry={crownGeo} material={mat} frustumCulled={false} renderOrder={5} />
      </group>
    </group>
  )
}
