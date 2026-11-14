// Visor mode maths (spec 50 "Visor"): the camera rides the selected Warden's helmet. No three, no React, no DOM.
// World axes as in layout.ts: x east, z south, y up. A yaw of 0 looks north (-z); + turns left (counter-clockwise from above),
// matching three's rotation.y and the figures' facing angles.
import type { Facing } from '../../engine'

/** Height of the visor above the deck (a Warden stands about 1.12 high; the visor slit sits just under the helmet top). */
export const VISOR_EYE = 0.92
/** How far ahead of the figure's centre the eye sits (negative: a little behind the visor, so a Warden facing a bulkhead still sees
 * the squares beside it; the Warden's own figure is not drawn in the visor). */
export const VISOR_FORWARD = -0.2
/** Wall height in the visor: the board's 0.6 high walls would let a Warden see over every bulkhead. */
export const VISOR_WALL_H = 1.6
/** Field of view of the visor (degrees); the map camera uses 45. */
export const VISOR_FOV = 72
export const MAP_FOV = 45
/** How far the player may look away from the Warden's facing by dragging, radians (look only: the facing is a rule and costs AP). */
export const LOOK_YAW_MAX = 1.25
export const LOOK_PITCH_MIN = -0.7
export const LOOK_PITCH_MAX = 0.4
/** Radians of look per pixel dragged. */
export const LOOK_PER_PX = 0.005
/** Fog in the visor: the derelict fades to black past this range (world units). */
export const VISOR_FOG = { near: 3.5, far: 15 }
/** A screen-space tap within this many pixels of a target's marker picks that target. */
export const PICK_RADIUS_PX = 90

export const FACING_YAW: Record<Facing, number> = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 }

export interface Look {
  yaw: number
  pitch: number
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Wrap an angle to (-PI, PI]. */
export function wrap(a: number): number {
  let r = a
  while (r > Math.PI) r -= Math.PI * 2
  while (r <= -Math.PI) r += Math.PI * 2
  return r
}

/** A drag of (dx, dy) pixels added to the look offset; dragging right looks right, dragging up looks up. */
export function dragLook(l: Look, dx: number, dy: number): Look {
  return { yaw: clamp(l.yaw - dx * LOOK_PER_PX, -LOOK_YAW_MAX, LOOK_YAW_MAX), pitch: clamp(l.pitch - dy * LOOK_PER_PX, LOOK_PITCH_MIN, LOOK_PITCH_MAX) }
}

/** Unit direction for a yaw and a pitch. */
export function lookDir(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const c = Math.cos(pitch)
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c }
}

/** The eye and the point it looks at, for a figure standing at (x, z) turned to `r` (radians, as FACING_YAW) and a look offset. */
export function visorPose(fig: { x: number; z: number; r: number }, look: Look): { eye: { x: number; y: number; z: number }; at: { x: number; y: number; z: number }; yaw: number } {
  const body = lookDir(fig.r, 0)
  const eye = { x: fig.x + body.x * VISOR_FORWARD, y: VISOR_EYE, z: fig.z + body.z * VISOR_FORWARD }
  const yaw = fig.r + look.yaw
  const d = lookDir(yaw, look.pitch)
  return { eye, at: { x: eye.x + d.x, y: eye.y + d.y, z: eye.z + d.z }, yaw }
}

/** Compass letter for a yaw (the heading strip in the visor HUD). */
export function headingOf(yaw: number): string {
  const names = ['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE']
  const i = Math.round(wrap(yaw) / (Math.PI / 4))
  return names[((i % 8) + 8) % 8]!
}

/** Compass bearing in degrees, clockwise from north (N 0, E 90), for the heading strip. */
export function bearingOf(yaw: number): number {
  return (((-yaw * 180) / Math.PI) % 360 + 360) % 360
}

/** The screen point nearest to `c` among `pts` (undefined entries are off-screen), within `radius` pixels if given. */
export function nearestOnScreen<T extends { x: number; y: number }>(pts: T[], c: { x: number; y: number }, radius = Infinity): T | null {
  let best: T | null = null
  let bd = radius
  for (const p of pts) {
    const d = Math.hypot(p.x - c.x, p.y - c.y)
    if (d <= bd) {
      bd = d
      best = p
    }
  }
  return best
}

/** Ease the visor blend (0 = map, 1 = visor) toward its goal; `rate` per second, linear so the swing takes a fixed time. */
export function stepBlend(blend: number, goal: number, dt: number, rate = 2.6): number {
  if (blend < goal) return Math.min(goal, blend + dt * rate)
  if (blend > goal) return Math.max(goal, blend - dt * rate)
  return blend
}

/** Smoothstep for the swing between the two cameras. */
export const ease = (t: number): number => t * t * (3 - 2 * t)
