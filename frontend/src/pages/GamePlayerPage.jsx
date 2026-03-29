import { useEffect, useRef, useCallback } from 'react'

// Reference resolution for the 16:9 game canvas
const GAME_WIDTH = 800
const GAME_HEIGHT = 450

function computeCanvasSize() {
  const scaleX = window.innerWidth / GAME_WIDTH
  const scaleY = window.innerHeight / GAME_HEIGHT
  const scale = Math.min(scaleX, scaleY)
  return {
    width: Math.floor(GAME_WIDTH * scale),
    height: Math.floor(GAME_HEIGHT * scale),
  }
}

// Derive the game slug from the current URL path, e.g. /play/idle-math → 'idle-math'
function getGameSlug() {
  if (typeof window === 'undefined') return 'idle-math'
  return (window.location.pathname || '')
    .replace(/^\/play\//, '')
    .replace(/\/+$/, '') || 'idle-math'
}

export default function GamePlayerPage({ onAnalogyMilestone }) {
  const containerRef = useRef(null)
  const gameRef = useRef(null)

  // Keep the milestone callback in a ref so the Phaser scene always calls the
  // latest version without needing to destroy and recreate the game.
  const milestoneCallbackRef = useRef(onAnalogyMilestone)
  useEffect(() => {
    milestoneCallbackRef.current = onAnalogyMilestone
  }, [onAnalogyMilestone])

  const slug = getGameSlug()

  const handleResize = useCallback(() => {
    if (!containerRef.current) return
    const { width, height } = computeCanvasSize()
    containerRef.current.style.width = `${width}px`
    containerRef.current.style.height = `${height}px`
    if (gameRef.current) {
      gameRef.current.scale.resize(width, height)
    }
  }, [])

  useEffect(() => {
    // Size the container immediately before Phaser renders into it
    handleResize()

    let cancelled = false

    // Dynamic import keeps Phaser out of the main bundle
    import('phaser').then((mod) => {
      if (cancelled || !containerRef.current) return

      const Phaser = mod.default
      const { width, height } = computeCanvasSize()

      const config = {
        type: Phaser.AUTO,
        width,
        height,
        parent: 'phaser-game-container',
        backgroundColor: '#0a0e1a',
        scale: {
          // React owns the container size; we handle resize manually above
          mode: Phaser.Scale.NONE,
        },
        scene: {
          create() {
            // ── React-to-Phaser bridge ────────────────────────────────────
            // Phaser scenes fire Analogy Milestones by calling:
            //   this.registry.get('onAnalogyMilestone')?.({ milestone: '...' })
            this.registry.set('onAnalogyMilestone', (data) => {
              milestoneCallbackRef.current?.(data)
            })

            // Placeholder splash — replace with the real idle-math scene
            const cx = this.scale.width / 2
            const cy = this.scale.height / 2

            this.add
              .text(cx, cy, slug.replace(/-/g, ' ').toUpperCase(), {
                fontFamily: 'Orbitron, monospace',
                fontSize: `${Math.round(this.scale.height * 0.06)}px`,
                color: '#7c3aed',
                align: 'center',
              })
              .setOrigin(0.5)

            this.add
              .text(cx, cy + Math.round(this.scale.height * 0.1), 'Game engine ready', {
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: `${Math.round(this.scale.height * 0.04)}px`,
                color: '#94a3b8',
                align: 'center',
              })
              .setOrigin(0.5)
          },
        },
      }

      const game = new Phaser.Game(config)
      gameRef.current = game
    })

    window.addEventListener('resize', handleResize)

    return () => {
      cancelled = true
      window.removeEventListener('resize', handleResize)
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
    }
  }, [handleResize, slug])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0e1a',
        overflow: 'hidden',
      }}
    >
      <div
        id="phaser-game-container"
        ref={containerRef}
        style={{
          background: '#0a0e1a',
          position: 'relative',
          overflow: 'hidden',
        }}
      />
    </div>
  )
}
