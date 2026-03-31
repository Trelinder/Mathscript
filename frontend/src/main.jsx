import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initObservability } from './utils/observability'

initObservability()

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0e1a',
          color: '#e8e8f0',
          fontFamily: 'sans-serif',
          padding: '20px',
          textAlign: 'center',
          gap: '16px',
        }}>
          <div style={{ fontSize: '48px' }}>⚠️</div>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>Something went wrong</div>
          <div style={{ fontSize: '14px', color: '#9ca3af', maxWidth: '340px', lineHeight: 1.5 }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              background: '#7c3aed',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
