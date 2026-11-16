import { existsSync } from 'node:fs'
import { listMissions, rules, roles, assets, getMission, runDef } from '../src/data'
import { EVENT_SOUNDS } from '../src/client/audio/soundMap'
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
  // the mission's words for the core, its room and the exit (the UI never says "core" to the player unless the mission does)
  if (!m.objective || !m.objective.item?.trim() || !m.objective.place?.trim() || !m.objective.exit?.trim()) err(id, 'objective needs item, place and exit')
  // formation hints for the Warden policy stand on walkable squares with a real facing
  for (const [name, slots] of Object.entries(m.aiHints ?? {}))
    for (const s of slots ?? []) {
      if (!walkable(at(s[0], s[1]))) err(id, `aiHints.${name} slot (${s[0]},${s[1]}) is not walkable`)
      if (!['N', 'E', 'S', 'W'].includes(s[2])) err(id, `aiHints.${name} slot (${s[0]},${s[1]}) has a bad facing`)
    }
  if (!m.squad.every((q, i) => m.squad.findIndex((o) => o.id === q.id) === i)) err(id, 'duplicate squad ids')
}

function checkRun(): void {
  const seen = new Set<string>()
  for (const id of runDef.missions) {
    if (!getMission(id)) err('run', `names unknown mission ${id}`)
    if (seen.has(id)) err('run', `lists ${id} twice`)
    seen.add(id)
  }
  if (runDef.missions.length < 2) err('run', 'a run needs at least two missions')
  // R-2: one squad plays the whole run, so every mission must field the same five members
  const first = getMission(runDef.missions[0] ?? '')
  for (const id of runDef.missions) {
    const m = getMission(id)
    if (!m || !first) continue
    const a = first.squad.map((q) => `${q.id}:${q.role}`).sort().join(' ')
    const b = m.squad.map((q) => `${q.id}:${q.role}`).sort().join(' ')
    if (a !== b) err('run', `${id} fields a different squad from ${first.id}`)
  }
}

const SPEC_SLUGS = ['warden-sergeant', 'warden-rifle-a', 'warden-rifle-b', 'warden-scorcher', 'warden-tech', 'stalker-a', 'stalker-b', 'stalker-c', 'terminal', 'console', 'core']
const MUSIC_STATES = ['calm', 'tense', 'battle', 'alarm', 'victory', 'defeat', 'title']
const PUBLIC = new URL('../public/assets/', import.meta.url)

