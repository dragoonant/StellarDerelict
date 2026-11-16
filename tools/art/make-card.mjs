#!/usr/bin/env node
// The link-preview card (public/og.jpg, 1200 x 630): the title plate with the wordmark over it. Run after the title plate is
// picked: node tools/art/make-card.mjs. The wordmark is drawn from an SVG with a system sans face (the web fonts are not here).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/studio.mjs'

const src = path.join(REPO_ROOT, 'public', 'assets', 'art', 'title-wreck.webp')
const out = path.join(REPO_ROOT, 'public', 'og.jpg')
if (!existsSync(src)) {
  console.error('error: public/assets/art/title-wreck.webp is missing (pick the title plate first).')
  process.exit(2)
}
const sharp = (await import('sharp')).default
const W = 1200
const H = 630
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#05090b" stop-opacity="0.92"/><stop offset="0.5" stop-color="#05090b" stop-opacity="0.35"/><stop offset="1" stop-color="#05090b" stop-opacity="0.1"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <g font-family="Arial Narrow, Arial, Helvetica, sans-serif" font-weight="700">
    <text x="70" y="250" font-size="92" letter-spacing="26" fill="#3fe0c8">STELLAR</text>
    <text x="70" y="356" font-size="92" letter-spacing="26" fill="#cfeee9">DERELICT</text>
  </g>
  <text x="72" y="420" font-family="Consolas, Menlo, monospace" font-size="22" letter-spacing="5" fill="#1c9b8d">LANTERN SQUAD // BOARDING CHANNEL</text>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#12343a"/>
</svg>`
const info = await sharp(src).resize(W, H, { fit: 'cover', position: 'right' }).modulate({ saturation: 0.8 }).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 84, mozjpeg: true }).toFile(out)
console.log(`public/og.jpg written (${Math.round(info.size / 1024)} KB)`)
