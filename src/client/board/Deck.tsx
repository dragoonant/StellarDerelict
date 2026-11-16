// The static deck: floor plates (instanced, three brightness states), wall extrusions (instanced), edge lines and the
// fixtures (doors, terminals, console, ducts). Nothing here has a pointer handler (KB rule 25).
// Spec 70: the plates, bulkheads, deckhead, door leaves and duct grates carry generated textures of a wrecked ship, shown
// in their own colour: a square seen now is lit as the helmet lamps find it, a mapped one is the cold dim ghost. Some
// bulkheads burn (wreck.ts, Fires.tsx). Without the art every surface falls back to the flat colours of spec 50.
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { Group, LineBasicMaterial, LineSegments, Texture } from 'three'
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { geoOf } from '../../engine/grid'
import type { View } from '../../engine'
import { tileHash } from '../../data'
import { artStore, whiteTexture } from '../art/store'
import { ModelFigure } from '../models/Model'
import { getStore } from '../store'
import { tokens } from '../tokens'
import { WALL_H, toWorldX, toWorldZ, type Dims } from './layout'
import { visorRt } from './visor'
import { ease, VISOR_WALL_H } from './visorModel'
import { variantOf, wreckOf } from './wreck'

/** Loaded board textures for one surface (spec 70); re-renders when the art store settles. Empty means flat colour. */
export function useBoardTextures(use: string): Texture[] {
  const snap = useSyncExternalStore(artStore.subscribe, artStore.snapshot)
  return useMemo(() => artStore.textures(use), [use, snap])
}

/** The draw weights of those textures, in the same order. */
function useBoardWeights(use: string): number[] {
  const snap = useSyncExternalStore(artStore.subscribe, artStore.snapshot)
  return useMemo(() => artStore.weights(use), [use, snap])
}

const scaled = (c: Color, k: number): Color => c.clone().multiplyScalar(k)

/**
 * Light on the textured wreck (multipliers on the picture, in linear light). The open-information read of spec 50 is in the
 * brightness: a square seen now is lit, a mapped one is a dim cold ghost. Only the ghost keeps the sensor teal.
 */
const LIT = {
  seen: new Color(2.15, 2.1, 2.0),
  mapped: new Color(0.24, 0.33, 0.35),
  side: new Color(0.3, 0.3, 0.3),
  sideVisor: new Color(0.5, 0.49, 0.47),
  top: new Color(0.05, 0.055, 0.06),
  topVisor: new Color(0.16, 0.16, 0.16),
  ceiling: new Color(0.16, 0.16, 0.16),
  fire: new Color(1.7, 1.5, 1.3),
  lineSeen: new Color(tokens.scan).multiplyScalar(0.5),
  lineMapped: new Color(tokens.scanDim).multiplyScalar(0.55),
}

/** How much taller walls (and door leaves) stand in the visor: the map's low walls would let a Warden see over every bulkhead. */
export const visorRise = (): number => 1 + ease(visorRt.blend) * (VISOR_WALL_H / WALL_H - 1)

const C = {
  seen: new Color(tokens.deck).lerp(new Color(tokens.scan), 0.42),
  mapped: new Color(tokens.deck).lerp(new Color(tokens.scanDim), 0.45),
  wall: new Color(tokens.void).lerp(new Color(tokens.trace), 0.1),
  wallVisor: new Color(tokens.void).lerp(new Color(tokens.trace), 0.55),
  // textured bulkhead faces: a faint read on the map, a clear one from inside the corridor
  side: new Color(tokens.void).lerp(new Color(tokens.trace), 0.5),
  sideVisor: new Color(tokens.deck).lerp(new Color(tokens.scanDim), 0.8),
  ceiling: new Color(tokens.void).lerp(new Color(tokens.trace), 0.18),
  lineSeen: new Color(tokens.scan),
  lineMapped: new Color(tokens.scanDim),
  trace: new Color(tokens.trace),
}

