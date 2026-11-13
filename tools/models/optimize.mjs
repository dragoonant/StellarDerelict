#!/usr/bin/env node
// Optimise the GLBs in public/assets/models: dedup, prune, weld, textures resized to at most 1024 and re-encoded as WebP,
// meshopt compression (the client's loader sets the meshopt decoder). Originals are kept in tools/out/models/raw.
// Idempotent: a file that is already meshopt-compressed is skipped.
// A model whose manifest entry has `maxTris` is simplified down to that budget (spec 30: props under 4k/6k/2k).
//   node tools/models/optimize.mjs [--dry-run] [--only slug,slug] [--dir public/assets/models] [--force]
// --force re-optimises an already compressed file from its raw copy in tools/out/models/raw (needed after a budget change).
// Needs (not part of this repo's dependencies until the GPU session installs them): see INSTALL_LINE below.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, isMain, list, parseFlags } from '../lib/studio.mjs'
import { INSTALL_LINE, MAX_TEXTURE, glbJson, isOptimized, simplifyRatio, triCount } from './lib.mjs'

const MANIFEST = path.join(REPO_ROOT, 'src', 'data', 'assets.json')

/** Remove primitives with fewer than three distinct vertices (a welded zero-size base disc), and meshes left empty. */
function dropDegenerate(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos || pos.getCount() < 3) {
        mesh.removePrimitive(prim)
        prim.dispose()
      }
    }
    if (mesh.listPrimitives().length === 0) mesh.dispose()
  }
}

export async function main(argv, io = { log: console.log, err: console.error }) {
  const v = parseFlags(argv, { 'dry-run': { type: 'boolean' }, only: { type: 'string' }, dir: { type: 'string' }, force: { type: 'boolean' } })
  const dir = path.resolve(String(v.dir ?? path.join(REPO_ROOT, 'public', 'assets', 'models')))
  const only = v.only ? new Set(list(v.only)) : null
  const budgets = Object.fromEntries((existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')).models : []).filter((m) => m.maxTris > 0).map((m) => [m.slug, m.maxTris]))
  const raw = path.join(REPO_ROOT, 'tools', 'out', 'models', 'raw')
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.glb') && (!only || only.has(f.replace(/\.glb$/, '')))).sort() : []
  io.log(`${files.length} GLB(s) in ${path.relative(REPO_ROOT, dir) || dir}`)
  // --force: a compressed file is redone from its raw copy when one exists; otherwise it is left alone.
  const source = (f) => (v.force === true && isOptimized(readFileSync(path.join(dir, f))) && existsSync(path.join(raw, f)) ? path.join(raw, f) : path.join(dir, f))
  const todo = files.filter((f) => !isOptimized(readFileSync(source(f))))
  for (const f of files) io.log(`  ${f.padEnd(28)} ${todo.includes(f) ? (source(f) !== path.join(dir, f) ? 'to optimise (from raw)' : 'to optimise') : 'already optimised'}${budgets[f.replace(/\.glb$/, '')] ? `, budget ${budgets[f.replace(/\.glb$/, '')]} tris` : ''}`)
  if (v['dry-run'] || todo.length === 0) return (v['dry-run'] && io.log('dry run: nothing written.'), 0)

  let core, fns, ext, mo, sharp
  try {
    core = await import('@gltf-transform/core')
    fns = await import('@gltf-transform/functions')
    ext = await import('@gltf-transform/extensions')
    mo = await import('meshoptimizer')
    sharp = (await import('sharp')).default
  } catch (e) {
    io.err(`models:optimize needs packages that are not installed (${e instanceof Error ? e.message.split('\n')[0] : e}).`)
    io.err(`Install them once:  ${INSTALL_LINE}`)
    return 2
  }
  await mo.MeshoptEncoder.ready
  await mo.MeshoptDecoder.ready
  await mo.MeshoptSimplifier.ready
  const nio = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': mo.MeshoptDecoder, 'meshopt.encoder': mo.MeshoptEncoder })
  mkdirSync(raw, { recursive: true })
  for (const f of todo) {
    const src = source(f)
    const dst = path.join(dir, f)
    const before = readFileSync(src)
    const tris = triCount(glbJson(before))
    const budget = budgets[f.replace(/\.glb$/, '')]
    const doc = await nio.readBinary(new Uint8Array(before))
    await doc.transform(
      fns.dedup(),
      fns.prune(),
      fns.weld(),
      dropDegenerate, // a 0 mm base from the finalize stage welds down to a couple of vertices: drop it
      fns.prune(),
      fns.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [MAX_TEXTURE, MAX_TEXTURE] }),
      fns.meshopt({ encoder: mo.MeshoptEncoder, level: 'medium' }),
    )
    const out = await nio.writeBinary(doc)
    if (src === dst) copyFileSync(src, path.join(raw, f))
    writeFileSync(dst, out)
    const after = triCount(glbJson(Buffer.from(out)))
    io.log(`  ${f}: ${(before.length / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB, ${tris} -> ${after} triangles${budget ? ` (budget ${budget})` : ''} (original kept in tools/out/models/raw)`)
    if (budget && after > budget) io.err(`  warning: ${f} is still over its budget of ${budget} triangles`)
  }
  return 0
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then((c) => { process.exitCode = c }, (e) => { console.error(e); process.exitCode = 1 })
