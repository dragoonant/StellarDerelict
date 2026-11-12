import { useState } from 'react'

// M0 placeholder: the title screen only. The mission arrives with M3 (PLAN.md).
export function App() {
  const [status, setStatus] = useState('')
  return (
    <main className="title" data-screen="title">
      <div className="title__rings" />
      <div className="title__sweep" />
      <h1 className="title__mark">Stellar<span>Derelict</span></h1>
      <p className="title__sub">Lantern Squad // boarding channel</p>
      <nav className="title__menu">
        <button type="button" onClick={() => setStatus('Boarding party not ready: the mission lands with the first playable.')}>
          Board the Halcyon Drift
        </button>
        <p className="title__status" role="status">{status}</p>
      </nav>
      <p className="title__note">An original game by evilgouki</p>
    </main>
  )
}
