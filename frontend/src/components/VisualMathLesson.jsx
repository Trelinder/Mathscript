import { useEffect, useState } from 'react'

const IMAGE_LIBRARY = {
  fruit: {
    src: 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&w=640&q=80',
    alt: 'Fresh apples',
    emoji: '🍎',
    label: 'apples',
  },
  snack: {
    src: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=640&q=80',
    alt: 'Colorful candy',
    emoji: '🍬',
    label: 'snacks',
  },
  coffee: {
    src: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=640&q=80',
    alt: 'Coffee cups on a table',
    emoji: '☕',
    label: 'coffee cups',
  },
  grocery: {
    src: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=640&q=80',
    alt: 'Grocery store shelves',
    emoji: '🛒',
    label: 'grocery items',
  },
}

function parseEquation(equation) {
  const match = String(equation || '').replace(/−/g, '-').match(/^\s*(\d+(?:\.\d+)?)\s*([+\-×*/÷])\s*(\d+(?:\.\d+)?)\s*$/)
  if (!match) return null
  const left = Number(match[1])
  const right = Number(match[3])
  const operator = match[2] === '*' ? '×' : match[2] === '/' ? '÷' : match[2]
  if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < 0 || left > 20 || right > 20) return null
  const answer = operator === '+' ? left + right
    : operator === '-' ? left - right
      : operator === '×' ? left * right
        : right === 0 ? null : left / right
  if (!Number.isInteger(answer) || answer < 0 || answer > 30) return null
  return { left, operator, right, answer }
}

function ObjectRow({ count, item, tone }) {
  return (
    <div style={{
      minHeight: '58px',
      padding: '7px 9px',
      borderRadius: '8px',
      background: tone,
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '4px',
    }}>
      {Array.from({ length: count }, (_, index) => <span key={index} style={{ fontSize: '25px', lineHeight: 1 }}>{item.emoji}</span>)}
    </div>
  )
}

function TallyRow({ count, color }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', minHeight: '34px' }}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} style={{ width: '12px', height: '26px', borderRadius: '2px', background: color, display: 'inline-block' }} />
      ))}
    </div>
  )
}

function GroupGrid({ groups, perGroup, item, tone }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(76px, 1fr))', gap: '7px' }}>
      {Array.from({ length: groups }, (_, index) => (
        <div key={index} style={{ padding: '6px', borderRadius: '7px', background: tone, border: '1px solid rgba(226,232,240,0.14)', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", color: '#cbd5e1', fontSize: '12px', fontWeight: 700 }}>Group {index + 1}</div>
          <div style={{ fontSize: '23px', lineHeight: 1.35 }}>{item.emoji.repeat(perGroup)}</div>
        </div>
      ))}
    </div>
  )
}

