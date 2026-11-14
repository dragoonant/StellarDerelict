// The board camera: the MapController (touch and mouse, KB rule 27) fitted to the free part of the window.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Fog, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { clamp, distFor, ZOOM_MAX, zoomFor } from './cameraModel'
import { MapController } from './mapController'
import { viewApi } from './viewApi'
import { figurePose, visorRt } from './visor'
import { VisorLook } from './visorController'
import { ease, FACING_YAW, MAP_FOV, stepBlend, VISOR_FOG, VISOR_FOV, visorPose } from './visorModel'
import { getStore } from '../store'
import type { Dims } from './layout'

/** Fog distances on the map: far past the board, so the map never fogs (the fog object exists from the start so no material recompiles). */
const MAP_FOG = { near: 1000, far: 2000 }
const UP = new Vector3(0, 1, 0)

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
    viewApi.reset = () => {
      if (getStore().visor) visorRt.look = { yaw: 0, pitch: 0 }
      else ctl.flyOpening(home.x, home.z, openZoom.current)
    }
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
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, behind: v.z > 1 || v.z < -1 }
    }
  }, [camera, ctl, gl, home.x, home.z])

  // ------------------------------------------------------------------ visor mode (spec 50 "Visor")
  const look = useMemo(() => new VisorLook(gl.domElement), [gl])
  useEffect(() => {
    look.attach()
    return () => look.detach()
  }, [look])
  const vis = useMemo(
    () => ({ mapPos: new Vector3(), mapQ: new Quaternion(), goalPos: new Vector3(), goalQ: new Quaternion(), pos: new Vector3(), q: new Quaternion(), m: new Matrix4(), has: false, unit: '', facing: '', swoop: false, recentre: false, was: false, wasOn: false }),
    [],
  )

  useFrame((state, dt0) => {
    const dt = Math.min(dt0, 0.1)
    const s = getStore()
    const on = s.visor && s.screen === 'mission'
    if (on && s.selected) visorRt.unit = s.selected
    const unit = visorRt.unit
    const fig = unit ? figurePose.get(unit) : undefined
    // leaving the visor: put the map over the Warden, so the swing back lands where the player was looking from
    if (vis.wasOn && !on && fig) ctl.setView({ x: fig.x, z: fig.z, zoom: Math.max(ctl.view.zoom, 0.5) })
    vis.wasOn = on
    const goal = on && fig ? 1 : 0
    visorRt.blend = s.settings.speed === 'instant' ? goal : stepBlend(visorRt.blend, goal, dt)
    ctl.interactive = !on && visorRt.blend === 0
    look.active = on
    ctl.update(dt)
    const cam = camera as PerspectiveCamera
    const fog = state.scene.fog as Fog | null
    const b = visorRt.blend
    if (b <= 0 || !fig) {
      if (vis.was) {
        vis.was = false
        vis.has = false
        visorRt.look = { yaw: 0, pitch: 0 }
        visorRt.lock = null
        cam.fov = MAP_FOV
        if (fog) {
          fog.near = MAP_FOG.near
          fog.far = MAP_FOG.far
        }
        ctl.apply()
      }
      return
    }
    vis.was = true
    // the map pose (where the swing starts), then the visor pose
    cam.fov = MAP_FOV
    ctl.apply()
    vis.mapPos.copy(cam.position)
    vis.mapQ.copy(cam.quaternion)
    const mapNear = cam.near
    const u = s.presented?.units.find((x) => x.id === unit)
    const facing = u && u.kind === 'warden' ? u.facing : ''
    if (unit !== vis.unit) {
      vis.swoop = vis.has
      vis.unit = unit ?? ''
      visorRt.look = { yaw: 0, pitch: 0 }
    } else if (facing !== vis.facing) vis.recentre = true
    vis.facing = facing
    if (vis.recentre) {
      const k = Math.exp(-dt * 8)
      visorRt.look = { yaw: visorRt.look.yaw * k, pitch: visorRt.look.pitch }
      if (Math.abs(visorRt.look.yaw) < 0.01) vis.recentre = false
    }
    // a pose from the facing itself when the figure has not been drawn turning yet
    const p = visorPose({ x: fig.x, z: fig.z, r: Number.isFinite(fig.r) ? fig.r : FACING_YAW.N }, visorRt.look)
    visorRt.yaw = p.yaw
    vis.goalPos.set(p.eye.x, p.eye.y, p.eye.z)
    vis.m.lookAt(vis.goalPos, new Vector3(p.at.x, p.at.y, p.at.z), UP)
    vis.goalQ.setFromRotationMatrix(vis.m)
    if (!vis.has) {
      vis.pos.copy(vis.goalPos)
      vis.q.copy(vis.goalQ)
      vis.has = true
    } else if (vis.swoop) {
      // switching Wardens: a quick glide from one helmet to the other
      const k = 1 - Math.exp(-dt * 9)
      vis.pos.lerp(vis.goalPos, k)
      vis.q.slerp(vis.goalQ, k)
      if (vis.pos.distanceTo(vis.goalPos) < 0.02) vis.swoop = false
    } else {
      vis.pos.copy(vis.goalPos)
      vis.q.copy(vis.goalQ)
    }
    const e = ease(b)
    cam.position.lerpVectors(vis.mapPos, vis.pos, e)
    cam.quaternion.slerpQuaternions(vis.mapQ, vis.q, e)
    cam.fov = MAP_FOV + (VISOR_FOV - MAP_FOV) * e
    cam.near = mapNear + (0.05 - mapNear) * e
    if (cam.view) cam.setViewOffset(cam.view.fullWidth, cam.view.fullHeight, cam.view.offsetX * (1 - e), cam.view.offsetY * (1 - e), cam.view.width, cam.view.height)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld(true)
    if (fog) {
      fog.near = MAP_FOG.near + (VISOR_FOG.near - MAP_FOG.near) * e
      fog.far = MAP_FOG.far + (VISOR_FOG.far - MAP_FOG.far) * e
    }
  })

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
