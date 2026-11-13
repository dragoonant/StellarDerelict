// The board camera: the MapController (touch and mouse, KB rule 27) fitted to the free part of the window.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { clamp, distFor, ZOOM_MAX, zoomFor } from './cameraModel'
import { MapController } from './mapController'
import { viewApi } from './viewApi'
import type { Dims } from './layout'

interface Insets {
  left: number
  right: number
  top: number
  bottom: number
}

/** Pixels of the window the HUD leaves for the board. */
function insetsFor(width: number, height: number): Insets {
  if (width >= 900) return { left: 24, right: 330, top: 64, bottom: 190 }
  return { left: 6, right: 6, top: 96, bottom: Math.min(210, Math.round(height * 0.3)) }
}

const POLAR = 0.97

function projectedBounds(cam: PerspectiveCamera, dist: number, corners: [number, number, number][]) {
  const dir = new Vector3(0, Math.sin(POLAR), Math.cos(POLAR))
  cam.position.copy(dir).multiplyScalar(dist)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  let minx = Infinity
  let maxx = -Infinity
  let miny = Infinity
  let maxy = -Infinity
  const v = new Vector3()
  for (const c of corners) {
    v.set(c[0], c[1], c[2]).project(cam)
    minx = Math.min(minx, v.x)
    maxx = Math.max(maxx, v.x)
    miny = Math.min(miny, v.y)
    maxy = Math.max(maxy, v.y)
  }
  return { minx, maxx, miny, maxy }
}

function fitBoard(fov: number, w: number, h: number, ins: Insets, d: Dims) {
  const hx = d.w / 2
  const hz = d.h / 2
  const corners: [number, number, number][] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 0.6]) corners.push([sx * hx, y, sz * hz])
  const cam = new PerspectiveCamera(fov, w / h, 0.5, 400)
  const freeW = Math.max(120, w - ins.left - ins.right)
  const freeH = Math.max(120, h - ins.top - ins.bottom)
  let lo = 4
  let hi = 200
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    const b = projectedBounds(cam, mid, corners)
    if (((b.maxx - b.minx) / 2) * w <= freeW && ((b.maxy - b.miny) / 2) * h <= freeH) hi = mid
    else lo = mid
  }
  const b = projectedBounds(cam, hi, corners)
  const cx = w / 2 + ((b.minx + b.maxx) / 2) * (w / 2)
  const cy = h / 2 - ((b.miny + b.maxy) / 2) * (h / 2)
  return { dist: hi, shiftX: ins.left + freeW / 2 - cx, shiftY: ins.top + freeH / 2 - cy, freeW, freeH, ins }
}

export function CameraRig({ dims, home }: { dims: Dims; home: { x: number; z: number } }) {
  const { camera, size, gl } = useThree()
  const ctl = useMemo(() => new MapController(camera as PerspectiveCamera, gl.domElement), [camera, gl])

  useEffect(() => {
    ctl.attach()
    return () => ctl.detach()
  }, [ctl])

  useEffect(() => {
    const cam = camera as PerspectiveCamera
    const fit = fitBoard(cam.fov, size.width, size.height, insetsFor(size.width, size.height), dims)
    ctl.homeAz = 0
    ctl.interactive = true
    ctl.lim = { x: dims.w / 2, z: dims.h / 2 }
    ctl.setFit({
      overview: fit.dist,
      shiftX: fit.shiftX,
      shiftY: fit.shiftY,
      centreX: fit.ins.left + fit.freeW / 2 - size.width / 2,
      centreY: fit.ins.top + fit.freeH / 2 - size.height / 2,
    })
  }, [ctl, camera, size.width, size.height, dims])

  // the opening view: above the airlock, about 13 squares across on a desktop (7 on a phone) so the figures read
  const opening = (): number => {
    const cam = camera as PerspectiveCamera
    const tiles = size.width < 700 ? 10 : 18
    const aspect = size.width / size.height
    const dist = tiles / (2 * Math.tan((cam.fov * Math.PI) / 360) * aspect)
    return clamp(zoomFor(dist, ctl.fit.overview), 0, ZOOM_MAX)
  }
  const openZoom = useRef(0.4)
  openZoom.current = opening()
  useEffect(() => {
    ctl.reset(false)
    ctl.setView({ x: home.x, z: home.z, zoom: openZoom.current })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl, home.x, home.z])

  useEffect(() => {
    viewApi.reset = () => ctl.flyOpening(home.x, home.z, openZoom.current)
    viewApi.setView = (p) => ctl.setView(p)
    viewApi.flyTo = (x, z, zoom) => ctl.flyTo(x, z, zoom ?? Math.max(ctl.view.zoom, 0.45))
    viewApi.camera = () => {
      const v = ctl.view
      const c = camera.position
      return { x: c.x, y: c.y, z: c.z, tx: v.x, tz: v.z, az: v.az, zoom: v.zoom, tilt: v.tilt, dist: distFor(v.zoom, ctl.fit.overview) }
    }
    viewApi.project = (x, y, z) => {
      camera.updateMatrixWorld(true)
      const v = new Vector3(x, y, z).project(camera)
      const r = gl.domElement.getBoundingClientRect()
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
    }
  }, [camera, ctl, gl, home.x, home.z])

  useFrame((_, dt) => ctl.update(Math.min(dt, 0.1)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLElement && /input|textarea/i.test(e.target.tagName)) return
      if (e.key === 'r' || e.key === 'R' || e.key === 'Home') viewApi.reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return null
}
