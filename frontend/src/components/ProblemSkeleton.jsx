/**
 * ProblemSkeleton — animated loading placeholder shown while a math problem
 * or quest result is being generated.
 */
export default function ProblemSkeleton() {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      padding: '24px 20px',
      animation: 'skeletonPulse 1.4s ease-in-out infinite',
    }}>
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        .sk-line {
          background: rgba(255,255,255,0.08);
          border-radius: 6px;
          margin-bottom: 10px;
        }
      `}</style>
      <div className="sk-line" style={{ height: '20px', width: '60%' }} />
      <div className="sk-line" style={{ height: '16px', width: '85%' }} />
      <div className="sk-line" style={{ height: '16px', width: '70%' }} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <div className="sk-line" style={{ height: '44px', width: '80px', marginBottom: 0, borderRadius: '10px' }} />
        <div className="sk-line" style={{ height: '44px', width: '80px', marginBottom: 0, borderRadius: '10px' }} />
      </div>
    </div>
  )
}