/** Spec 70 ART-1 and ART-2: the generated 2D art. */
function checkImages(e: (msg: string) => void, onDisk: (file: string, what: string, enabled: boolean) => void): void {
  const KINDS = ['texture', 'portrait', 'plate', 'decal']
  const ASPECTS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9']
  const squad = (getMission('dead-reckoning')?.squad ?? []).map((u) => u.id)
  const missionIds = listMissions().map((m) => m.id)
  if (assets.art?.provider !== 'flux-studio' || !assets.art.model || !(assets.art.candidates >= 1)) e('art provider block is malformed')
  const ids = new Set<string>()
  const uses = new Set<string>()
  for (const im of assets.images ?? []) {
    if (ids.has(im.id)) e(`duplicate image ${im.id}`)
    ids.add(im.id)
    if (!KINDS.includes(im.kind)) e(`image ${im.id} has unknown kind ${im.kind}`)
    if (im.file !== `art/${im.id}.webp`) e(`image ${im.id} file must be art/${im.id}.webp`)
    if (!ASPECTS.includes(im.aspect)) e(`image ${im.id} has unknown aspect ${im.aspect}`)
    if (!Array.isArray(im.size) || im.size.length !== 2 || !im.size.every((n) => Number.isInteger(n) && n >= 64 && n <= 2048)) e(`image ${im.id} needs a size of two whole numbers from 64 to 2048`)
    if (!im.prompt || im.prompt.length < 40) e(`image ${im.id} has no prompt`)
    if (typeof im.enabled !== 'boolean') e(`image ${im.id} needs a boolean enabled`)
    if (!/^(floor|wall|ceiling|door|duct|title|unit:[a-z]+|model:[a-z-]+|mission:[a-z-]+|debrief:(warden|molt)-(win|loss)|scar:(burn|kill))$/.test(im.use)) e(`image ${im.id} has unknown use ${im.use}`)
    if (im.kind === 'portrait') {
      if (!im.ref || !assets.models.some((m) => m.slug === im.ref)) e(`portrait ${im.id} needs a ref naming a model`)
    } else if (im.ref !== undefined) e(`image ${im.id}: only portraits take a ref`)
    if (im.kind === 'texture' && !['floor', 'wall', 'ceiling', 'door', 'duct'].includes(im.use)) e(`texture ${im.id} must be used on a board surface`)
    if (im.kind === 'decal' && !im.use.startsWith('scar:')) e(`decal ${im.id} must be a scar`)
    if (im.enabled && (!Number.isInteger(im.pick) || !Number.isInteger(im.seed))) e(`image ${im.id} is enabled without a recorded pick and seed`)
    if (im.use.startsWith('unit:') && !squad.includes(im.use.slice(5))) e(`image ${im.id} names an unknown squad member`)
    if (im.use.startsWith('model:') && !assets.models.some((m) => m.slug === im.use.slice(6))) e(`image ${im.id} names an unknown model`)
    if (im.use.startsWith('mission:') && !missionIds.includes(im.use.slice(8))) e(`image ${im.id} names an unknown mission`)
    onDisk(im.file, `image ${im.id}`, im.enabled)
    uses.add(im.use)
  }
  const need = ['floor', 'wall', 'ceiling', 'door', 'duct', 'title', 'scar:burn', 'scar:kill', 'debrief:warden-win', 'debrief:warden-loss', 'debrief:molt-win', 'debrief:molt-loss']
  for (const w of squad) need.push(`unit:${w}`)
  for (const m of assets.models) if (m.kind === 'stalker') need.push(`model:${m.slug}`)
  for (const id of missionIds) need.push(`mission:${id}`)
  for (const u of need) if (!uses.has(u)) e(`no image for ${u}`)
}