export function Deck({ mission, dims, seen }: { mission: string; dims: Dims; seen: Set<string> }) {
  const g = geoOf(mission)
  const { floors, walls } = useMemo(() => {
    const floors: [number, number][] = []
    const walls: [number, number][] = []
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        if (g.terrain[y]?.[x] !== 'wall') floors.push([x, y])
        else {
          let near = false
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g.terrain[y + dy]?.[x + dx] !== undefined && g.terrain[y + dy]?.[x + dx] !== 'wall') near = true
          if (near) walls.push([x, y])
        }
      }
    return { floors, walls }
  }, [g])

  const floorTex = useBoardTextures('floor')
  const floorW = useBoardWeights('floor')
  const plainWallTex = useBoardTextures('wall')
  const wallW = useBoardWeights('wall')
  const fireTex = useBoardTextures('wall-fire')[0] ?? null
  const ceilTex = useBoardTextures('ceiling')
  // the burning breaches take the last slot of the wall textures (wreck.ts says which squares burn)
  const wallTex = useMemo(() => (fireTex && plainWallTex.length ? [...plainWallTex, fireTex] : plainWallTex), [plainWallTex, fireTex])
  const fireSlot = fireTex && plainWallTex.length ? plainWallTex.length : -1
  // one instanced mesh per texture variant: a square keeps its plate (and its quarter turn) for the whole mission; the
  // damaged variants are rarer (their weight in the manifest)
  const floorSets = useMemo(() => {
    const n = Math.max(1, floorTex.length)
    const sets: [number, number][][] = Array.from({ length: n }, () => [])
    for (const p of floors) (sets[variantOf(tileHash(p[0], p[1]), floorW)] as [number, number][]).push(p)
    return sets
  }, [floors, floorTex.length, floorW])
  const wallSets = useMemo(() => {
    const n = Math.max(1, wallTex.length)
    const sets: [number, number][][] = Array.from({ length: n }, () => [])
    const burning = new Set(fireSlot >= 0 ? wreckOf(mission).fires.map((f) => `${f[0]},${f[1]}`) : [])
    for (const p of walls) (sets[burning.has(`${p[0]},${p[1]}`) ? fireSlot : variantOf(tileHash(p[0], p[1]), wallW)] as [number, number][]).push(p)
    return sets
  }, [walls, wallTex.length, wallW, fireSlot, mission])
  const floorRefs = useRef<(InstancedMesh | null)[]>([])
  const wallRefs = useRef<(InstancedMesh | null)[]>([])
  // per wall variant: the side material (all four faces: an earlier version lit only one of them) and the top material
  const wallMats = useMemo(() => {
    const topMap = floorTex[3] ?? floorTex[0] ?? null
    return wallSets.map((_, k) => {
      const tex = wallTex[k] ?? null
      const side = new MeshBasicMaterial({ map: tex, color: tex ? LIT.side : C.wall })
      const top = new MeshBasicMaterial({ map: tex ? topMap : null, color: tex ? LIT.top : C.wall })
      return { side, top, textured: tex !== null, all: tex ? [side, side, top, top, side, side] : [top, top, top, top, top, top] }
    })
  }, [wallSets, wallTex, floorTex])
  useEffect(() => () => wallMats.forEach((m) => (m.side.dispose(), m.top.dispose())), [wallMats])

  const plate = useMemo(() => new PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), [])
  const box = useMemo(() => new BoxGeometry(1, WALL_H, 1).translate(0, WALL_H / 2, 0), [])

  useLayoutEffect(() => {
    const m = new Matrix4()
    const turn = new Matrix4()
    floorSets.forEach((set, k) => {
      const f = floorRefs.current[k]
      if (!f) return
      set.forEach(([x, y], i) => {
        // a quarter turn per square (only with a texture: the flat plate looks the same either way)
        turn.makeRotationY(floorTex.length ? ((tileHash(x, y) >>> 4) % 4) * (Math.PI / 2) : 0)
        f.setMatrixAt(i, m.makeTranslation(toWorldX(dims, x), 0.01, toWorldZ(dims, y)).multiply(turn))
      })
      f.instanceMatrix.needsUpdate = true
    })
    wallSets.forEach((set, k) => {
      const w = wallRefs.current[k]
      if (!w) return
      set.forEach(([x, y], i) => w.setMatrixAt(i, m.makeTranslation(toWorldX(dims, x), 0, toWorldZ(dims, y))))
      w.instanceMatrix.needsUpdate = true
    })
  }, [floorSets, wallSets, dims, floorTex.length])

  useLayoutEffect(() => {
    const cs = floorTex.length ? LIT.seen : C.seen
    const cm = floorTex.length ? LIT.mapped : C.mapped
    floorSets.forEach((set, k) => {
      const f = floorRefs.current[k]
      if (!f) return
      set.forEach(([x, y], i) => f.setColorAt(i, seen.has(`${x},${y}`) ? cs : cm))
      if (f.instanceColor) f.instanceColor.needsUpdate = true
    })
  }, [floorSets, seen, floorTex.length])

  // 1 px edge lines: bright where seen now, dim where only mapped
  const lines = useMemo(() => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(floors.length * 8 * 3), 3))
    geo.setAttribute('color', new BufferAttribute(new Float32Array(floors.length * 8 * 3), 3))
    const pos = geo.getAttribute('position') as BufferAttribute
    floors.forEach(([x, y], i) => {
      const cx = toWorldX(dims, x)
      const cz = toWorldZ(dims, y)
      const a = 0.45
      const p = [
        [cx - a, cz - a, cx + a, cz - a],
        [cx + a, cz - a, cx + a, cz + a],
        [cx + a, cz + a, cx - a, cz + a],
        [cx - a, cz + a, cx - a, cz - a],
      ]
      p.forEach((s, k) => {
        pos.setXYZ(i * 8 + k * 2, s[0] as number, 0.02, s[1] as number)
        pos.setXYZ(i * 8 + k * 2 + 1, s[2] as number, 0.02, s[3] as number)
      })
    })
    return geo
  }, [floors, dims])
  useLayoutEffect(() => {
    const col = lines.getAttribute('color') as BufferAttribute
    floors.forEach(([x, y], i) => {
      // on the textured deck the plate itself says seen or mapped, so the sensor outline steps back
      const c = seen.has(`${x},${y}`) ? (floorTex.length ? LIT.lineSeen : C.lineSeen) : floorTex.length ? LIT.lineMapped : C.lineMapped
      for (let k = 0; k < 8; k++) col.setXYZ(i * 8 + k, c.r, c.g, c.b)
    })
    col.needsUpdate = true
  }, [lines, floors, seen, floorTex.length])

  // a faint outline only along the edge where a wall meets the deck (no per-tile grid on wall tops)
  const wallTops = useMemo(() => {
    const geo = new BufferGeometry()
    const pts: number[] = []
    const open = (x: number, y: number): boolean => (g.terrain[y]?.[x] ?? 'wall') !== 'wall'
    for (const [x, y] of walls) {
      const cx = toWorldX(dims, x)
      const cz = toWorldZ(dims, y)
      const a = 0.5
      const y0 = WALL_H + 0.005
      if (open(x, y - 1)) pts.push(cx - a, y0, cz - a, cx + a, y0, cz - a)
      if (open(x + 1, y)) pts.push(cx + a, y0, cz - a, cx + a, y0, cz + a)
      if (open(x, y + 1)) pts.push(cx + a, y0, cz + a, cx - a, y0, cz + a)
      if (open(x - 1, y)) pts.push(cx - a, y0, cz + a, cx - a, y0, cz - a)
    }
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
    return geo
  }, [walls, dims, g])

  // the visor's sensor outline of each wall face that meets the deck: a line along the foot and an upright at each end
  // (drawn 0..1 high and stretched with the walls), so flat black walls still read as corridors from inside
  const visorEdges = useMemo(() => {
    const geo = new BufferGeometry()
    const pts: number[] = []
    const open = (x: number, y: number): boolean => (g.terrain[y]?.[x] ?? 'wall') !== 'wall'
    const face = (ax: number, az: number, bx: number, bz: number): void => {
      // foot, a rib at half height, the top, and the uprights
      for (const h of [0.015, 0.5, 0.995]) pts.push(ax, h, az, bx, h, bz)
      pts.push(ax, 0, az, ax, 1, az, bx, 0, bz, bx, 1, bz)
    }
    for (const [x, y] of walls) {
      const cx = toWorldX(dims, x)
      const cz = toWorldZ(dims, y)
      const a = 0.5
      if (open(x, y - 1)) face(cx - a, cz - a, cx + a, cz - a)
      if (open(x + 1, y)) face(cx + a, cz - a, cx + a, cz + a)
      if (open(x, y + 1)) face(cx + a, cz + a, cx - a, cz + a)
      if (open(x - 1, y)) face(cx - a, cz + a, cx - a, cz - a)
    }
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
    return geo
  }, [walls, dims, g])
  // the visor's deckhead: a dark plate over the whole deck at wall height, with the floor's grid echoed faintly on it
  const ceil = useMemo(() => new PlaneGeometry(dims.w, dims.h).rotateX(Math.PI / 2), [dims])
  // the deckhead texture repeats once a square
  const ceilMap = useMemo(() => {
    const t = ceilTex[0]?.clone()
    if (!t) return null
    t.repeat.set(dims.w, dims.h)
    t.needsUpdate = true
    return t
  }, [ceilTex, dims])
  const ceilRef = useRef<Group>(null)
  const ceilLines = useRef<LineBasicMaterial>(null)
  const topsRef = useRef<Group>(null)
  const edgesRef = useRef<LineSegments>(null)
  useFrame(({ clock }) => {
    const rise = visorRise()
    const e = ease(visorRt.blend)
    for (const w of wallRefs.current) if (w) w.scale.y = rise
    if (topsRef.current) topsRef.current.scale.y = rise
    const t = clock.elapsedTime
    const flick = 0.86 + 0.1 * Math.sin(t * 9.1) * Math.sin(t * 5.3) + 0.05 * Math.sin(t * 23.0)
    wallMats.forEach((m, k) => {
      if (!m.textured) {
        m.top.color.copy(C.wall).lerp(C.wallVisor, e)
        return
      }
      m.top.color.copy(LIT.top).lerp(LIT.topVisor, e)
      // the burning breach is its own light: bright on the map as in the visor, and it flickers
      if (k === fireSlot) m.side.color.copy(LIT.fire).multiplyScalar(flick)
      else m.side.color.copy(LIT.side).lerp(LIT.sideVisor, e)
    })
    // a bulkhead texture is drawn for the tall wall of the visor; the low wall of the map shows its foot, unstretched
    const part = Math.min(1, (WALL_H * rise) / VISOR_WALL_H)
    for (const t of wallTex) t.repeat.y = part

    const cg = ceilRef.current
    if (cg) {
      cg.visible = e > 0.5
      cg.position.y = WALL_H * rise - 0.01
    }
    if (ceilLines.current) ceilLines.current.opacity = 0.35 * e
    const ed = edgesRef.current
    if (ed) {
      ed.visible = e > 0.01
      ed.scale.y = WALL_H * rise
      ;(ed.material as LineBasicMaterial).opacity = (wallTex.length ? 0.16 : 0.55) * e
    }
  })

  return (
    <group>
      {floorSets.map((set, k) =>
        set.length === 0 ? null : (
          <instancedMesh key={`f${k}-${set.length}-${floorTex.length}`} ref={(m) => void (floorRefs.current[k] = m)} args={[plate, undefined, set.length]} frustumCulled={false}>
            <meshBasicMaterial map={floorTex[k] ?? whiteTexture()} />
          </instancedMesh>
        ),
      )}
      <lineSegments geometry={lines} frustumCulled={false}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      {wallSets.map((set, k) =>
        set.length === 0 ? null : (
          // box faces are +x, -x, +y, -y, +z, -z: the four sides share one material (the bulkhead texture), the top and
          // bottom share another
          <instancedMesh key={`w${k}-${set.length}-${wallTex.length}`} ref={(m) => void (wallRefs.current[k] = m)} args={[box, undefined, set.length]} frustumCulled={false} material={wallMats[k]?.all} />
        ),
      )}
      <group ref={topsRef}>
        <lineSegments geometry={wallTops} frustumCulled={false}>
          <lineBasicMaterial color={C.trace} />
        </lineSegments>
      </group>
      <lineSegments ref={edgesRef} geometry={visorEdges} frustumCulled={false} visible={false}>
        <lineBasicMaterial color={C.lineSeen} transparent opacity={0} depthWrite={false} />
      </lineSegments>
      <group ref={ceilRef} visible={false}>
        <mesh geometry={ceil} frustumCulled={false}>
          <meshBasicMaterial key={ceilMap ? 'tex' : 'flat'} map={ceilMap} color={ceilMap ? LIT.ceiling : C.ceiling} />
        </mesh>
        <lineSegments geometry={lines} position-y={-0.03} scale-y={-1} frustumCulled={false}>
          <lineBasicMaterial ref={ceilLines} color={C.trace} transparent opacity={0} depthWrite={false} />
        </lineSegments>
      </group>
    </group>
  )
}

