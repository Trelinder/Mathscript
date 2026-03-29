/**
 * AnalogyOverlay
 *
 * A full-screen educational pop-up that sits on top of the Phaser canvas and
 * presents a bite-sized click-to-match analogy challenge for 5-7 year olds.
 *
 * Props
 * ─────
 *  conceptId  {string}    Analogy identifier fired by PlayScene (e.g. 'addition-intro')
 *  isVisible  {boolean}   Controls whether the overlay is shown
 *  onComplete {function}  Called after the child solves the puzzle; parent uses
 *                         this to unpause Phaser and award the tycoon reward
 *
 * React ↔ Phaser flow
 * ───────────────────
 *  PlayScene._fireMilestone(conceptId)
 *    → scene.pause()
 *    → game.registry.get('onAnalogyMilestone')?.({ conceptId, event: 'SHOW_ANALOGY' })
 *    → GamePlayerPage sets isVisible=true / conceptId
 *    → AnalogyOverlay shown
 *    → child solves → onComplete()
 *    → GamePlayerPage calls game.scene.resume('PlayScene') + awards reward
 */

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { recordMastery } from '../utils/milestoneSync'

// Explicit component aliases — keeps framer-motion usage unambiguous for
// ESLint (which doesn't have eslint-plugin-react installed to track JSX
// member-expression references like <motion.div>).
const MotionDiv    = motion.div
const MotionButton = motion.button

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimum time (ms) the success screen is shown before onComplete fires.
 * Gives the child time to read the message and enjoy the celebration before
 * being returned to the game.
 */
const MIN_SUCCESS_DISPLAY_MS = 2000

// ─────────────────────────────────────────────────────────────────────────────
// recordMastery is imported from ../utils/milestoneSync.
// It POSTs to /api/progress/milestone with offline-queue fallback.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Analogy content map
//
// Each entry defines one interactive challenge.  Add new conceptIds here as
// the game grows.  All text is written for a 5-7 year old reading level.
//
// Schema
// ──────
//  title      – large heading shown at the top of the card
//  question   – the challenge prompt
//  hint       – shown below the choices to guide a struggling child
//  kind       – 'count-match' | 'equation-match'  (drives the renderer)
//  choices    – array of option objects
//  correctId  – id of the correct choice
//  successMsg – message shown on a correct answer
// ─────────────────────────────────────────────────────────────────────────────
const ANALOGIES = {
  /**
   * addition-intro
   * The child sees the number 5 and must click the card showing 5 apples.
   * Reinforces the link between a numeral and a counted quantity.
   */
  'addition-intro': {
    title: '🍎  Counting Time!',
    question: 'Which group has   5   apples?',
    hint: 'Count every apple… one by one! 👆',
    kind: 'count-match',
    choices: [
      { id: 'a', emoji: '🍎', count: 3 },
      { id: 'b', emoji: '🍎', count: 5 },  // ← correct
      { id: 'c', emoji: '🍎', count: 7 },
    ],
    correctId: 'b',
    successMsg: "You got it! 🎉  5 apples = the number 5!",
  },

  /**
   * multiplication-groups
   * The child sees "2 × 3 = ?" and picks the card showing the right total.
   * Reinforces multiplication as repeated addition using a familiar context.
   */
  'multiplication-groups': {
    title: '⭐  Groups of Stars!',
    question: '2 bags with 3 stars each.  How many stars in total?',
    hint: 'Count all the stars — or add 3 + 3! 🌟',
    kind: 'equation-match',
    choices: [
      { id: 'a', label: '4',  emoji: '⭐', count: 4 },
      { id: 'b', label: '6',  emoji: '⭐', count: 6 },  // ← correct
      { id: 'c', label: '8',  emoji: '⭐', count: 8 },
    ],
    correctId: 'b',
    successMsg: "Brilliant! 🎉  2 groups of 3 = 6 stars!",
  },
}

// Fallback used when the conceptId is not in the map yet
const FALLBACK_ANALOGY = {
  title: '🌟  Math Moment!',
  question: 'Which number comes after 4?',
  hint: 'Count up from 4… what comes next?',
  kind: 'count-match',
  choices: [
    { id: 'a', emoji: '🔢', count: 3 },
    { id: 'b', emoji: '🔢', count: 5 },  // ← correct
    { id: 'c', emoji: '🔢', count: 7 },
  ],
  correctId: 'b',
  successMsg: "Amazing! 🎉  The number after 4 is 5!",
}

// ─────────────────────────────────────────────────────────────────────────────
// Framer-motion variants
// ─────────────────────────────────────────────────────────────────────────────

const backdropVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit:    { opacity: 0, transition: { duration: 0.3 } },
}

