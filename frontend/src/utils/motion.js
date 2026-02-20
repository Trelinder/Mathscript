import { useEffect, useState } from 'react'

function safeMatchMedia(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

export function computeMotionSettings() {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      reduceEffects: false,
      lowEndDevice: false,
      canHover: true,
      particleScale: 1,
    }
  }

  const isMobile = safeMatchMedia('(max-width: 768px)')
  const prefersReducedMotion = safeMatchMedia('(prefers-reduced-motion: reduce)')
  const canHover = safeMatchMedia('(hover: hover)')

  const nav = window.navigator || {}
  const cores = Number(nav.hardwareConcurrency || 0)
  const memory = Number(nav.deviceMemory || 0)
  const saveData = Boolean(nav.connection?.saveData)

  const lowEndDevice = saveData || (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4)
  const reduceEffects = prefersReducedMotion || (isMobile && lowEndDevice)
  const particleScale = reduceEffects ? 0.45 : isMobile ? 0.7 : 1

  return {
    isMobile,
    reduceEffects,
    lowEndDevice,
    canHover,
    particleScale,
  }
}

export function useMotionSettings() {
  const [settings, setSettings] = useState(() => computeMotionSettings())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const update = () => setSettings(computeMotionSettings())
    const mql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

    window.addEventListener('resize', update)
    mql?.addEventListener?.('change', update)

    return () => {
      window.removeEventListener('resize', update)
      mql?.removeEventListener?.('change', update)
    }
  }, [])

  return settings
}
