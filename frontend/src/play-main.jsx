import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import TycoonComingSoon from './components/TycoonComingSoon'

function TycoonApp() {
  return (
    <TycoonComingSoon />
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TycoonApp />
  </StrictMode>,
)
