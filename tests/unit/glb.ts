// A minimal valid binary glTF, built by hand: one indexed box (24 vertices with normals) as a single mesh node.
export function makeBoxGlb(w: number, h: number, d: number): ArrayBuffer {
  const x = w / 2
  const z = d / 2
  // six faces, each: normal and four corners (counter-clockwise seen from outside)
  const faces: { n: [number, number, number]; v: [number, number, number][] }[] = [
    { n: [0, 0, 1], v: [[-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z]] },
    { n: [0, 0, -1], v: [[x, 0, -z], [-x, 0, -z], [-x, h, -z], [x, h, -z]] },
    { n: [1, 0, 0], v: [[x, 0, z], [x, 0, -z], [x, h, -z], [x, h, z]] },
    { n: [-1, 0, 0], v: [[-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z]] },
    { n: [0, 1, 0], v: [[-x, h, z], [x, h, z], [x, h, -z], [-x, h, -z]] },
    { n: [0, -1, 0], v: [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]] },
  ]
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  faces.forEach((f, i) => {
    for (const p of f.v) {
      pos.push(...p)
      nor.push(...f.n)
    }
    const o = i * 4
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3)
  })
  const posB = new Float32Array(pos)
  const norB = new Float32Array(nor)
  const idxB = new Uint16Array(idx)
  const bin = new Uint8Array(posB.byteLength + norB.byteLength + idxB.byteLength)
  bin.set(new Uint8Array(posB.buffer), 0)
  bin.set(new Uint8Array(norB.buffer), posB.byteLength)
  bin.set(new Uint8Array(idxB.buffer), posB.byteLength + norB.byteLength)
  const json = {
    asset: { version: '2.0', generator: 'stellar-derelict fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.7, 0.72, 0.7, 1], metallicFactor: 0, roughnessFactor: 0.9 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-x, 0, -z], max: [x, h, z] },
      { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posB.byteLength },
      { buffer: 0, byteOffset: posB.byteLength, byteLength: norB.byteLength },
      { buffer: 0, byteOffset: posB.byteLength + norB.byteLength, byteLength: idxB.byteLength },
    ],
    buffers: [{ byteLength: bin.byteLength }],
  }
  let js = new TextEncoder().encode(JSON.stringify(json))
  const jpad = (4 - (js.length % 4)) % 4
  if (jpad) {
    const padded = new Uint8Array(js.length + jpad).fill(0x20)
    padded.set(js)
    js = padded
  }
  const bpad = (4 - (bin.length % 4)) % 4
  const binP = new Uint8Array(bin.length + bpad)
  binP.set(bin)
  const total = 12 + 8 + js.length + 8 + binP.length
  const out = new ArrayBuffer(total)
  const dv = new DataView(out)
  const u8 = new Uint8Array(out)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, js.length, true)
  dv.setUint32(16, 0x4e4f534a, true)
  u8.set(js, 20)
  const o = 20 + js.length
  dv.setUint32(o, binP.length, true)
  dv.setUint32(o + 4, 0x004e4942, true)
  u8.set(binP, o + 8)
  return out
}
