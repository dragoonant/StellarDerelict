// The one persistent <Canvas> for the whole session, and the scene inside it. Picking is by tile only (KB rule 25):
// the pick plane below is the only object in the scene with pointer handlers.
import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { query } from '../../engine'
import type { Pos, View } from '../../engine'
import { MISSION_ID, canAct, legalOf, setHover, tapTile, wardenOf } from '../session'
import { useStore } from '../store'
import { tokens } from '../tokens'
import { CameraRig } from './CameraRig'
import { Deck, Fixtures } from './Deck'
import { Units } from './Figures'
import { Effects, TileLayer } from './Layers'
import { dimsOf, inBoard, toWorldX, toWorldZ, worldTile, type Dims } from './layout'
import { isTap } from './gesture'
import { geoOf } from '../../engine/grid'

const key = (p: Pos): string => `${p[0]},${p[1]}`

function PickPlane({ dims }: { dims: Dims }) {
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; long: boolean }>({ timer: null, long: false })
  const tile = (x: number, z: number): Pos | null => {
    const t = worldTile(dims, x, z)
    return inBoard(dims, t) ? t : null
  }
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      onPointerDown={(e) => {
        const ne = e.nativeEvent
        press.current.long = false
        if (press.current.timer) clearTimeout(press.current.timer)
        if (ne.pointerType === 'mouse') return
        const t = tile(e.point.x, e.point.z)
        if (!t) return
        // a long press shows the odds for the square without acting on it
        press.current.timer = setTimeout(() => {
          if (isTap()) {
            press.current.long = true
            setHover(t)
          }
        }, 450)
      }}
      onPointerUp={() => {
        if (press.current.timer) clearTimeout(press.current.timer)
      }}
      onPointerMove={(e) => {
        if (e.nativeEvent.pointerType !== 'mouse') return
        setHover(tile(e.point.x, e.point.z))
      }}
      onPointerOut={(e) => {
        if (e.nativeEvent.pointerType === 'mouse') setHover(null)
      }}
      onClick={(e) => {
        const ne = e.nativeEvent
        if (ne.button !== 0) return
        if (press.current.long) {
          press.current.long = false
          return
        }
        if (!isTap()) return
        const t = tile(e.point.x, e.point.z)
        if (t) tapTile(t)
      }}
    >
      <planeGeometry args={[dims.w, dims.h]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

function Marks({ dims, v }: { dims: Dims; v: View }) {
  const selected = useStore((s) => s.selected)
  const armed = useStore((s) => s.armed)
  const hover = useStore((s) => s.hover)
  const inspect = useStore((s) => s.inspect)
  const animating = useStore((s) => s.animating)
  const toAct = useStore((s) => s.state?.toAct)
  const g = geoOf(v.mission)

  const lit = useMemo(() => {
    const out: Pos[] = []
    for (const sec of v.lit) for (const k of g.sectionSquares[sec] ?? []) {
      const p = k.split(',').map(Number) as Pos
      if (g.terrain[p[1]]?.[p[0]] !== 'wall') out.push(p)
    }
    return out
  }, [v.lit, g])

  const m = useMemo(() => {
    const out = { moves: [] as Pos[], targets: [] as Pos[], scorch: [] as Pos[], burst: [] as Pos[] }
    const w = wardenOf(v, selected)
    if (!w || animating || toAct !== 'warden' || !canAct()) return out
    const legal = legalOf(v, w.id)
    if (!armed) {
      for (const a of legal) if (a.type === 'move') out.moves.push(a.to)
      return out
    }
    if (armed.kind === 'scorch') {
      for (const a of legal) if (a.type === 'scorch') out.scorch.push(a.at)
      if (hover && out.scorch.some((p) => key(p) === key(hover))) out.burst = query.burst(v, w.id, hover)
    } else {
      for (const a of legal)
        if (a.type === armed.kind && 'target' in a) {
          const t = v.units.find((u) => u.id === a.target)
          if (t) out.targets.push(t.at)
        }
    }
    return out
  }, [v, selected, armed, hover, animating, toAct])

  const marks = useMemo(() => {
    const out: Pos[] = []
    if (hover) out.push(hover)
    return out
  }, [hover])

  return (
    <group>
      <TileLayer dims={dims} squares={lit} color={tokens.lit} opacity={0.09} y={0.025} />
      <TileLayer dims={dims} squares={v.burn} color={tokens.alarm} opacity={0.38} y={0.04} flicker={0.14} />
      <TileLayer dims={dims} squares={m.moves} color={tokens.scan} opacity={0.4} y={0.05} />
      <TileLayer dims={dims} squares={m.targets} color={tokens.molt} opacity={0.55} y={0.05} />
      <TileLayer dims={dims} squares={m.scorch} color={tokens.alarm} opacity={0.18} y={0.05} />
      <TileLayer dims={dims} squares={m.burst} color={tokens.alarm} opacity={0.5} y={0.06} />
      <TileLayer dims={dims} squares={marks} color={tokens.read} opacity={0.14} y={0.07} />
      {inspect && <TileLayer dims={dims} squares={[inspect]} color={tokens.read} opacity={0.22} y={0.07} />}
    </group>
  )
}

function Scene() {
  const v = useStore((s) => s.presented)
  const mission = v?.mission ?? MISSION_ID
  const dims = useMemo(() => dimsOf(mission), [mission])
  const seen = useMemo(() => (v ? new Set(query.seenSquares(v).map(key)) : new Set<string>()), [v])
  const home = useMemo(() => {
    const g = geoOf(mission)
    const air = [...g.airlocks].map((k) => k.split(',').map(Number) as Pos)
    const c = air.reduce((a, p) => [a[0] + p[0] / air.length, a[1] + p[1] / air.length], [0, 0])
    return { x: toWorldX(dims, c[0]), z: toWorldZ(dims, c[1]) }
  }, [mission, dims])
  if (!v) return null
  return (
    <>
      <color attach="background" args={[tokens.void]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[4, 8, 5]} intensity={1.8} />
      <CameraRig dims={dims} home={home} />
      <Deck mission={mission} dims={dims} seen={seen} />
      <Fixtures mission={mission} dims={dims} v={v} />
      <Marks dims={dims} v={v} />
      <Units dims={dims} v={v} />
      <Effects dims={dims} />
      <PickPlane dims={dims} />
    </>
  )
}

export function BoardCanvas() {
  const screen = useStore((s) => s.screen)
  const has = useStore((s) => s.presented !== null)
  const active = screen === 'mission'
  useEffect(() => {
    document.body.dataset.screen = screen
  }, [screen])
  return (
    <div className="board" style={{ visibility: active ? 'visible' : 'hidden' }} data-testid="board">
      <Canvas flat dpr={[1, 1.5]} gl={{ antialias: false, powerPreference: 'high-performance' }} camera={{ fov: 45, near: 0.1, far: 400, position: [0, 20, 20] }} frameloop={active && has ? 'always' : 'never'}>
        <Scene />
      </Canvas>
    </div>
  )
}
