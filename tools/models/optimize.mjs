#!/usr/bin/env node
// Optimise the GLBs in public/assets/models: dedup, prune, weld, textures resized to at most 1024 and re-encoded as WebP,
// meshopt compression (the client's loader sets the meshopt decoder). Originals are kept in tools/out/models/raw.
// Idempotent: a file that is already meshopt-compressed is skipped.
//   node tools/models/optimize.mjs [--dry-run] [--only slug,slug] [--dir public/assets/models]
// Needs (not part of this repo's dependencies until the GPU session installs them): see INSTALL_LINE below.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, isMain, list, parseFlags } from '../lib/studio.mjs'
import { INSTALL_LINE, MAX_TEXTURE, glbJson, isOptimized, triCount } from './lib.mjs'

export async function main(argv, io = { log: console.log, err: console.error }) {
  const v = parseFlags(argv, { 'dry-run': { type: 'boolean' }, only: { type: 'string' }, dir: { type: 'string' } })
  const dir = path.resolve(String(v.dir ?? path.join(REPO_ROOT, 'public', 'assets', 'models')))
  const only = v.only ? new Set(list(v.only)) : null
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.glb') && (!only || only.has(f.replace(/\.glb$/, '')))).sort() : []
  io.log(`${files.length} GLB(s) in ${path.relative(REPO_ROOT, dir) || dir}`)
  const todo = files.filter((f) => !isOptimized(readFileSync(path.join(dir, f))))
  for (const f of files) io.log(`  ${f.padEnd(28)} ${todo.includes(f) ? 'to optimise' : 'already optimised'}`)
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
  const nio = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': mo.MeshoptDecoder, 'meshopt.encoder': mo.MeshoptEncoder })
  const raw = path.join(REPO_ROOT, 'tools', 'out', 'models', 'raw')
  mkdirSync(raw, { recursive: true })
  for (const f of todo) {
    const src = path.join(dir, f)
    const before = readFileSync(src)
    const doc = await nio.readBinary(new Uint8Array(before))
    await doc.transform(
      fns.dedup(),
      fns.prune(),
      fns.weld(),
      fns.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [MAX_TEXTURE, MAX_TEXTURE] }),
      fns.meshopt({ encoder: mo.MeshoptEncoder, level: 'medium' }),
    )
    const out = await nio.writeBinary(doc)
    copyFileSync(src, path.join(raw, f))
    writeFileSync(src, out)
    io.log(`  ${f}: ${(before.length / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB, ${triCount(glbJson(Buffer.from(out)))} triangles (original kept in tools/out/models/raw)`)
  }
  return 0
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then((c) => { process.exitCode = c }, (e) => { console.error(e); process.exitCode = 1 })
