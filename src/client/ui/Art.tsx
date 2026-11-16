// Generated stills on the screens (spec 70 ART-3..5): key art as a framed sensor feed, portraits as helmet-camera faces.
// An image that is not enabled, or failed to load, draws nothing: the screen reads the same without it. No `title` attributes
// (KB rule 8); the pictures are decoration beside text that already says everything, so their alt text is empty.
import { useSyncExternalStore } from 'react'
import { stalkerSlug, wardenSlug } from '../../data'
import type { Role } from '../../data'
import { artStore } from '../art/store'

function useArtUrl(use: string): string | null {
  useSyncExternalStore(artStore.subscribe, artStore.snapshot)
  return artStore.url(use)
}

/** A key-art plate in a feed frame: scanlines, a cold tint and an optional caption line. */
export function Feed({ use, className = '', caption }: { use: string; className?: string; caption?: string }) {
  const url = useArtUrl(use)
  if (!url) return null
  return (
    <figure className={`feed ${className}`} data-art={use}>
      <img src={url} alt="" decoding="async" draggable={false} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

/** The face of a unit: `unit:<id>` for a Warden (falling back to the portrait of its model), `model:<slug>` for a stalker. */
export function Face({ unit, role, nth = 0, stalker, className = '' }: { unit?: string; role?: Role; nth?: number; stalker?: string; className?: string }) {
  useSyncExternalStore(artStore.subscribe, artStore.snapshot)
  const url = stalker !== undefined ? artStore.url(`model:${stalkerSlug(stalker)}`) : (unit !== undefined ? artStore.url(`unit:${unit}`) : null) ?? (role ? artStore.url(`model:${wardenSlug(role, nth)}`) : null)
  if (!url) return null
  return <img className={`face ${className}`} src={url} alt="" decoding="async" draggable={false} data-face={stalker ?? unit ?? role} />
}
