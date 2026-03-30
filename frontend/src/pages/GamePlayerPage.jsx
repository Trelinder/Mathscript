import { useState, useEffect, useRef, useCallback } from 'react'
import AnalogyOverlay from '../components/AnalogyOverlay'
import { syncPendingMilestones } from '../utils/milestoneSync'

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

export default function GamePlayerPage({ onAnalogyMilestone, sessionId }) {
  const containerRef = useRef(null)
  const gameRef = useRef(null)

  // ── Drain any offline-queued milestones from previous sessions ───────────
  useEffect(() => {
    syncPendingMilestones()
  }, [])

  // ── Analogy overlay state ─────────────────────────────────────────────────
  const [overlayConceptId, setOverlayConceptId] = useState(null)
  const [overlayVisible, setOverlayVisible] = useState(false)

  // Keep the milestone callback in a ref so the Phaser scene always calls the
  // latest version without needing to destroy and recreate the game.
  const milestoneCallbackRef = useRef(onAnalogyMilestone)
  useEffect(() => {
    milestoneCallbackRef.current = onAnalogyMilestone
  }, [onAnalogyMilestone])

  // ── Called by Phaser when an Analogy Milestone fires ─────────────────────
  // Shows the overlay; Phaser has already paused itself (PlayScene._fireMilestone).
  const handleMilestone = useCallback((data) => {
    setOverlayConceptId(data?.conceptId ?? null)
    setOverlayVisible(true)
    // Also notify any external listener (e.g. App.jsx analytics)
    milestoneCallbackRef.current?.(data)
  }, [])

  // ── Called by AnalogyOverlay once the child solves the puzzle ─────────────
  // Hides the overlay and resumes the paused Phaser scene.
  const handleOverlayComplete = useCallback(() => {
    setOverlayVisible(false)
    // Resume PlayScene — it was paused by _fireMilestone before the event fired
    if (gameRef.current) {
      gameRef.current.scene.resume('PlayScene')
    }
  }, [])

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

    // Dynamic imports keep Phaser and the game scenes out of the main bundle
    Promise.all([
      import('phaser'),
      import('../game/BootScene'),
      import('../game/PreloadScene'),
      import('../game/PlayScene'),
    ]).then(([mod, { default: BootScene }, { default: PreloadScene }, { default: PlayScene }]) => {
      if (cancelled || !containerRef.current) return

      const Phaser = mod
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
        // ── Three-scene pipeline ──────────────────────────────────────────
        // BootScene  → PreloadScene (loading bar + texture generation)
        //           → PlayScene    (idle tycoon gameplay)
        scene: [BootScene, PreloadScene, PlayScene],
      }

      const game = new Phaser.Game(config)
      gameRef.current = game

      // ── React-to-Phaser bridge ────────────────────────────────────────────
      // Store the milestone callback in the game registry so any scene can
      // fire it with:  this.registry.get('onAnalogyMilestone')?.({ conceptId })
      game.registry.set('onAnalogyMilestone', (data) => {
        handleMilestone(data)
      })
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
  }, [handleResize, handleMilestone])

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

      {/* ── Analogy Overlay ──────────────────────────────────────────────────
          Rendered outside the Phaser container so it can cover the full
          viewport with its own fixed positioning and z-index.
          key={overlayConceptId} remounts the component for each new concept,
          automatically resetting all interaction state.                      */}
      <AnalogyOverlay
        key={overlayConceptId ?? 'none'}
        conceptId={overlayConceptId}
        isVisible={overlayVisible}
        onComplete={handleOverlayComplete}
        userId={sessionId}
      />
    </div>
  )
}
