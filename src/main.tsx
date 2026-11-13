import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './client/App'
import { initAudio } from './client/audio/director'
import { modelStore } from './client/models/store'
import { initSession } from './client/session'
import './client/theme.css'

// KB rule 24 fallback: browsers that ignore the CSS still must not select text or pop a callout on a long press.
const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
document.addEventListener('selectstart', (e) => { if (!editable(e.target)) e.preventDefault() })
document.addEventListener('contextmenu', (e) => { if (!editable(e.target)) e.preventDefault() })

const Gallery = lazy(() => import('./client/gallery/Gallery'))
const gallery = new URLSearchParams(location.search).has('gallery')

// KB rule 26: every enabled model starts downloading when the app opens.
modelStore.preloadEnabled()
if (!gallery) {
  initSession()
  initAudio()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {gallery ? (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
