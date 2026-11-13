import { listMissions, rules, roles } from '../src/data'
import type { Mission } from '../src/data'

const errors: string[] = []
const err = (m: string, msg: string): void => {
  errors.push(`${m}: ${msg}`)
}
const KNOWN = new Set(['wall', 'floor', 'airlock', 'duct', 'door', 'bulkhead', 'terminal', 'console'])

function checkRules(): void {
  const walk = (o: unknown, path: string): void => {
    if (typeof o === 'number') {
      if (!Number.isFinite(o) || o < 0) err('rules', `${path} must be a non-negative number`)
    } else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`)
    else err('rules', `${path} is not a number`)
  }
  walk(rules, 'rules')
  for (const [r, d] of Object.entries(roles)) {
    if (!d.label || !['repeater', 'scorcher'].includes(d.weapon)) err('units', `role ${r} is malformed`)
  }
}

function checkMission(m: Mission): void {
  const id = m.id
  const h = m.grid.length
  const w = m.grid[0]?.length ?? 0
  if (h === 0 || w === 0) return err(id, 'empty grid')
  m.grid.forEach((row, y) => {
    if (row.length !== w) err(id, `row ${y} has width ${row.length}, expected ${w}`)
  })
  for (const [ch, name] of Object.entries(m.legend)) if (!KNOWN.has(name)) err(id, `legend '${ch}' maps to unknown '${name}'`)
  const at = (x: number, y: number): string | undefined => {
    const ch = m.grid[y]?.[x]
    return ch === undefined ? undefined : m.legend[ch]
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = m.grid[y]?.[x] as string
      if (!(ch in m.legend)) err(id, `unknown legend char '${ch}' at (${x},${y})`)
    }
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h
  const walkable = (t: string | undefined): boolean => !!t && t !== 'wall' && t !== 'terminal' && t !== 'console'
  // squad on airlock squares
  const taken = new Set<string>()
  for (const q of m.squad) {
    if (at(q.at[0], q.at[1]) !== 'airlock') err(id, `${q.id} does not start on an airlock square`)
    if (taken.has(`${q.at}`)) err(id, `${q.id} shares a square`)
    taken.add(`${q.at}`)
    if (!['N', 'E', 'S', 'W'].includes(q.facing)) err(id, `${q.id} has a bad facing`)
    if (!(q.role in roles)) err(id, `${q.id} has unknown role ${q.role}`)
  }
  if (m.squad.length === 0) err(id, 'no squad')
  // all floor reachable from the airlock
  const start = m.squad[0]?.at
  if (start) {
    const seen = new Set<string>([`${start}`])
    const q: [number, number][] = [[start[0], start[1]]]
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i] as [number, number]
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as [number, number][]) {
        const nx = x + dx
        const ny = y + dy
        if (!inside(nx, ny) || seen.has(`${nx},${ny}`) || !walkable(at(nx, ny))) continue
        seen.add(`${nx},${ny}`)
        q.push([nx, ny])
      }
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (walkable(at(x, y)) && !seen.has(`${x},${y}`)) err(id, `floor at (${x},${y}) is not reachable from the airlock`)
  }
  // terminals and the console
  const hasFloorNeighbour = (x: number, y: number): boolean =>
    ([[0, -1], [1, 0], [0, 1], [-1, 0]] as [number, number][]).some(([dx, dy]) => walkable(at(x + dx, y + dy)))
  const consoles: [number, number][] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = at(x, y)
      if (t === 'console') {
        consoles.push([x, y])
        if (!hasFloorNeighbour(x, y)) err(id, `console at (${x},${y}) has no floor neighbour`)
      }
    }
  if (consoles.length !== 1) err(id, `expected exactly one console, found ${consoles.length}`)
  const ids = new Set<string>()
  for (const t of m.terminals) {
    if (ids.has(t.id)) err(id, `duplicate terminal id ${t.id}`)
    ids.add(t.id)
    if (at(t.at[0], t.at[1]) !== 'terminal') err(id, `terminal ${t.id} is not on a terminal square`)
    if (!hasFloorNeighbour(t.at[0], t.at[1])) err(id, `terminal ${t.id} has no floor neighbour`)
    for (const d of t.doors ?? []) if (at(d[0], d[1]) !== 'bulkhead') err(id, `terminal ${t.id} lists (${d}) which is not a bulkhead`)
    if (t.system === 'bulkheads' && !(t.doors && t.doors.length)) err(id, `terminal ${t.id} lists no doors`)
    if (t.system !== 'bulkheads' && !t.section) err(id, `terminal ${t.id} has no section`)
    if (t.section && !(t.section in m.sections)) err(id, `terminal ${t.id} names unknown section ${t.section}`)
    for (const d of t.ducts ?? []) if (at(d[0], d[1]) !== 'duct') err(id, `terminal ${t.id} lists (${d}) which is not a duct`)
  }
  for (const d of m.sealed) if (at(d[0], d[1]) !== 'bulkhead') err(id, `sealed (${d}) is not a bulkhead`)
  for (const [name, rects] of Object.entries(m.sections))
    for (const r of rects) if (!inside(r[0], r[1]) || !inside(r[2], r[3]) || r[0] > r[2] || r[1] > r[3]) err(id, `section ${name} has a rect outside the grid`)
  for (const p of m.startPings) if (at(p[0], p[1]) !== 'duct') err(id, `start ping at (${p}) is not on a duct`)
  if (m.pingBag.length === 0 || m.pingBag.some((n) => !Number.isInteger(n) || n < 1)) err(id, 'ping bag must be non-empty positive integers')
  if (!Number.isInteger(m.roundLimit) || m.roundLimit < 1) err(id, 'bad round limit')
  if (m.arrivals.normal < 0 || m.arrivals.alarm < 0) err(id, 'bad arrivals')
  if (m.grid.join('').split('').some((c) => c === 'D' || c === 'B') === false && m.terminals.length) err(id, 'terminals but no doors')
}

checkRules()
const missions = listMissions()
for (const m of missions) checkMission(m)
if (errors.length) {
  for (const e of errors) console.error('FAIL', e)
  process.exit(1)
}
console.log(`data ok: ${missions.length} mission(s) (${missions.map((m) => m.id).join(', ')}), rules and roles valid`)