// ------------------------------------------------------------------ fixtures
const isWallAt = (mission: string, x: number, y: number): boolean => (geoOf(mission).terrain[y]?.[x] ?? 'wall') === 'wall'

function Door({ mission, dims, at, v }: { mission: string; dims: Dims; at: [number, number]; v: View }) {
  const d = v.doors[`${at[0]},${at[1]}`]
  const stubA = useRef<Mesh>(null)
  const stubB = useRef<Mesh>(null)
  const lock = useRef<Mesh>(null)
  const k = useRef(d && (d.open || d.torn) ? 1 : 0)
  const leaf = useRef<Group>(null)
  // the leaf closes the passage, bridging wall to wall: along z when walls lie north and south of the door, else along x
  const acrossZ = isWallAt(mission, at[0], at[1] - 1) && isWallAt(mission, at[0], at[1] + 1)
  const leafTex = useBoardTextures('door')[0] ?? null
  const col = !d ? tokens.scan : d.torn ? tokens.molt : d.sealed ? tokens.alarm : tokens.scan
  const leafCol = useMemo(() => (leafTex ? new Color(1, 1, 1).lerp(new Color(col), d?.sealed || d?.torn ? 0.6 : 0.3).multiplyScalar(1.5) : new Color(col)), [col, leafTex, d?.sealed, d?.torn])
  const open = d ? d.open || d.torn : false
  useFrame((_, dt) => {
    const goal = open ? 1 : 0
    const snap = getStore().settings.speed === 'instant'
    k.current = snap ? goal : k.current + (goal - k.current) * (1 - Math.exp(-dt * 12))
    const len = 0.5 - 0.33 * k.current
    const off = 0.25 + 0.17 * k.current
    const torn = d?.torn ? 1 : 0
    for (const [m, s] of [[stubA.current, -1], [stubB.current, 1]] as const) {
      if (!m) continue
      m.scale.x = len / 0.5 - torn * 0.25
      m.position.x = s * (off + torn * 0.04)
      m.rotation.y = torn * s * 0.35
    }
    if (lock.current) lock.current.visible = Boolean(d?.sealed)
    if (leaf.current) leaf.current.scale.y = visorRise()
  })
  return (
    <group ref={leaf} position={[toWorldX(dims, at[0]), 0, toWorldZ(dims, at[1])]} rotation-y={acrossZ ? Math.PI / 2 : 0}>
      <mesh ref={stubA} position={[-0.25, 0.28, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.1]} />
        <meshBasicMaterial key={leafTex ? 'tex' : 'flat'} map={leafTex} color={leafCol} />
      </mesh>
      <mesh ref={stubB} position={[0.25, 0.28, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.1]} />
        <meshBasicMaterial key={leafTex ? 'tex' : 'flat'} map={leafTex} color={leafCol} />
      </mesh>
      <mesh ref={lock} position={[0, 0.62, 0]}>
        <boxGeometry args={[0.18, 0.16, 0.14]} />
        <meshBasicMaterial color={tokens.alarm} />
      </mesh>
    </group>
  )
}

