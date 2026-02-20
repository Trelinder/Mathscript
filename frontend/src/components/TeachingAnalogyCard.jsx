export default function TeachingAnalogyCard({ data }) {
  if (!data) return null

  const whyPoints = Array.isArray(data.why_this_works) ? data.why_this_works.filter(Boolean) : []
  const alt = Array.isArray(data.alternate_analogies) ? data.alternate_analogies.filter(Boolean) : []
  const exampleSteps = Array.isArray(data.example_steps) ? data.example_steps.filter(Boolean) : []

  return (
    <div style={{
      marginBottom: '14px',
      borderRadius: '12px',
      border: '1px solid rgba(16,185,129,0.26)',
      background: 'linear-gradient(180deg, rgba(16,185,129,0.12), rgba(15,23,42,0.45))',
      padding: '14px 14px 12px',
    }}>
      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        color: '#6ee7b7',
        fontSize: '12px',
        letterSpacing: '1.1px',
        fontWeight: 700,
        marginBottom: '8px',
        textTransform: 'uppercase',
      }}>
        Why This Works
      </div>

      <div style={{
        fontFamily: "'Rajdhani', sans-serif",
        color: '#f8fafc',
        fontWeight: 700,
        fontSize: '17px',
        marginBottom: '4px',
      }}>
        {data.title || 'Math Analogy Coach'}
      </div>

      {data.age_mode && (
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          color: '#a7f3d0',
          fontSize: '12px',
          fontWeight: 700,
          marginBottom: '8px',
        }}>
          Mode: {data.age_mode}
        </div>
      )}

      <div style={{
        fontFamily: "'Rajdhani', sans-serif",
        color: '#e2e8f0',
        fontSize: '16px',
        lineHeight: '1.5',
        fontWeight: 500,
        marginBottom: '10px',
      }}>
        {data.analogy}
      </div>

      {whyPoints.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            color: '#34d399',
            fontSize: '11px',
            letterSpacing: '1px',
            fontWeight: 700,
            marginBottom: '6px',
            textTransform: 'uppercase',
          }}>
            Math Mapping
          </div>
          <ul style={{
            margin: 0,
            paddingLeft: '18px',
            color: '#cbd5e1',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '15px',
            lineHeight: '1.45',
            fontWeight: 600,
            display: 'grid',
            gap: '4px',
          }}>
            {whyPoints.map((point, idx) => (
              <li key={idx}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      {data.where_it_breaks && (
        <div style={{
          marginBottom: '10px',
          border: '1px dashed rgba(148,163,184,0.35)',
          borderRadius: '8px',
          padding: '8px 10px',
          background: 'rgba(15,23,42,0.35)',
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            color: '#fda4af',
            fontSize: '10px',
            letterSpacing: '1px',
            fontWeight: 700,
            marginBottom: '4px',
            textTransform: 'uppercase',
          }}>
            Where the analogy breaks
          </div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            color: '#e2e8f0',
            fontSize: '14px',
            fontWeight: 600,
            lineHeight: '1.45',
          }}>
            {data.where_it_breaks}
          </div>
        </div>
      )}

      {exampleSteps.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            color: '#22d3ee',
            fontSize: '10px',
            letterSpacing: '1px',
            fontWeight: 700,
            marginBottom: '4px',
            textTransform: 'uppercase',
          }}>
            Step tie-in
          </div>
          <div style={{
            display: 'grid',
            gap: '4px',
          }}>
            {exampleSteps.slice(0, 3).map((step, idx) => (
              <div
                key={idx}
                style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  color: '#dbeafe',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: 'rgba(30,41,59,0.45)',
                  borderRadius: '6px',
                  border: '1px solid rgba(56,189,248,0.2)',
                  padding: '6px 8px',
                }}
              >
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.check_question && (
        <div style={{
          borderRadius: '8px',
          border: '1px solid rgba(34,211,238,0.3)',
          background: 'rgba(34,211,238,0.08)',
          padding: '8px 10px',
          marginBottom: alt.length ? '8px' : 0,
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            color: '#67e8f9',
            fontSize: '10px',
            letterSpacing: '1px',
            fontWeight: 700,
            marginBottom: '4px',
            textTransform: 'uppercase',
          }}>
            Check question
          </div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            color: '#e0f2fe',
            fontSize: '15px',
            fontWeight: 700,
          }}>
            {data.check_question}
          </div>
        </div>
      )}

      {alt.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            color: '#fbbf24',
            fontSize: '10px',
            letterSpacing: '1px',
            fontWeight: 700,
            marginBottom: '4px',
            textTransform: 'uppercase',
          }}>
            Try a different analogy
          </div>
          <div style={{
            display: 'grid',
            gap: '4px',
          }}>
            {alt.slice(0, 3).map((item, idx) => (
              <div
                key={idx}
                style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  color: '#fde68a',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.24)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
