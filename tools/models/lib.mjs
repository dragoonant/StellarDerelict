// Pure helpers for the model optimiser (unit-tested).
export const INSTALL_LINE = 'npm i -D @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer sharp'
export const MAX_TEXTURE = 1024

/** The JSON chunk of a binary glTF (Buffer or Uint8Array), or null when it is not a GLB. */
export function glbJson(buf) {
  const b = Buffer.from(buf)
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) return null
  const len = b.readUInt32LE(12)
  if (b.readUInt32LE(16) !== 0x4e4f534a || 20 + len > b.length) return null
  try {
    return JSON.parse(b.subarray(20, 20 + len).toString('utf8'))
  } catch {
    return null
  }
}

/** Already through the optimiser: meshopt-compressed (the optimiser is the only thing that writes that extension). */
export function isOptimized(buf) {
  const j = glbJson(buf)
  return !!j && Array.isArray(j.extensionsUsed) && j.extensionsUsed.includes('EXT_meshopt_compression')
}

export function triCount(json) {
  let n = 0
  for (const m of json?.meshes ?? []) for (const p of m.primitives ?? []) {
    const acc = p.indices !== undefined ? json.accessors?.[p.indices]?.count : json.accessors?.[p.attributes?.POSITION]?.count
    n += Math.floor((acc ?? 0) / 3)
  }
  return n
}
