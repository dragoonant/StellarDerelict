// `?gallery`: every manifest model, enabled or not, on a turntable. For the per-item style gate: slug, enabled state,
// triangle count, height, a +Z facing arrow on the deck and a head-height ruler (a line 35% from the top). A file that is
// not on disk shows "not generated". Nothing here is part of the game.
import { Canvas, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BufferGeometry, Float32BufferAttribute, type Group } from 'three'
import { assets } from '../../data'
import { modelStore, type ModelRecord } from '../models/store'
import { tokens } from '../tokens'

const COLS = 4
const GAP = 3

function line(points: number[]): BufferGeometry {
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3))
}

function Cell({ slug, x, z, spin }: { slug: string; x: number; z: number; spin: boolean }) {
  const entry = assets.models.find((m) => m.slug === slug)
  const [rec, setRec] = useState<ModelRecord | null>(null)
  const turn = useRef<Group>(null)
  useEffect(() => {
    let live = true
    void modelStore.load(slug, true).then((r) => live && setRec(r))
    return () => {
      live = false
    }
  }, [slug])
  const node = useMemo(() => (rec?.status === 'ready' && rec.proto ? rec.proto.clone(true) : null), [rec])
  useFrame((_, dt) => {
    if (!turn.current) return
    if (spin) turn.current.rotation.y += dt * 0.6
    else turn.current.rotation.y = 0
  })
  const h = rec?.status === 'ready' ? rec.height : (entry?.heightIn ?? 1) * 0.7
  const ruler = useMemo(() => line([-0.75, 0, 0.9, -0.75, h, 0.9]), [h])
  const head = useMemo(() => line([-0.85, h * 0.65, 0.9, -0.65, h * 0.65, 0.9]), [h])
  const top = useMemo(() => line([-0.85, h, 0.9, -0.65, h, 0.9]), [h])
  const arrow = useMemo(() => line([0, 0.01, 0.55, 0, 0.01, 1.3, 0, 0.01, 1.3, 0.12, 0.01, 1.1, 0, 0.01, 1.3, -0.12, 0.01, 1.1]), [])
  const missing = rec?.status === 'failed'
  return (
    <group position={[x, 0, z]}>
      <group ref={turn}>{node && <primitive object={node} />}</group>
      <lineSegments geometry={arrow}>
        <lineBasicMaterial color={tokens.scan} />
      </lineSegments>
      <lineSegments geometry={ruler}>
        <lineBasicMaterial color={tokens.scanDim} />
      </lineSegments>
      <lineSegments geometry={head}>
        <lineBasicMaterial color={tokens.alarm} />
      </lineSegments>
      <lineSegments geometry={top}>
        <lineBasicMaterial color={tokens.scanDim} />
      </lineSegments>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.005, 0]}>
        <circleGeometry args={[0.8, 32]} />
        <meshBasicMaterial color={tokens.deck} />
      </mesh>
      <Html position={[0, -0.05, 1.7]} center zIndexRange={[1, 0]}>
        <div className="gallery__label">
          <b>{slug}</b> {entry?.enabled ? 'enabled' : 'disabled'}
          <br />
          {missing ? <span className="miss">not generated</span> : rec ? `${Math.round(rec.tris)} tris, ${rec.height.toFixed(2)} high (${entry?.heightIn} in)` : 'loading'}
        </div>
      </Html>
    </group>
  )
}

export default function Gallery() {
  const [spin, setSpin] = useState(true)
  const slugs = assets.models.map((m) => m.slug)
  const rows = Math.ceil(slugs.length / COLS)
  return (
    <main className="gallery" data-screen="gallery">
      <div className="gallery__bar">
        <h1>Figure gallery</h1>
        <button type="button" className={spin ? 'on' : ''} aria-pressed={spin} onClick={() => setSpin(!spin)}>
          {spin ? 'Turntable on' : 'Front view'}
        </button>
        <span className="line line--dim">Arrow is +Z. Amber line is 35% from the top (the helmet line).</span>
      </div>
      <Canvas flat dpr={[1, 1.5]} camera={{ fov: 40, near: 0.1, far: 100, position: [0, 6 + rows * 1.5, 7 + rows * 4] }} onCreated={({ camera }) => camera.lookAt(0, 0.4, ((rows - 1) * GAP) / 2)}>
        <color attach="background" args={[tokens.void]} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[4, 8, 5]} intensity={1.8} />
        {slugs.map((s, i) => (
          <Cell key={s} slug={s} x={((i % COLS) - (COLS - 1) / 2) * GAP} z={Math.floor(i / COLS) * GAP} spin={spin} />
        ))}
      </Canvas>
    </main>
  )
}