function Cursor({ y = 0.45 }: { y?: number }) {
  const ref = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.visible = Math.floor(clock.elapsedTime * 2) % 2 === 0
  })
  return (
    <mesh ref={ref} position={[0, y, 0.37]}>
      <boxGeometry args={[0.28, 0.05, 0.02]} />
      <meshBasicMaterial color={tokens.scan} fog={false} />
    </mesh>
  )
}

function Terminal({ dims, at, used }: { dims: Dims; at: [number, number]; used: boolean }) {
  return (
    <group position={[toWorldX(dims, at[0]), 0, toWorldZ(dims, at[1])]}>
      <ModelFigure
        slug="terminal"
        fallback={
          <>
            <mesh position={[0, 0.35, 0]}>
              <boxGeometry args={[0.62, 0.7, 0.62]} />
              <meshLambertMaterial color={tokens.trace} />
            </mesh>
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[0.5, 0.18, 0.5]} />
              <meshBasicMaterial color={used ? tokens.scanDim : tokens.scan} />
            </mesh>
          </>
        }
      />
      {!used && <Cursor />}
    </group>
  )
}

function Console({ dims, at, hasCore }: { dims: Dims; at: [number, number]; hasCore: boolean }) {
  const glyph = useRef<Group>(null)
  useFrame((_, dt) => {
    if (glyph.current) glyph.current.rotation.y += dt * 1.4
  })
  return (
    <group position={[toWorldX(dims, at[0]), 0, toWorldZ(dims, at[1])]}>
      <ModelFigure
        slug="console"
        fallback={
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.8, 1, 0.8]} />
            <meshLambertMaterial color={tokens.trace} />
          </mesh>
        }
      />
      {hasCore && (
        <group ref={glyph} position={[0, 1, 0]}>
          <ModelFigure
            slug="core"
            fallback={
              <mesh position={[0, 0.3, 0]}>
                <octahedronGeometry args={[0.24]} />
                <meshBasicMaterial color={tokens.lit} fog={false} />
              </mesh>
            }
          />
        </group>
      )}
    </group>
  )
}

