import { useState } from 'react'
import { checkAnswer, generateProblem } from '../utils/MathEngine'

const THEMES = ['Cookies', 'Shopping', 'Gardening', 'Cooking']

function analogy(problem, theme) {
    const [first, operator, second] = problem.problem.split(' ')
    const item = { Cookies: 'cookies', Shopping: 'items in a basket', Gardening: 'flowers', Cooking: 'spoonfuls' }[theme]
    if (operator === '+') return `Imagine ${first} ${item} and then ${second} more. We put the two friendly groups together.`
    return `Imagine ${first} ${item}. If we use ${second}, we count what is still left.`
}

export default function LearnTogether({ onBack, onStartAdventure }) {
    const [problem, setProblem] = useState(() => generateProblem(1))
    const [theme, setTheme] = useState('Cookies')
    const [answer, setAnswer] = useState('')
    const [message, setMessage] = useState('Let’s solve one small step together.')
    const next = () => { setProblem(generateProblem(1)); setAnswer(''); setMessage('Let’s solve one small step together.') }
    const submit = () => setMessage(checkAnswer(answer, problem) ? `Wonderful! ${problem.solutionDisplay} is right. You did it together!` : `Almost there. ${problem.hint}. Take your time and try again.`)
    return <main style={{ minHeight: '100vh', padding: '24px', background: 'linear-gradient(180deg,#f8fbff,#e7f3ff)', color: '#172554', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: '#1d4ed8', fontSize: 17, padding: '12px 0', cursor: 'pointer' }}>← Home</button>
            <section style={{ background: '#fff', borderRadius: 24, padding: 'clamp(24px,6vw,48px)', boxShadow: '0 12px 35px rgba(30,64,175,.12)', textAlign: 'center' }}>
                <div style={{ fontSize: 48 }}>🤝</div><h1 style={{ fontSize: 'clamp(30px,6vw,46px)', margin: '12px 0' }}>Learn Together</h1>
                <p style={{ fontSize: 20, lineHeight: 1.55, color: '#334155' }}>A calm, one-step-at-a-time way to understand math.</p>
                <p style={{ fontSize: 16, fontWeight: 700 }}>Choose an example you like:</p>
                <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>{THEMES.map(item => <button key={item} onClick={() => setTheme(item)} style={{ padding: '12px 16px', borderRadius: 20, cursor: 'pointer', border: `2px solid ${theme === item ? '#2563eb' : '#cbd5e1'}`, background: theme === item ? '#dbeafe' : '#fff', fontSize: 16 }}>{item}</button>)}</div>
                <div style={{ margin: '28px 0', padding: 24, background: '#eff6ff', borderRadius: 18 }}><div style={{ fontSize: 16, color: '#475569' }}>Our little math question</div><div style={{ fontSize: 42, fontWeight: 800, margin: '10px 0' }}>{problem.problem} = ?</div><p style={{ fontSize: 18, lineHeight: 1.55 }}>{analogy(problem, theme)}</p></div>
                <label style={{ display: 'block', fontSize: 18, fontWeight: 700, textAlign: 'left' }}>Your answer</label><div style={{ display: 'flex', gap: 10, marginTop: 8 }}><input value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} inputMode="decimal" style={{ flex: 1, fontSize: 24, padding: 14, borderRadius: 12, border: '2px solid #93c5fd' }} /><button onClick={submit} style={{ minHeight: 56, padding: '12px 18px', background: '#2563eb', color: '#fff', border: 0, borderRadius: 12, fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>Check together</button></div>
                <p aria-live="polite" style={{ fontSize: 18, lineHeight: 1.5, minHeight: 54, marginTop: 18 }}>{message}</p><button onClick={next} style={{ minHeight: 52, padding: '12px 22px', borderRadius: 12, border: '2px solid #2563eb', background: '#fff', color: '#1d4ed8', fontSize: 17, fontWeight: 800, cursor: 'pointer' }}>Try another one</button>
            </section><button onClick={onStartAdventure} style={{ width: '100%', marginTop: 20, minHeight: 54, border: 'none', borderRadius: 12, background: '#172554', color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer' }}>Ready to play? Start the Math Adventure</button>
        </div>
    </main>
}