import { useEffect } from 'react'
import { BoardCanvas } from './board/Board'
import { installHooks } from './hooks'
import { pageHidden, tickTimer } from './session'
import { useStore } from './store'
import { Hud } from './ui/Hud'
import { Briefing, Debrief, Title } from './ui/Screens'

export function App() {
  const screen = useStore((s) => s.screen)
  useEffect(() => {
    installHooks()
    const t = setInterval(tickTimer, 250)
    const hide = (): void => pageHidden()
    window.addEventListener('pagehide', hide)
    return () => {
      clearInterval(t)
      window.removeEventListener('pagehide', hide)
    }
  }, [])
  return (
    <>
      <BoardCanvas />
      {screen === 'title' && <Title />}
      {screen === 'briefing' && <Briefing />}
      {screen === 'mission' && <Hud />}
      {screen === 'debrief' && <Debrief />}
    </>
  )
}