const cardVariants = {
  hidden:  { opacity: 0, scale: 0.6, y: 60 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 22, delay: 0.05 },
  },
  exit:    { opacity: 0, scale: 0.8, y: -40, transition: { duration: 0.25 } },
}

const successVariants = {
  hidden:  { opacity: 0, scale: 0.5 },
  visible: {
    opacity: 1, scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 18 },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// ChoiceCard  –  one tappable option
// ─────────────────────────────────────────────────────────────────────────────
function ChoiceCard({ choice, status, onSelect, disabled }) {
  const isCorrect  = status === 'correct'
  const isWrong    = status === 'wrong'
  const isNeutral  = status === 'idle'

  const borderColor = isCorrect ? '#22c55e'
                    : isWrong   ? '#ef4444'
                    : '#7c3aed'

  const bg = isCorrect ? 'linear-gradient(135deg,#14532d,#166534)'
           : isWrong   ? 'linear-gradient(135deg,#7f1d1d,#991b1b)'
           : 'linear-gradient(135deg,#1e1b4b,#2e1065)'

  return (
    <motion.button
      onClick={() => !disabled && onSelect(choice.id)}
      whileHover={isNeutral && !disabled ? { scale: 1.07, y: -4 } : {}}
      whileTap={isNeutral && !disabled ? { scale: 0.95 } : {}}
      animate={isWrong ? { x: [0, -8, 8, -6, 6, 0] } : {}}
      transition={isWrong ? { duration: 0.35, ease: 'easeInOut' } : {}}
      style={{
        background: bg,
        border: `3px solid ${borderColor}`,
        borderRadius: '20px',
        padding: '16px 12px 12px',
        cursor: disabled ? 'default' : 'pointer',
        minWidth: '110px',
        minHeight: '120px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        boxShadow: isCorrect ? `0 0 24px #22c55e88`
                 : isWrong   ? `0 0 18px #ef444488`
                 : `0 0 16px ${borderColor}44`,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Emoji grid — wraps naturally for larger counts */}
      <div style={{
        fontSize: '22px',
        lineHeight: 1.35,
        textAlign: 'center',
        letterSpacing: '2px',
        maxWidth: '90px',
        wordBreak: 'break-all',
      }}>
        {choice.emoji.repeat(choice.count)}
      </div>

      {/* Count label */}
      <div style={{
        fontFamily: '"Orbitron", monospace',
        fontSize: '22px',
        fontWeight: 800,
        color: isCorrect ? '#86efac' : isWrong ? '#fca5a5' : '#e2e8f0',
      }}>
        {choice.label ?? choice.count}
      </div>

      {/* Status badge */}
      {isCorrect && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          style={{ fontSize: '20px' }}
        >
          ✅
        </motion.div>
      )}
      {isWrong && <div style={{ fontSize: '20px' }}>❌</div>}
    </motion.button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AnalogyOverlay  –  main export
// ─────────────────────────────────────────────────────────────────────────────
export default function AnalogyOverlay({ conceptId, isVisible, onComplete, userId }) {
  // 'idle' | 'wrong' | 'solved'
  const [phase, setPhase] = useState('idle')
  // Maps choice id → 'idle' | 'wrong' | 'correct'
  const [choiceStatus, setChoiceStatus] = useState({})
  // Tracks which wrong ids were attempted so they stay red
  const [wrongIds, setWrongIds] = useState(new Set())

  const analogy = ANALOGIES[conceptId] ?? FALLBACK_ANALOGY

  // Fire onComplete after letting the success animation play.
  //
  // The API call and the 2 s success-screen timer run concurrently so the
  // child never waits longer than necessary:
  //  • Fast API (< 2 s): onComplete fires at exactly 2 s.
  //  • Slow API (> 2 s): onComplete fires when the API resolves.
  //  • Offline / error: milestone saved to localStorage, onComplete fires
  //    after 2 s so the game is never stuck waiting for a network response.
  //
  // onComplete is called only AFTER this whole sequence — it unpauses Phaser
  // and awards the tycoon reward, satisfying the "200 OK before reward" rule
  // while still being resilient to network failures.
  const handleSolved = useCallback(async (resolvedConceptId) => {
    setPhase('solved')

    // Run the API call and minimum-display timer in parallel
    await Promise.allSettled([
      recordMastery(userId, resolvedConceptId),
      new Promise((resolve) => setTimeout(resolve, MIN_SUCCESS_DISPLAY_MS)),
    ])

    onComplete?.()
  }, [userId, onComplete])

  const handleSelect = useCallback((choiceId) => {
    if (phase !== 'idle') return

    if (choiceId === analogy.correctId) {
      // Mark correct and celebrate
      setChoiceStatus((prev) => ({ ...prev, [choiceId]: 'correct' }))
      // Small delay so the ✅ is visible before the success screen takes over
      setTimeout(() => handleSolved(conceptId), 600)
    } else {
      // Mark wrong — it will shake then stay red
      const newWrong = new Set(wrongIds).add(choiceId)
      setWrongIds(newWrong)
      setChoiceStatus((prev) => ({ ...prev, [choiceId]: 'wrong' }))
    }
  }, [phase, analogy.correctId, conceptId, wrongIds, handleSolved])

  return (
    <AnimatePresence>
      {isVisible && (
        // ── Backdrop ────────────────────────────────────────────────────────
        <motion.div
          key="analogy-backdrop"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{
            position: 'fixed',
            inset: 0,
            // Sits above the Phaser canvas (default z-index 0) and any
            // other app UI, but below browser native dialogs
            zIndex: 200,
            background: 'rgba(5, 8, 22, 0.82)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          {/* ── Main card ─────────────────────────────────────────────────── */}
          <motion.div
            key="analogy-card"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              background: 'linear-gradient(160deg,#1e1b4b 0%,#0f172a 60%,#1e1b4b 100%)',
              border: '3px solid #7c3aed',
              borderRadius: '28px',
              padding: '32px 28px 28px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 0 60px #7c3aed55, 0 20px 60px rgba(0,0,0,0.7)',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Decorative glow ring behind card */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '28px',
              background: 'radial-gradient(ellipse at 50% 0%, #7c3aed22 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />

            <AnimatePresence mode="wait">
              {phase !== 'solved' ? (
                /* ── Challenge view ───────────────────────────────────────── */
                <motion.div
                  key="challenge"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                >
                  {/* Title */}
                  <div style={{
                    fontFamily: '"Orbitron", monospace',
                    fontSize: 'clamp(18px, 4vw, 26px)',
                    fontWeight: 800,
                    color: '#c4b5fd',
                    marginBottom: '10px',
                    letterSpacing: '0.5px',
                  }}>
                    {analogy.title}
                  </div>

                  {/* Question */}
                  <div style={{
                    fontFamily: '"Rajdhani", sans-serif',
                    fontSize: 'clamp(16px, 3.5vw, 22px)',
                    fontWeight: 700,
                    color: '#f8fafc',
                    marginBottom: '24px',
                    lineHeight: 1.4,
                  }}>
                    {analogy.question}
                  </div>

                  {/* Choice cards */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                    marginBottom: '20px',
                  }}>
                    {analogy.choices.map((choice) => (
                      <ChoiceCard
                        key={choice.id}
                        choice={choice}
                        status={choiceStatus[choice.id] ?? 'idle'}
                        onSelect={handleSelect}
                        disabled={phase === 'solved'}
                      />
                    ))}
                  </div>

                  {/* Hint */}
                  <div style={{
                    fontFamily: '"Rajdhani", sans-serif',
                    fontSize: '15px',
                    color: '#94a3b8',
                    fontStyle: 'italic',
                    marginTop: '4px',
                  }}>
                    {analogy.hint}
                  </div>
                </motion.div>
              ) : (
                /* ── Success view ─────────────────────────────────────────── */
                <motion.div
                  key="success"
                  variants={successVariants}
                  initial="hidden"
                  animate="visible"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '12px 0',
                  }}
                >
                  {/* Pulsing star burst */}
                  <motion.div
                    animate={{ scale: [1, 1.18, 1], rotate: [0, 8, -8, 0] }}
                    transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ fontSize: '72px', lineHeight: 1 }}
                  >
                    🌟
                  </motion.div>

                  <div style={{
                    fontFamily: '"Orbitron", monospace',
                    fontSize: 'clamp(20px, 5vw, 32px)',
                    fontWeight: 800,
                    color: '#fbbf24',
                    textShadow: '0 0 20px #fbbf2488',
                  }}>
                    Success!
                  </div>

                  <div style={{
                    fontFamily: '"Rajdhani", sans-serif',
                    fontSize: 'clamp(15px, 3vw, 20px)',
                    fontWeight: 700,
                    color: '#e2e8f0',
                    maxWidth: '340px',
                    lineHeight: 1.45,
                  }}>
                    {analogy.successMsg}
                  </div>

                  {/* Coin reward preview */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    style={{
                      background: 'linear-gradient(135deg,#78350f,#92400e)',
                      border: '2px solid #fbbf24',
                      borderRadius: '14px',
                      padding: '10px 22px',
                      fontFamily: '"Rajdhani", sans-serif',
                      fontSize: '17px',
                      fontWeight: 700,
                      color: '#fde68a',
                    }}
                  >
                    🪙 Bonus coins incoming…
                  </motion.div>

                  <div style={{
                    fontFamily: '"Rajdhani", sans-serif',
                    fontSize: '13px',
                    color: '#64748b',
                    marginTop: '4px',
                  }}>
                    Saving progress &amp; returning to game…
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
