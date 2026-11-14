// Visor mode's frame-to-frame state, shared by the camera rig, the figures, the deck and the visor HUD without React renders.
// Whether the visor is on is in the store (`visor`); this holds what changes every frame.
import type { Look } from './visorModel'

export interface FigurePose {
  x: number
  z: number
  r: number
}

export const visorRt = {
  /** 0 = the map camera, 1 = the visor; eased between by the camera rig. */
  blend: 0,
  /** the Warden whose visor the camera rides (kept through the swing back to the map) */
  unit: null as string | null,
  /** the player's look offset from the Warden's facing */
  look: { yaw: 0, pitch: 0 } as Look,
  /** the camera's current yaw (heading strip) */
  yaw: 0,
  /** the target the reticle is on while Fire or Melee is armed (set by the visor HUD) */
  lock: null as string | null,
  /** where each legal target's bracket is on screen this frame (client pixels), for a tap in the visor */
  marks: [] as { id: string; x: number; y: number }[],
}

/** Where each figure is drawn this frame (smoothed), written by the figures and read by the visor camera. */
export const figurePose = new Map<string, FigurePose>()
