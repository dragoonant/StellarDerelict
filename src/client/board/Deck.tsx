// The static deck: floor plates (instanced, three brightness states), wall extrusions (instanced), edge lines and the
// fixtures (doors, terminals, console, ducts). Nothing here has a pointer handler (KB rule 25).
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix4, Mesh, PlaneGeometry } from 'three'
import { geoOf } from '../../engine/grid'
import type { View } from '../../engine'
import { getStore } from '../store'
import { tokens } from '../tokens'
import { WALL_H, toWorldX, toWorldZ, type Dims } from './layout'

const C = {
  seen: new Color(tokens.deck).lerp(new Color(tokens.scan), 0.2),
  mapped: new Color(tokens.deck).lerp(new Color(tokens.scanDim), 0.06),
  wall: new Color(tokens.void).lerp(new Color(tokens.trace), 0.55),
  lineSeen: new Color(tokens.scan),
  lineMapped: new Color(tokens.scanDim).lerp(new Color(tokens.trace), 0.45),
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

  const floorRef = useRef<InstancedMesh>(null)
  const wallRef = useRef<InstancedMesh>(null)

  const plate = useMemo(() => new PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), [])
  const box = useMemo(() => new BoxGeometry(1, WALL_H, 1).translate(0, WALL_H / 2, 0), [])

  useLayoutEffect(() => {
    const m = new Matrix4()
    const f = floorRef.current
    if (f) {
      floors.forEach(([x, y], i) => f.setMatrixAt(i, m.makeTranslation(toWorldX(dims, x), 0.01, toWorldZ(dims, y))))
      f.instanceMatrix.needsUpdate = true
    }
    const w = wallRef.current
    if (w) {
      walls.forEach(([x, y], i) => w.setMatrixAt(i, m.makeTranslation(toWorldX(dims, x), 0, toWorldZ(dims, y))))
      w.instanceMatrix.needsUpdate = true
    }
  }, [floors, walls, dims])

  useLayoutEffect(() => {
    const f = floorRef.current
    if (!f) return
    floors.forEach(([x, y], i) => f.setColorAt(i, seen.has(`${x},${y}`) ? C.seen : C.mapped))
    if (f.instanceColor) f.instanceColor.needsUpdate = true
  }, [floors, seen])

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
      const c = seen.has(`${x},${y}`) ? C.lineSeen : C.lineMapped
      for (let k = 0; k < 8; k++) col.setXYZ(i * 8 + k, c.r, c.g, c.b)
    })
    col.needsUpdate = true
  }, [lines, floors, seen])

  const wallTops = useMemo(() => {
    const geo = new BufferGeometry()
    const arr = new Float32Array(walls.length * 8 * 3)
    walls.forEach(([x, y], i) => {
      const cx = toWorldX(dims, x)
      const cz = toWorldZ(dims, y)
      const a = 0.5
      const segs = [
        [cx - a, cz - a, cx + a, cz - a],
        [cx + a, cz - a, cx + a, cz + a],
        [cx + a, cz + a, cx - a, cz + a],
        [cx - a, cz + a, cx - a, cz - a],
      ]
      segs.forEach((s, k) => {
        const o = (i * 8 + k * 2) * 3
        arr.set([s[0] as number, WALL_H + 0.005, s[1] as number, s[2] as number, WALL_H + 0.005, s[3] as number], o)
      })
    })
    geo.setAttribute('position', new BufferAttribute(arr, 3))
    return geo
  }, [walls, dims])

  return (
    <group>
      <instancedMesh ref={floorRef} args={[plate, undefined, floors.length]} frustumCulled={false}>
        <meshBasicMaterial />
      </instancedMesh>
      <lineSegments geometry={lines} frustumCulled={false}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <instancedMesh ref={wallRef} args={[box, undefined, walls.length]} frustumCulled={false}>
        <meshLambertMaterial color={C.wall} />
      </instancedMesh>
      <lineSegments geometry={wallTops} frustumCulled={false}>
        <lineBasicMaterial color={C.trace.clone().lerp(new Color(tokens.scanDim), 0.6)} />
      </lineSegments>
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
  const acrossZ = isWallAt(mission, at[0], at[1] - 1) && isWallAt(mission, at[0], at[1] + 1) ? false : true
  // the bar spans the width of the passage: along x when walls lie north and south of the door, else along z
  const col = !d ? tokens.scan : d.torn ? tokens.molt : d.sealed ? tokens.alarm : tokens.scan
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
  })
  return (
    <group position={[toWorldX(dims, at[0]), 0, toWorldZ(dims, at[1])]} rotation-y={acrossZ ? Math.PI / 2 : 0}>
      <mesh ref={stubA} position={[-0.25, 0.28, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.1]} />
        <meshBasicMaterial color={col} />
      </mesh>
      <mesh ref={stubB} position={[0.25, 0.28, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.1]} />
        <meshBasicMaterial color={col} />
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
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.62, 0.7, 0.62]} />
        <meshLambertMaterial color={tokens.trace} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.5, 0.18, 0.5]} />
        <meshBasicMaterial color={used ? tokens.scanDim : tokens.scan} />
      </mesh>
      {!used && <Cursor />}
    </group>
  )
}

function Console({ dims, at, hasCore }: { dims: Dims; at: [number, number]; hasCore: boolean }) {
  const glyph = useRef<Mesh>(null)
  useFrame((_, dt) => {
    if (glyph.current) glyph.current.rotation.y += dt * 1.4
  })
  return (
    <group position={[toWorldX(dims, at[0]), 0, toWorldZ(dims, at[1])]}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.8, 1, 0.8]} />
        <meshLambertMaterial color={tokens.trace} />
      </mesh>
      {hasCore && (
        <mesh ref={glyph} position={[0, 1.3, 0]}>
          <octahedronGeometry args={[0.24]} />
          <meshBasicMaterial color={tokens.lit} fog={false} />
        </mesh>
      )}
    </group>
  )
}

const grille = (() => {
  const parts: BoxGeometry[] = []
  for (let i = -2; i <= 2; i++) parts.push(new BoxGeometry(0.7, 0.03, 0.05).translate(0, 0.03, i * 0.15))
  return parts
})()

function Duct({ dims, at, purged }: { dims: Dims; at: [number, number]; purged: boolean }) {
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

