/**
 * Learn.jsx – Structured learning flow
 *
 * Screens:
 *   course-list  → list all courses
 *   course-detail → lessons for a chosen course
 *   lesson-view  → steps for a chosen lesson (instructions / input / feedback)
 */
import { useState, useEffect, useRef } from 'react'
import {
  fetchCourses,
  fetchCourse,
  fetchLesson,
  submitAttempt,
  fetchMyProgress,
} from '../api/client'

// ---------------------------------------------------------------------------
// Tiny inline styles helpers
// ---------------------------------------------------------------------------

const panel = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '14px',
  padding: '20px',
}

const btn = (variant = 'primary') => ({
  fontFamily: "'Rajdhani', sans-serif",
  fontWeight: 700,
  fontSize: '15px',
  letterSpacing: '0.6px',
  cursor: 'pointer',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 22px',
  transition: 'opacity 0.15s',
  ...(variant === 'primary'
    ? {
        background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
        color: '#fff',
      }
    : variant === 'ghost'
    ? {
        background: 'rgba(124,58,237,0.12)',
        color: '#c4b5fd',
        border: '1px solid rgba(124,58,237,0.3)',
      }
    : {
        background: 'rgba(255,255,255,0.07)',
        color: '#e8e8f0',
        border: '1px solid rgba(255,255,255,0.15)',
      }),
})

const heading = (size = 22) => ({
  fontFamily: "'Orbitron', sans-serif",
  fontSize: `${size}px`,
  fontWeight: 800,
  background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  letterSpacing: '1px',
  marginBottom: '8px',
})

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------
function ProgressBar({ completed, total }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
        <span>{completed} / {total} steps</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #7c3aed, #00d4ff)',
            transition: 'width 0.4s ease',
            borderRadius: '3px',
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CourseList
// ---------------------------------------------------------------------------
function CourseList({ onSelect }) {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchCourses()
      .then(setCourses)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>Loading courses…</p>
  if (error) return <p style={{ color: '#f87171', textAlign: 'center', padding: '40px' }}>Error: {error}</p>
  if (!courses.length)
    return <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>No courses available yet.</p>

  return (
    <div>
      <div style={heading(20)}>CHOOSE YOUR COURSE</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '14px',
          marginTop: '16px',
        }}
      >
        {courses.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            style={{
              ...panel,
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'border-color 0.2s',
              background: 'rgba(124,58,237,0.07)',
              border: '1px solid rgba(124,58,237,0.25)',
              borderRadius: '14px',
              padding: '20px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#7c3aed')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.25)')}
          >
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>{c.icon}</div>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '14px', fontWeight: 700, color: '#e8e8f0', marginBottom: '6px' }}>
              {c.title}
            </div>
            <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '10px' }}>{c.description}</div>
            <div style={{ fontSize: '12px', color: '#7c3aed', fontWeight: 600 }}>
              {c.lesson_count} lesson{c.lesson_count !== 1 ? 's' : ''}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CourseDetail