function checkAssets(): void {
  const e = (msg: string): void => err('assets', msg)
  const onDisk = (file: string, what: string, enabled: boolean): void => {
    if (enabled && !existsSync(new URL(file, PUBLIC))) e(`${what} is enabled but public/assets/${file} does not exist`)
  }
  const seen = new Set<string>()
  for (const m of assets.models) {
    if (seen.has(m.slug)) e(`duplicate model ${m.slug}`)
    seen.add(m.slug)
    if (!['warden', 'stalker', 'prop'].includes(m.kind)) e(`model ${m.slug} has unknown kind ${m.kind}`)
    if (m.file !== `models/${m.slug}.glb`) e(`model ${m.slug} file must be models/${m.slug}.glb`)
    if (!(m.heightIn > 0) || m.heightIn > 5) e(`model ${m.slug} has a bad heightIn`)
    if (typeof m.yaw !== 'number' || typeof m.enabled !== 'boolean') e(`model ${m.slug} needs a numeric yaw and a boolean enabled`)
    if (!m.prompt || m.prompt.length < 40) e(`model ${m.slug} has no prompt`)
    if (m.kind === 'warden' && !m.role) e(`warden model ${m.slug} has no role`)
    onDisk(m.file, `model ${m.slug}`, m.enabled)
  }
  for (const s of SPEC_SLUGS) if (!seen.has(s)) e(`model ${s} from spec 30 is missing`)
  checkImages(e, onDisk)
  const ids = new Set<string>()
  for (const s of assets.sounds) {
    if (ids.has(s.id)) e(`duplicate sound ${s.id}`)
    ids.add(s.id)
    if (s.bus !== 'sfx') e(`sound ${s.id} bus must be sfx`)
    if (!(s.gain > 0 && s.gain <= 1.5)) e(`sound ${s.id} has a bad gain`)
    if (!(s.seconds >= 0.3 && s.seconds <= 30)) e(`sound ${s.id} seconds must be within the sound-effect model's 0.5-30 s (0.3 minimum for interface sounds)`)
    if (s.promptInfluence !== undefined && !(s.promptInfluence >= 0 && s.promptInfluence <= 1)) e(`sound ${s.id} promptInfluence must be 0-1`)
    if (!s.files.length || s.files.some((f) => !f.startsWith('audio/sfx/'))) e(`sound ${s.id} files must be under audio/sfx/`)
    if (![...Object.keys(EVENT_SOUNDS), 'ui', 'timer', 'always'].includes(s.event)) e(`sound ${s.id} names unknown event ${s.event}`)
    if (!s.prompt) e(`sound ${s.id} has no prompt`)
    for (const f of s.files) onDisk(f, `sound ${s.id}`, s.enabled)
  }
  for (const st of MUSIC_STATES) if (!assets.music.some((m) => m.state === st)) e(`music state ${st} is missing`)
  for (const m of assets.music) {
    if (!m.file.startsWith('audio/music/') || !(m.bpm >= 10 && m.bpm <= 300) || !(m.seconds >= 10 && m.seconds <= 240)) e(`music ${m.state} is malformed`)
    onDisk(m.file, `music ${m.state}`, m.enabled)
  }
  if (assets.audio?.provider !== 'elevenlabs' || !assets.audio.models?.sfx || !assets.audio.models?.music || !assets.audio.models?.tts) e('audio provider block is malformed')
  const squad = new Set((getMission('dead-reckoning')?.squad ?? []).map((u) => u.id))
  for (const [sp, p] of Object.entries(assets.voices ?? {})) {
    if (sp !== 'comms' && !squad.has(sp)) e(`voices table names unknown speaker ${sp}`)
    if (!/^[A-Za-z0-9]{10,}$/.test(p.voiceId ?? '') || !p.name || !p.design || !p.model) e(`voice profile ${sp} is malformed`)
  }
  for (const w of [...squad, 'comms']) if (!assets.voices?.[w]) e(`speaker ${w} has no voice profile`)
  const vids = new Set<string>()
  const CARRIER = ['core-taken', 'core-dropped', 'core-picked', 'carrier-breached']
  for (const v of assets.voice) {
    if (vids.has(v.id)) e(`duplicate voice ${v.id}`)
    vids.add(v.id)
    if (!assets.voices?.[v.speaker]) e(`voice ${v.id} names unknown speaker ${v.speaker}`)
    if (!v.id.startsWith(v.speaker === 'comms' ? 'briefing-' : `${v.speaker}-`)) e(`voice ${v.id} must be named after its speaker`)
    const briefing = v.event === 'briefing'
    if (!v.text.trim() || v.text.length > (briefing ? 400 : 80)) e(`voice ${v.id} text must be 1-${briefing ? 400 : 80} characters`)
    if (!v.file.startsWith('audio/voice/') || !v.voiceDesign) e(`voice ${v.id} is malformed`)
    if (v.voiceDesign !== assets.voices?.[v.speaker]?.design) e(`voice ${v.id} voiceDesign differs from its speaker's profile`)
    if (v.delivery !== undefined && !/^\[[a-z ]+\]$/.test(v.delivery)) e(`voice ${v.id} delivery must be an audio tag like [urgent]`)
    if (briefing) {
      const m = getMission(v.when ?? '')
      if (!m) e(`briefing voice ${v.id} names unknown mission ${v.when}`)
      else if (m.brief !== v.text) e(`briefing voice ${v.id} text differs from the mission brief`)
    } else if (!Object.keys(EVENT_SOUNDS).includes(v.event)) e(`voice ${v.id} names unknown event ${v.event}`)
    onDisk(v.file, `voice ${v.id}`, v.enabled)
  }
  for (const w of squad) {
    if (assets.voice.filter((v) => v.speaker === w && v.when !== 'carrier').length !== 6) e(`${w} needs exactly six voice lines of their own`)
    for (const c of CARRIER) if (!vids.has(`${w}-${c}`)) e(`${w} is missing the carrier line ${c}`)
  }
  for (const m of listMissions()) if (!vids.has(`briefing-${m.id}`)) e(`mission ${m.id} has no briefing narration`)
}

checkRules()
checkAssets()
const missions = listMissions()
for (const m of missions) checkMission(m)
checkRun()
if (errors.length) {
  for (const e of errors) console.error('FAIL', e)
  process.exit(1)
}
console.log(`data ok: ${missions.length} mission(s) (${missions.map((m) => m.id).join(', ')}), rules and roles valid`)
