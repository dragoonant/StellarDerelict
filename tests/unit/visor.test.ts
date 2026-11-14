import { describe, expect, it } from 'vitest'
import {
  bearingOf,
  dragLook,
  FACING_YAW,
  headingOf,
  LOOK_PITCH_MAX,
  LOOK_PITCH_MIN,
  LOOK_YAW_MAX,
  lookDir,
  nearestOnScreen,
  stepBlend,
  VISOR_EYE,
  VISOR_FORWARD,
  visorPose,
} from '../../src/client/board/visorModel'

const near = (a: number, b: number): void => expect(a).toBeCloseTo(b, 6)

describe('visor camera maths (spec 50 "Visor")', () => {
  it('VISOR-3 each facing looks along its own axis (north is -z, east is +x)', () => {
    const n = lookDir(FACING_YAW.N, 0)
    near(n.x, 0)
    near(n.z, -1)
    const e = lookDir(FACING_YAW.E, 0)
    near(e.x, 1)
    near(e.z, 0)
    const s = lookDir(FACING_YAW.S, 0)
    near(s.z, 1)
    const w = lookDir(FACING_YAW.W, 0)
    near(w.x, -1)
  })

  it('VISOR-3 the eye sits at visor height, just behind the figure along its facing, and looks ahead', () => {
    const p = visorPose({ x: 2, z: 3, r: FACING_YAW.E }, { yaw: 0, pitch: 0 })
    near(p.eye.y, VISOR_EYE)
    near(p.eye.x, 2 + VISOR_FORWARD)
    near(p.eye.z, 3)
    expect(p.at.x).toBeGreaterThan(p.eye.x)
    near(p.at.y, p.eye.y)
  })

  it('VISOR-4 a drag right looks right, a drag up looks up, and the look is clamped', () => {
    const r = dragLook({ yaw: 0, pitch: 0 }, 40, 0)
    expect(r.yaw).toBeLessThan(0)
    // facing north, looking right turns the view toward east (+x)
    expect(visorPose({ x: 0, z: 0, r: FACING_YAW.N }, r).at.x).toBeGreaterThan(0)
    expect(dragLook({ yaw: 0, pitch: 0 }, 0, -40).pitch).toBeGreaterThan(0)
    const far = dragLook({ yaw: 0, pitch: 0 }, -100000, 100000)
    expect(far.yaw).toBe(LOOK_YAW_MAX)
    expect(far.pitch).toBe(LOOK_PITCH_MIN)
    expect(dragLook({ yaw: 0, pitch: 0 }, 0, -100000).pitch).toBe(LOOK_PITCH_MAX)
  })

  it('VISOR-6 the heading reads as a compass: north 000, east 090, south 180, west 270', () => {
    expect(Math.round(bearingOf(FACING_YAW.N))).toBe(0)
    expect(Math.round(bearingOf(FACING_YAW.E))).toBe(90)
    expect(Math.round(bearingOf(FACING_YAW.S))).toBe(180)
    expect(Math.round(bearingOf(FACING_YAW.W))).toBe(270)
    expect(headingOf(FACING_YAW.E)).toBe('E')
    expect(headingOf(FACING_YAW.N - Math.PI / 4)).toBe('NE')
    expect(headingOf(-Math.PI)).toBe('S')
  })

  it('VISOR-5 the lock is the bracket nearest the reticle; a tap picks within its radius only', () => {
    const pts = [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 520, y: 380 },
    ]
    expect(nearestOnScreen(pts, { x: 500, y: 400 })?.id).toBe('b')
    expect(nearestOnScreen(pts, { x: 110, y: 95 }, 90)?.id).toBe('a')
    expect(nearestOnScreen(pts, { x: 300, y: 250 }, 90)).toBeNull()
    expect(nearestOnScreen([], { x: 0, y: 0 })).toBeNull()
  })

  it('VISOR-1 the swing between map and visor eases at a fixed rate and stops at its goal', () => {
    let b = 0
    let frames = 0
    while (b < 1 && frames < 100) {
      b = stepBlend(b, 1, 1 / 60)
      frames++
    }
    expect(b).toBe(1)
    expect(frames).toBeGreaterThan(15)
    expect(frames).toBeLessThan(40)
    expect(stepBlend(0.5, 0, 10)).toBe(0)
    expect(stepBlend(1, 1, 0.1)).toBe(1)
  })
})
