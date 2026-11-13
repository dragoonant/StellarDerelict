import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './client/App'
import { initSession } from './client/session'
import './client/theme.css'

// KB rule 24 fallback: browsers that ignore the CSS still must not select text or pop a callout on a long press.
const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
document.addEventListener('selectstart', (e) => { if (!editable(e.target)) e.preventDefault() })
document.addEventListener('contextmenu', (e) => { if (!editable(e.target)) e.preventDefault() })

initSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
