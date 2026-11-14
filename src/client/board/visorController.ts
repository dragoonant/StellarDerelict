// Visor mode input on the canvas: any drag (mouse button, finger or pen) looks around; a press that moves less than 8 px stays a
// tap, so the pick plane still moves, fires and selects (KB rule 25). The wheel does nothing in the visor (the map is not shown).
import { isDrag, type Pt } from './cameraModel'
import { gesture } from './gesture'
import { visorRt } from './visor'
import { dragLook } from './visorModel'

export class VisorLook {
  active = false
  private down: Pt | null = null
  private last: Pt | null = null
  private id: number | null = null
  private cleanup: (() => void) | null = null

  constructor(readonly dom: HTMLElement) {}

  private onDown = (e: PointerEvent): void => {
    if (!this.active) return
    if (this.id !== null) {
      // a second finger is never a tap; the first keeps looking
      gesture.dragged = true
      return
    }
    gesture.dragged = false
    this.id = e.pointerId
    this.down = { x: e.clientX, y: e.clientY }
    this.last = this.down
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.active || e.pointerId !== this.id || !this.down || !this.last) return
    const cur = { x: e.clientX, y: e.clientY }
    if (!gesture.dragged) {
      if (!isDrag(this.down, cur)) return
      gesture.dragged = true
    }
    visorRt.look = dragLook(visorRt.look, cur.x - this.last.x, cur.y - this.last.y)
    this.last = cur
  }

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.id) return
    this.id = null
    this.down = null
    this.last = null
  }

  private onWheel = (e: WheelEvent): void => {
    if (this.active) e.preventDefault()
  }

  attach(): void {
    const d = this.dom
    d.addEventListener('pointerdown', this.onDown)
    d.addEventListener('pointermove', this.onMove)
    d.addEventListener('pointerup', this.onUp)
    d.addEventListener('pointercancel', this.onUp)
    d.addEventListener('wheel', this.onWheel, { passive: false })
    this.cleanup = () => {
      d.removeEventListener('pointerdown', this.onDown)
      d.removeEventListener('pointermove', this.onMove)
      d.removeEventListener('pointerup', this.onUp)
      d.removeEventListener('pointercancel', this.onUp)
      d.removeEventListener('wheel', this.onWheel)
    }
  }

  detach(): void {
    this.cleanup?.()
    this.cleanup = null
    this.id = null
  }
}