export default function VisualMathLesson({ equation, ageGroup }) {
  const model = parseEquation(equation)
  const [stage, setStage] = useState('concrete')
  const [audience, setAudience] = useState(ageGroup === '11-13' ? 'adult' : 'child')
  const [imageVisible, setImageVisible] = useState(true)

  useEffect(() => {
    setAudience(ageGroup === '11-13' ? 'adult' : 'child')
    setStage('concrete')
    setImageVisible(true)
  }, [equation, ageGroup])

  if (!model) return null

  const isAdult = audience === 'adult'
  const item = isAdult
    ? (model.operator === '+' || model.operator === '×' ? IMAGE_LIBRARY.coffee : IMAGE_LIBRARY.grocery)
    : (model.operator === '+' || model.operator === '×' ? IMAGE_LIBRARY.fruit : IMAGE_LIBRARY.snack)
  const noun = item.label
  const action = model.operator === '+' ? 'put together' : model.operator === '-' ? 'take away' : model.operator === '×' ? 'make equal groups of' : 'share equally into'
  const stages = [
    { id: 'concrete', label: '1 Objects' },
    { id: 'representational', label: '2 Model' },
    { id: 'abstract', label: '3 Numbers' },
  ]

  return (
    <section aria-label="Visual math lesson" style={{
      marginBottom: '14px',
      border: '1px solid rgba(45, 212, 191, 0.35)',
      background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.16), rgba(15, 23, 42, 0.82))',
      borderRadius: '10px',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(94, 234, 212, 0.18)' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '11px', letterSpacing: '1px', fontWeight: 800, color: '#5eead4', textTransform: 'uppercase' }}>See the math</div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '18px', color: '#f8fafc', fontWeight: 800 }}>Objects, model, then symbols</div>
          </div>
          <div aria-label="Choose example type" style={{ display: 'flex', border: '1px solid rgba(226,232,240,0.22)', borderRadius: '7px', overflow: 'hidden' }}>
            <button onClick={() => setAudience('child')} aria-pressed={!isAdult} style={audienceButtonStyle(!isAdult)}>Child</button>
            <button onClick={() => setAudience('adult')} aria-pressed={isAdult} style={audienceButtonStyle(isAdult)}>Everyday</button>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 14px 14px' }}>
        <div role="tablist" aria-label="Lesson stage" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '5px', marginBottom: '12px' }}>
          {stages.map((itemStage) => (
            <button key={itemStage.id} role="tab" aria-selected={stage === itemStage.id} onClick={() => setStage(itemStage.id)} style={{
              minHeight: '36px', borderRadius: '6px', border: `1px solid ${stage === itemStage.id ? '#5eead4' : 'rgba(148,163,184,0.28)'}`,
              background: stage === itemStage.id ? 'rgba(45,212,191,0.18)' : 'rgba(15,23,42,0.28)', color: stage === itemStage.id ? '#ccfbf1' : '#cbd5e1',
              cursor: 'pointer', fontFamily: "'Rajdhani', sans-serif", fontWeight: 800, fontSize: '14px',
            }}>{itemStage.label}</button>
          ))}
        </div>

        {stage === 'concrete' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 118px', gap: '12px', alignItems: 'stretch' }}>
            <div>
              <div style={lessonTextStyle}>
                {model.operator === '×'
                  ? `Make ${model.left} equal groups with ${model.right} ${noun} in each group.`
                  : model.operator === '÷'
                    ? `Share ${model.left} ${noun} equally among ${model.right} groups.`
                    : `Start with things you can picture: ${model.left} ${noun}, then ${action} ${model.right}.`}
              </div>
              <div style={{ marginTop: '9px' }}>
                {model.operator === '×' ? <GroupGrid groups={model.left} perGroup={model.right} item={item} tone="rgba(20,184,166,0.12)" />
                  : model.operator === '÷' ? <GroupGrid groups={model.right} perGroup={model.answer} item={item} tone="rgba(56,189,248,0.12)" />
                    : <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <ObjectRow count={model.left} item={item} tone="rgba(20,184,166,0.12)" />
                      <span style={operatorStyle}>{model.operator}</span>
                      <ObjectRow count={model.right} item={item} tone="rgba(56,189,248,0.12)" />
                    </div>}
              </div>
            </div>
            {imageVisible && <img src={item.src} alt={item.alt} onError={() => setImageVisible(false)} style={{ width: '118px', height: '118px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(226,232,240,0.22)' }} />}
          </div>
        )}

        {stage === 'representational' && (
          <div>
            <div style={lessonTextStyle}>
              {model.operator === '×' ? 'Each row has the same number of units. Count every row to find the total.'
                : model.operator === '÷' ? 'Each row is one fair share. The units in one row give the answer.'
                  : `Now use a simple count model. Each bar stands for one ${isAdult ? 'unit' : noun.slice(0, -1)}.`}
            </div>
            <div style={{ display: 'grid', gap: '8px', marginTop: '10px', padding: '10px', borderRadius: '8px', background: 'rgba(15,23,42,0.38)' }}>
              {(model.operator === '×' || model.operator === '÷') ? Array.from({ length: model.operator === '×' ? model.left : model.right }, (_, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '9px' }}><span style={countBadgeStyle}>{index + 1}</span><TallyRow count={model.operator === '×' ? model.right : model.answer} color={index % 2 ? '#38bdf8' : '#2dd4bf'} /></div>
              )) : <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}><span style={countBadgeStyle}>{model.left}</span><TallyRow count={model.left} color="#2dd4bf" /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}><span style={operatorStyle}>{model.operator}</span><TallyRow count={model.right} color="#38bdf8" /></div>
              </>}
              <div style={{ height: '1px', background: 'rgba(226,232,240,0.25)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}><span style={countBadgeStyle}>{model.answer}</span><span style={{ fontFamily: "'Rajdhani', sans-serif", color: '#fef3c7', fontWeight: 800, fontSize: '16px' }}>{model.operator === '÷' ? 'in each group' : 'in all'}</span></div>
            </div>
          </div>
        )}

        {stage === 'abstract' && (
          <div style={{ textAlign: 'center', padding: '8px 0 2px' }}>
            <div style={lessonTextStyle}>The symbols are a compact way to record the story you just saw.</div>
            <div style={{ margin: '13px 0 7px', fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(24px, 7vw, 36px)', fontWeight: 800, color: '#fef3c7', letterSpacing: '1px' }}>{model.left} {model.operator} {model.right} = {model.answer}</div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", color: '#99f6e4', fontSize: '16px', fontWeight: 700 }}>The answer names the total we can count in the model.</div>
          </div>
        )}
      </div>
    </section>
  )
}

const lessonTextStyle = {
  fontFamily: "'Rajdhani', sans-serif",
  color: '#e2e8f0',
  fontSize: '16px',
  lineHeight: 1.35,
  fontWeight: 650,
}

const operatorStyle = {
  flex: '0 0 auto',
  color: '#fbbf24',
  fontFamily: "'Orbitron', sans-serif",
  fontSize: '22px',
  fontWeight: 800,
}

const countBadgeStyle = {
  minWidth: '28px',
  color: '#f8fafc',
  fontFamily: "'Orbitron', sans-serif",
  fontSize: '15px',
  fontWeight: 800,
}

function audienceButtonStyle(active) {
  return {
    minHeight: '32px',
    padding: '5px 9px',
    border: 0,
    borderRight: active ? 0 : '1px solid rgba(226,232,240,0.16)',
    background: active ? '#14b8a6' : 'rgba(15,23,42,0.35)',
    color: active ? '#042f2e' : '#cbd5e1',
    cursor: 'pointer',
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: '13px',
    fontWeight: 800,
  }
}