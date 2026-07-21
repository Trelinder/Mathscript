import { useMemo, useState } from 'react'
import { useMotionSettings } from '../utils/motion'

const QUESTION_COUNT = 5

function createRound(ageGroup, round) {
    const seed = (round * 17 + ageGroup.length * 13) % 9
    let left
    let right
    let operator

    if (ageGroup === '5-7') {
        left = 3 + seed
        right = 1 + ((seed * 3) % 6)
        operator = '+'
    } else if (ageGroup === '11-13') {
        left = 4 + seed
        right = 2 + ((seed * 5) % 8)
        operator = round % 2 === 0 ? '×' : '−'
    } else {
        left = 8 + seed
        right = 2 + ((seed * 4) % 8)
        operator = round % 2 === 0 ? '+' : '−'
    }

    if (operator === '−' && right > left) [left, right] = [right, left]
    const answer = operator === '+' ? left + right : operator === '−' ? left - right : left * right
    const offsets = [-3, -1, 2, 4]
    const answers = [...new Set([answer, ...offsets.map(offset => Math.max(0, answer + offset))])]
    while (answers.length < 4) answers.push(answer + answers.length + 3)
    const order = [0, 1, 2, 3].sort((a, b) => ((round + a * 7) % 5) - ((round + b * 7) % 5))

    return {
        prompt: `${left} ${operator} ${right}`,
        answer,
        choices: order.map(index => answers[index]),
    }
}

export default function MathBattleArena({ ageGroup = '8-10', onComplete }) {
    const motion = useMotionSettings()
    const [roundIndex, setRoundIndex] = useState(0)
    const [score, setScore] = useState(0)
    const [feedback, setFeedback] = useState('Pick the answer that powers your hero attack.')
    const [answered, setAnswered] = useState(false)
    const [finished, setFinished] = useState(false)

    const round = useMemo(() => createRound(ageGroup, roundIndex), [ageGroup, roundIndex])
    const heroPower = Math.min(100, (score / QUESTION_COUNT) * 100)

    const chooseAnswer = (choice) => {
        if (answered || finished) return
        setAnswered(true)
        const correct = choice === round.answer
        if (correct) {
            const nextScore = score + 1
            setScore(nextScore)
            setFeedback('Great job! Your hero lands a powerful hit!')
            window.setTimeout(() => {
                if (roundIndex + 1 >= QUESTION_COUNT) {
                    setFinished(true)
                    setFeedback(`Victory! You solved ${nextScore} of ${QUESTION_COUNT} challenges.`)
                } else {
                    setRoundIndex(value => value + 1)
                    setAnswered(false)
                    setFeedback('New challenge! Choose the best answer.')
                }
            }, motion.reduceEffects ? 250 : 850)
        } else {
            setFeedback('Almost! Try another answer. A good strategy is to count carefully.')
            window.setTimeout(() => setAnswered(false), 500)
        }
    }

    const reset = () => {
        setRoundIndex(0)
        setScore(0)
        setFeedback('Pick the answer that powers your hero attack.')
        setAnswered(false)
        setFinished(false)
    }

    return (
        <main style={{
            maxWidth: '620px', margin: '0 auto', padding: '20px', textAlign: 'center',
            color: '#f8fafc', fontFamily: "'Rajdhani', sans-serif",
        }} aria-live="polite">
            <div style={{ fontFamily: "'Orbitron', sans-serif", color: '#fbbf24', fontSize: '12px', letterSpacing: '1.5px' }}>
                ⚔️ MATH BATTLE ARENA
            </div>
            <h1 style={{ fontSize: 'clamp(24px, 5vw, 36px)', margin: '10px 0 4px', color: '#fff' }}>
                Power your hero with math!
            </h1>
            <p style={{ margin: '0 0 20px', color: '#cbd5e1', fontSize: '16px' }}>
                Answer {QUESTION_COUNT} short challenges. There is no timer.
            </p>

            <section style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(251,191,36,0.45)', borderRadius: '18px', padding: '20px', boxShadow: '0 12px 35px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: '#cbd5e1', fontWeight: 700 }}>
                    <span>Challenge {Math.min(roundIndex + 1, QUESTION_COUNT)} of {QUESTION_COUNT}</span>
                    <span>⭐ {score} correct</span>
                </div>
                <div style={{ margin: '16px 0 10px', height: '14px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(255,255,255,0.12)' }}>
                    <div style={{ height: '100%', width: `${heroPower}%`, background: 'linear-gradient(90deg, #f59e0b, #ef4444)', transition: motion.reduceEffects ? 'none' : 'width 0.45s ease' }} />
                </div>
                <div style={{ fontSize: '13px', color: '#fbbf24', marginBottom: '22px' }}>HERO POWER</div>

                {!finished ? (
                    <>
                        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(34px, 10vw, 58px)', color: '#fff', margin: '12px 0 24px' }}>
                            {round.prompt} = ?
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                            {round.choices.map((choice) => (
                                <button key={choice} type="button" disabled={answered} onClick={() => chooseAnswer(choice)} style={{
                                    minHeight: '74px', border: '2px solid rgba(96,165,250,0.55)', borderRadius: '14px',
                                    background: 'linear-gradient(135deg, rgba(37,99,235,0.8), rgba(124,58,237,0.85))',
                                    color: '#fff', fontFamily: "'Orbitron', sans-serif", fontSize: '24px', fontWeight: 800, cursor: answered ? 'wait' : 'pointer',
                                }}>
                                    {choice}
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <div style={{ padding: '18px 0 4px' }}>
                        <div style={{ fontSize: '54px' }}>🏆</div>
                        <h2 style={{ color: '#fde68a', fontSize: '28px', margin: '8px 0' }}>Arena complete!</h2>
                        <p style={{ fontSize: '18px', color: '#e2e8f0' }}>You earned {score * 10} hero power points.</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '18px' }}>
                            <button type="button" onClick={reset} style={{ padding: '13px 18px', border: '1px solid #60a5fa', borderRadius: '10px', background: 'transparent', color: '#dbeafe', fontWeight: 800, cursor: 'pointer' }}>Play again</button>
                            <button type="button" onClick={onComplete} style={{ padding: '13px 18px', border: 'none', borderRadius: '10px', background: '#22c55e', color: '#062b12', fontWeight: 900, cursor: 'pointer' }}>Back to map</button>
                        </div>
                    </div>
                )}
                <p style={{ minHeight: '28px', margin: '18px 0 0', color: feedback.includes('Almost') ? '#fde68a' : '#bbf7d0', fontSize: '16px', fontWeight: 700 }}>{feedback}</p>
            </section>
        </main>
    )
}
