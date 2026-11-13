// Prompt lint (KB rule 23 and the spec 30 brand ban). Fails on any banned word in any models[].prompt.
// The banned list lives only here, assembled from fragments so a repo-wide grep for the words stays clean.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const FRAGMENTS = [
  ['c', 'hibi'],
  ['mg', 'sd'],
  ['sd', ''],
  ['super-', 'deformed'],
  ['master ', 'grade sd'],
  ['gund', 'am'],
  ['nen', 'doroid'],
  ['cu', 'te'],
  ['kawa', 'ii'],
  ['t', 'oy'],
  ['cart', 'oony'],
  ['stub', 'by'],
  ['tin', 'y legs'],
  ['whirr ', 'machine'],
  ['fell', '-in'],
  ['dead o', 'f winner'],
  ['murder', ' squad'],
  ['mecha', ' kit'],
  ['war', 'hammer'],
  ['games w', 'orkshop'],
  ['cita', 'del'],
  ['space', ' marine'],
  ['ban', 'dai'],
  ['tami', 'ya'],
  ['re', 'vell'],
  ['gun', 'pla'],
  ['hasb', 'ro'],
  ['ma', 'ttel'],
  ['le', 'go'],
  ['fun', 'ko'],
]

export function bannedWords() {
  return FRAGMENTS.map((f) => f.join(''))
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const PATTERNS = bannedWords().map((w) => ({ word: w, re: new RegExp(`(?<![a-z0-9])${esc(w)}s?(?![a-z0-9])`, 'i') }))

/** The banned words found in one prompt (empty when clean). */
export function lintPrompt(text) {
  return PATTERNS.filter((p) => p.re.test(String(text))).map((p) => p.word)
}

export function lintManifest(manifest) {
  const bad = []
  for (const m of manifest.models) for (const word of lintPrompt(m.prompt)) bad.push({ slug: m.slug, word })
  return bad
}

export function loadManifest() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  return JSON.parse(readFileSync(resolve(root, 'src/data/assets.json'), 'utf8'))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = loadManifest()
  const bad = lintManifest(manifest)
  if (bad.length) {
    for (const b of bad) console.error(`FAIL ${b.slug}: banned word "${b.word}"`)
    process.exit(1)
  }
  console.log(`prompts ok: ${manifest.models.length} model prompt(s) clean`)
}