// ---------------------------------------------------------------------------
function CourseDetail({ courseId, sessionId, onSelectLesson, onBack }) {
  const [course, setCourse] = useState(null)
  const [progress, setProgress] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchCourse(courseId),
      fetchMyProgress(sessionId),
    ])
      .then(([c, prog]) => {
        setCourse(c)
        setProgress(prog || [])
      })
      .finally(() => setLoading(false))
  }, [courseId, sessionId])

  if (loading) return <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>Loading…</p>
  if (!course) return <p style={{ color: '#f87171', padding: '20px' }}>Course not found.</p>

  const progressMap = Object.fromEntries(progress.map((p) => [p.lesson_id, p]))

  return (
    <div>
      <button style={{ ...btn('ghost'), marginBottom: '16px' }} onClick={onBack}>
        ← Back to Courses
      </button>
      <div style={heading(20)}>{course.icon} {course.title}</div>
      <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '20px' }}>{course.description}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {course.lessons.map((lesson, idx) => {
          const prog = progressMap[lesson.id]
          const completed = prog?.is_completed || false
          const stepsCompleted = prog?.steps_completed || 0
          return (
            <button
              key={lesson.id}
              onClick={() => onSelectLesson(lesson)}
              style={{
                ...panel,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                transition: 'border-color 0.2s',
                border: `1px solid ${completed ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.1)'}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#7c3aed')}
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = completed ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.1)')
              }
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Orbitron', sans-serif",
                  fontWeight: 800,
                  fontSize: '14px',
                  flexShrink: 0,
                  background: completed
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : 'rgba(124,58,237,0.2)',
                  color: completed ? '#fff' : '#c4b5fd',
                }}
              >
                {completed ? '✓' : idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#e8e8f0', fontSize: '15px', marginBottom: '2px' }}>
                  {lesson.title}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                  {lesson.description}
                </div>
                {prog && (
                  <ProgressBar completed={stepsCompleted} total={prog.steps_total ?? lesson.step_count} />
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', flexShrink: 0 }}>
                {lesson.step_count} step{lesson.step_count !== 1 ? 's' : ''} →
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StepView – instructions / input / feedback
// ---------------------------------------------------------------------------
function StepView({ step, sessionId, onNext, onComplete, isLast }) {
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    setAnswer('')
    setResult(null)
    if (inputRef.current) inputRef.current.focus()
  }, [step.id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!answer.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await submitAttempt(step.id, sessionId, answer.trim())
      setResult(res)
    } catch (err) {
      setResult({ is_correct: false, feedback: `Error: ${err.message}`, xp_earned: 0 })
    } finally {
      setSubmitting(false)
    }
  }

  const canContinue = result?.is_correct

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Instructions */}
      <div style={{ ...panel, borderLeft: '3px solid #7c3aed' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', letterSpacing: '1px', marginBottom: '8px' }}>
          INSTRUCTIONS
        </div>
        <p style={{ fontSize: '15px', color: '#e8e8f0', lineHeight: 1.6 }}>{step.instructions}</p>
        {step.problem && (
          <div
            style={{
              marginTop: '12px',
              padding: '14px 18px',
              background: 'rgba(124,58,237,0.1)',
              borderRadius: '10px',
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '22px',
              fontWeight: 800,
              color: '#00d4ff',
              letterSpacing: '2px',
              textAlign: 'center',
            }}
          >
            {step.problem}
          </div>
        )}
      </div>

      {/* Multiple-choice options */}
      {step.step_type === 'multiple_choice' && step.options?.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {step.options.map((opt) => (
            <button
              key={opt}
              onClick={() => setAnswer(opt)}
              style={{
                ...btn(answer === opt ? 'primary' : 'neutral'),
                textAlign: 'center',
                fontSize: '17px',
                fontFamily: "'Orbitron', sans-serif",
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}

      {/* Text / math input */}
      {step.step_type !== 'multiple_choice' && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px' }}>
          <input
            ref={inputRef}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer…"
            disabled={!!result?.is_correct}
            style={{
              flex: 1,
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '17px',
              fontWeight: 600,
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)',
              color: '#e8e8f0',
              outline: 'none',
            }}
          />
          <button type="submit" style={btn('primary')} disabled={submitting || !answer.trim()}>
            {submitting ? '…' : 'Check'}
          </button>
        </form>
      )}

      {/* Submit button for multiple choice */}
      {step.step_type === 'multiple_choice' && answer && !result && (
        <button style={btn('primary')} onClick={handleSubmit} disabled={submitting}>
          {submitting ? '…' : 'Check Answer'}
        </button>
      )}

      {/* Feedback panel */}
      {result && (
        <div
          style={{
            ...panel,
            background: result.is_correct ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            borderColor: result.is_correct ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.3)',
          }}
        >
          <p style={{ fontSize: '16px', fontWeight: 600, color: result.is_correct ? '#10b981' : '#f87171', marginBottom: '4px' }}>
            {result.feedback}
          </p>
          {result.xp_earned > 0 && (
            <p style={{ fontSize: '13px', color: '#fbbf24' }}>+{result.xp_earned} XP earned!</p>
          )}
          {!result.is_correct && result.hint && (
            <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '6px' }}>
              💡 Hint: {result.hint}
            </p>
          )}
          {!result.is_correct && (
            <button
              style={{ ...btn('ghost'), marginTop: '10px', fontSize: '13px', padding: '8px 14px' }}
              onClick={() => setResult(null)}
            >
              Try Again
            </button>
          )}
        </div>
      )}

      {/* Navigation */}
      {canContinue && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {isLast || result?.lesson_completed ? (
            <button style={btn('primary')} onClick={onComplete}>
              🎉 Lesson Complete!
            </button>
          ) : (
            <button style={btn('primary')} onClick={() => onNext(result?.next_step_id)}>
              Next Step →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LessonView
// ---------------------------------------------------------------------------
function LessonView({ lessonId, sessionId, onBack, onLessonComplete }) {
  const [lesson, setLesson] = useState(null)
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLesson(lessonId)
      .then(setLesson)
      .finally(() => setLoading(false))
  }, [lessonId])

  if (loading) return <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>Loading lesson…</p>
  if (!lesson) return <p style={{ color: '#f87171', padding: '20px' }}>Lesson not found.</p>

  const steps = lesson.steps || []
  const step = steps[currentStepIdx]

  const handleNext = (nextStepId) => {
    if (nextStepId) {
      const idx = steps.findIndex((s) => s.id === nextStepId)
      if (idx !== -1) {
        setCurrentStepIdx(idx)
        return
      }
    }
    if (currentStepIdx + 1 < steps.length) {
      setCurrentStepIdx(currentStepIdx + 1)
    } else {
      setCompleted(true)
    }
  }

  const handleComplete = () => setCompleted(true)

  if (completed) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🏆</div>
        <div style={heading(24)}>LESSON COMPLETE!</div>
        <p style={{ color: '#9ca3af', marginBottom: '24px' }}>
          You finished <strong style={{ color: '#e8e8f0' }}>{lesson.title}</strong>!
        </p>
        <button style={{ ...btn('primary'), marginRight: '10px' }} onClick={() => onLessonComplete(lesson)}>
          ← Back to Course
        </button>
      </div>
    )
  }

  if (!step) return <p style={{ color: '#9ca3af', padding: '20px' }}>No steps in this lesson.</p>

  return (
    <div>
      <button style={{ ...btn('ghost'), marginBottom: '16px' }} onClick={onBack}>
        ← Back to Lessons
      </button>

      {/* Lesson header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={heading(18)}>{lesson.title}</div>
        <ProgressBar completed={currentStepIdx} total={steps.length} />
        <p style={{ fontSize: '12px', color: '#9ca3af' }}>
          Step {currentStepIdx + 1} of {steps.length}
        </p>
      </div>

      {step && (
        <StepView
          key={step.id}
          step={step}
          sessionId={sessionId}
          onNext={handleNext}
          onComplete={handleComplete}
          isLast={currentStepIdx === steps.length - 1}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Learn – root component (manages which sub-screen is active)
// ---------------------------------------------------------------------------
export default function Learn({ sessionId, onBackToMap }) {
  const [screen, setScreen] = useState('course-list')
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [selectedLesson, setSelectedLesson] = useState(null)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0a0e1a 0%, #111827 100%)',
        padding: 'clamp(16px, 4vw, 40px)',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 'clamp(16px, 2.5vw, 22px)',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '1.5px',
          }}
        >
          📚 LEARN
        </div>
        <button style={btn('ghost')} onClick={onBackToMap}>
          🗺️ Back to Map
        </button>
      </div>

      {/* Content area */}
      <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        {screen === 'course-list' && (
          <CourseList
            onSelect={(course) => {
              setSelectedCourse(course)
              setScreen('course-detail')
            }}
          />
        )}

        {screen === 'course-detail' && selectedCourse && (
          <CourseDetail
            courseId={selectedCourse.id}
            sessionId={sessionId}
            onSelectLesson={(lesson) => {
              setSelectedLesson(lesson)
              setScreen('lesson-view')
            }}
            onBack={() => setScreen('course-list')}
          />
        )}

        {screen === 'lesson-view' && selectedLesson && (
          <LessonView
            lessonId={selectedLesson.id}
            sessionId={sessionId}
            onBack={() => setScreen('course-detail')}
            onLessonComplete={() => setScreen('course-detail')}
          />
        )}
      </div>
    </div>
  )
}
