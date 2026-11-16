// art.html: every generated image in the manifest, with where it is used, which candidate was picked, its seed and its
// prompt. Not part of the game: the page where the owner looks the art over and names what to render again (spec 70).
import '../client/theme.css'
import { assets, type ImageEntry } from '../data'

const base = import.meta.env.BASE_URL + 'assets/'
const root = document.getElementById('root') as HTMLElement

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

const KINDS: { kind: ImageEntry['kind']; title: string; note: string }[] = [
  { kind: 'plate', title: 'Key art', note: 'Title, Missions, Briefing and Debrief. Shown in the game as a sensor feed: scanlines, a cold tint and a caption.' },
  { kind: 'portrait', title: 'Faces', note: 'Each one is an image edit of the picked concept of the model that stands on the board.' },
  { kind: 'texture', title: 'Board textures', note: 'Greyscale and levelled to one mean; the board tints them with the state colours (seen, mapped, sealed, torn).' },
  { kind: 'decal', title: 'Scars', note: 'Shown here on a mid grey so the clear paper reads. On the deck: a burn mark where a burst burned out, a splash where a stalker fell.' },
]

function card(im: ImageEntry): HTMLElement {
  const li = el('li', `artcard artcard--${im.kind}`)
  li.dataset.image = im.id
  if (im.enabled) {
    const img = el('img')
    img.src = base + im.file
    img.alt = ''
    img.loading = 'lazy'
    img.draggable = false
    img.addEventListener('error', () => {
      img.replaceWith(el('p', 'line line--alarm', 'The file did not load.'))
    })
    li.append(img)
  } else li.append(el('p', 'line line--dim', 'Not published yet.'))
  li.append(el('strong', undefined, im.id))
  li.append(el('span', 'dim', `${im.use} | ${im.size[0]} x ${im.size[1]}${im.pick !== undefined ? ` | candidate ${im.pick}, seed ${im.seed}` : ''}${im.ref ? ` | edit of ${im.ref}` : ''}`))
  li.append(el('span', 'artcard__prompt', im.prompt))
  return li
}

function render(): void {
  root.className = 'artpage'
  root.append(el('h1', undefined, 'Stellar Derelict art'))
  root.append(
    el(
      'p',
      'line line--dim',
      `${assets.images.filter((im) => im.enabled).length} of ${assets.images.length} images published, from ${assets.art.provider} (${assets.art.model}), ${assets.art.candidates} candidates each. Render another take: npm run art:gen -- --only <id> --reroll 1, then --pick <id>:<n>.`,
    ),
  )
  for (const k of KINDS) {
    const list = assets.images.filter((im) => im.kind === k.kind)
    if (list.length === 0) continue
    const sec = el('section')
    sec.append(el('h2', undefined, `${k.title} (${list.length})`))
    sec.append(el('p', 'line line--dim', k.note))
    const ul = el('ul', 'artgrid')
    for (const im of list) ul.append(card(im))
    sec.append(ul)
    root.append(sec)
  }
}

render()
