// Visor mode's HUD (spec 50 "Visor"): the helmet frame, a heading strip, the reticle, the Warden's own readout and, while Fire or
// Melee is armed, a bracket on each legal target with the engine's odds. Every number shown comes from `query` or the view.
import { useEffect, useMemo, useRef, useState } from 'react'
import { roles, rules } from '../../data'
import { query } from '../../engine'
import type { View, WardenUnit } from '../../engine'
import { dimsOf, toWorldX, toWorldZ } from '../board/layout'
import { viewApi } from '../board/viewApi'
import { visorRt } from '../board/visor'
import { bearingOf, headingOf, nearestOnScreen } from '../board/visorModel'
import { legalOf, setVisor, wardenOf } from '../session'
import { useStore } from '../store'

interface Target {
  id: string
  at: [number, number]
  odds: string
}

/** Legal targets of the armed Fire or Melee, with the odds the engine gives. */
function targetsOf(v: View, unit: string | null, kind: string | undefined): Target[] {
  if (!unit || (kind !== 'fire' && kind !== 'melee')) return []
  const out: Target[] = []
  for (const a of legalOf(v, unit)) {
    if (a.type !== kind || !('target' in a)) continue
    const t = v.units.find((u) => u.id === a.target)
    if (!t) continue
    const odds = kind === 'fire' ? `${Math.round(query.hitChance(v, unit, t.id) * 100)}% KILL` : `${Math.round(query.meleeOdds(v, unit, t.id).attackerWins * 100)}% WIN`
    out.push({ id: t.id, at: t.at as [number, number], odds })
  }
  return out
}

function Readout({ w }: { w: WardenUnit }) {
  const scorcher = roles[w.role].weapon === 'scorcher'
  const locked = !scorcher && w.heat >= rules.repeater.heatLock
  return (
    <div className="visor__tag">
      <b>{w.name}</b> <span>{roles[w.role].label}</span>
      <span className="visor__ap" aria-label={`Action points ${w.ap}`}>
        <b>AP</b>
        {Array.from({ length: rules.wardenAp }, (_, i) => (
          <i key={i} className={`pip ${i < w.ap ? 'on' : ''}`} />
        ))}
      </span>
      <span className={locked ? 'alarm' : ''}>{scorcher ? `CHG ${w.charges}/${rules.scorcher.charges}` : locked ? 'HEAT LOCK' : `HEAT ${w.heat}/${rules.repeater.heatLock}`}</span>
      {w.breached && <span className="alarm">BREACHED</span>}
      {w.watch && <span>WATCH</span>}
    </div>
  )
}

export function VisorHud({ v }: { v: View }) {
  const on = useStore((s) => s.visor)
  const selected = useStore((s) => s.selected)
  const armed = useStore((s) => s.armed)
  const animating = useStore((s) => s.animating)
  const [lost, setLost] = useState<string | null>(null)
  const heading = useRef<HTMLSpanElement>(null)
  const tape = useRef<HTMLDivElement>(null)
  const marks = useRef<Map<string, HTMLDivElement>>(new Map())
  const w = wardenOf(v, selected)
  const targets = useMemo(() => (on && !animating ? targetsOf(v, selected, armed?.kind) : []), [on, v, selected, armed, animating])

  // the Warden whose eyes these are went down: hold "signal lost" a moment, then back to the map
  const rider = on ? (selected ?? visorRt.unit) : null
  const riderUnit = rider ? v.units.find((u) => u.id === rider) : undefined
  const down = Boolean(on && riderUnit && riderUnit.kind === 'warden' && !riderUnit.alive)
  const riderName = riderUnit && riderUnit.kind === 'warden' ? riderUnit.name : ''
  useEffect(() => {
    if (!down) return
    setLost(riderName)
    const t = setTimeout(() => setVisor(false), 1400)
    return () => {
      clearTimeout(t)
      setLost(null)
    }
  }, [down, riderName])

  // per frame: heading readout, and each target bracket placed over its figure; the lock is the bracket nearest the reticle
  useEffect(() => {
    if (!on) {
      visorRt.lock = null
      visorRt.marks = []
      return
    }
    const dims = dimsOf(v.mission)
    let raf = 0
    const frame = (): void => {
      const b = bearingOf(visorRt.yaw)
      if (heading.current) heading.current.textContent = `${String(Math.round(b) % 360).padStart(3, '0')} ${headingOf(visorRt.yaw)}`
      if (tape.current) tape.current.style.backgroundPositionX = `${(-b / 360) * 720}px`
      const pts: { id: string; x: number; y: number }[] = []
      for (const t of targets) {
        const el = marks.current.get(t.id)
        const p = viewApi.project(toWorldX(dims, t.at[0]), 0.45, toWorldZ(dims, t.at[1]))
        if (!el) continue
        if (!p || p.behind) {
          el.style.display = 'none'
          continue
        }
        el.style.display = ''
        el.style.transform = `translate(${p.x}px, ${p.y}px)`
        pts.push({ id: t.id, x: p.x, y: p.y })
      }
      visorRt.marks = pts
      const lock = nearestOnScreen(pts, { x: window.innerWidth / 2, y: window.innerHeight / 2 })
      visorRt.lock = lock?.id ?? null
      for (const [id, el] of marks.current) el.classList.toggle('lock', id === visorRt.lock)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [on, v.mission, targets])

  if (!on) return null
  return (
    <div className="visor" data-testid="visor" aria-label="Visor">
      <div className="visor__frame" aria-hidden="true" />
      <div className="visor__heading">
        <div className="visor__tape" ref={tape} aria-hidden="true" />
        <span ref={heading} className="visor__hdg" data-testid="visor-heading" />
      </div>
      <div className="visor__reticle" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      {targets.map((t) => (
        <div
          key={`${t.id}-${armed?.kind ?? ''}`}
          className="visor__target"
          data-target={t.id}
          ref={(el) => {
            if (el) marks.current.set(t.id, el)
            else marks.current.delete(t.id)
          }}
        >
          <span>{t.odds}</span>
        </div>
      ))}
      {w && <Readout w={w} />}
      <p className="visor__hint">
        {armed && armed.kind !== 'scorch'
          ? `${armed.kind === 'fire' ? 'F' : 'G'} again shoots the locked bracket; tap a bracket to pick another. Esc disarms.`
          : 'W / S step, Q / E turn, drag to look, C or Esc back to the map.'}
      </p>
      {lost !== null && (
        <div className="visor__lost" role="alert">
          SIGNAL LOST{lost ? `: ${lost.toUpperCase()}` : ''}
        </div>
      )}
      <div className="visor__switch" key={selected ?? ''} aria-hidden="true" />
    </div>
  )
}
