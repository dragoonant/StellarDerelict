// The camera's imperative handle, shared by the HUD (centre on a Warden, reset) and the e2e test hooks. Filled in by CameraRig on mount.
import type { View } from './cameraModel'

export interface CameraReadout {
  x: number
  y: number
  z: number
  tx: number
  tz: number
  az: number
  zoom: number
  tilt: number
  dist: number
}

export const viewApi = {
  reset: (): void => {},
  setView: (_p: Partial<View>): void => {},
  /** Glide the camera target to a world point. */
  flyTo: (_x: number, _z: number, _zoom?: number): void => {},
  camera: (): CameraReadout | null => null,
  /** World point to client pixels, for tests that click a tile; `behind` when the point is behind the camera or past its far plane. */
  project: (_x: number, _y: number, _z: number): { x: number; y: number; behind?: boolean } | null => null,
}
