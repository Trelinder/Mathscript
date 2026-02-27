import { useEffect, useState } from 'react'
import { normalizeMathInput, plainMathToLatex } from '../utils/mathExpression'

let katexLoader = null

async function loadKatex() {
  if (!katexLoader) {
    katexLoader = Promise.all([
      import('katex/dist/katex.min.css'),
      import('katex'),
    ])
      .then(([, katexModule]) => katexModule.default || katexModule)
      .catch((error) => {
        katexLoader = null
        throw error
      })
  }
  return katexLoader
}

export default function AccessibleMath({
  expression = '',
  latex = '',
  displayMode = false,
  ariaLabel = 'Rendered math expression',
  style = {},
}) {
  const normalizedExpression = normalizeMathInput(expression)
  const sourceLatex = latex || plainMathToLatex(normalizedExpression)
  const [rendered, setRendered] = useState('')

  useEffect(() => {
    let active = true
    if (!sourceLatex) {
      setRendered('')
      return () => {
        active = false
      }
    }

    loadKatex()
      .then((katex) => {
        if (!active) return
        try {
          const html = katex.renderToString(sourceLatex, {
            throwOnError: false,
            strict: 'ignore',
            output: 'htmlAndMathml',
            displayMode,
          })
          setRendered(html)
        } catch {
          setRendered('')
        }
      })
      .catch(() => {
        if (!active) return
        setRendered('')
      })

    return () => {
      active = false
    }
  }, [displayMode, sourceLatex])

  if (!sourceLatex && !normalizedExpression) {
    return (
      <span style={style}>
        -
      </span>
    )
  }

  if (!rendered) {
    return (
      <span style={style}>
        {normalizedExpression || sourceLatex}
      </span>
    )
  }

  return (
    <span
      aria-label={`${ariaLabel}: ${normalizedExpression || sourceLatex}`}
      style={{
        display: displayMode ? 'block' : 'inline-block',
        maxWidth: '100%',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  )
}