const grille = (() => {
  const parts: BoxGeometry[] = []
  for (let i = -2; i <= 2; i++) parts.push(new BoxGeometry(0.7, 0.03, 0.05).translate(0, 0.03, i * 0.15))
  return parts
})()

const grate = new PlaneGeometry(0.86, 0.86).rotateX(-Math.PI / 2).translate(0, 0.022, 0)

function Duct({ dims, at, purged }: { dims: Dims; at: [number, number]; purged: boolean }) {
  const tex = useBoardTextures('duct')[0] ?? null
  // a dark grate with a red cast (a duct is where contacts arrive); a purged one goes cold
  const col = useMemo(() => (purged ? new Color(0.3, 0.36, 0.38) : new Color(1, 1, 1).lerp(new Color(tokens.molt), 0.55).multiplyScalar(1.15)), [purged])
  if (tex)
    return (
      <mesh geometry={grate} position={[toWorldX(dims, at[0]), 0, toWorldZ(dims, at[1])]}>
        <meshBasicMaterial map={tex} color={col} transparent opacity={0.92} />
      </mesh>
    )
  return (
    <group position={[toWorldX(dims, at[0]), 0, toWorldZ(dims, at[1])]}>
      {grille.map((geo, i) => (
        <mesh key={i} geometry={geo}>
          <meshBasicMaterial color={purged ? tokens.trace : tokens.molt} transparent opacity={purged ? 0.6 : 0.4} />
        </mesh>
      ))}
    </group>
  )
}

export function Fixtures({ mission, dims, v }: { mission: string; dims: Dims; v: View }) {
  const g = geoOf(mission)
  return (
    <group>
      {g.doorSquares.map((p) => (
        <Door key={`${p[0]},${p[1]}`} mission={mission} dims={dims} at={p as [number, number]} v={v} />
      ))}
      {g.mission.terminals.map((t) => (
        <Terminal key={t.id} dims={dims} at={t.at as [number, number]} used={v.usedTerminals.includes(t.id)} />
      ))}
      {g.consolePos && <Console dims={dims} at={g.consolePos as [number, number]} hasCore={v.core.where === 'console'} />}
      {g.ducts.map((p) => (
        <Duct key={`${p[0]},${p[1]}`} dims={dims} at={p as [number, number]} purged={v.purgedDucts.some((d) => d[0] === p[0] && d[1] === p[1])} />
      ))}
    </group>
  )
}

