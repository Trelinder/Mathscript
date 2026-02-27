import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { normalizeMathInput, plainMathToLatex } from '../utils/mathExpression'

export default function AccessibleMath({
  expression = '',
  latex = '',
  displayMode = false,
  ariaLabel = 'Rendered math expression',
  style = {},
}) {
  const normalizedExpression = normalizeMathInput(expression)
  const sourceLatex = latex || plainMathToLatex(normalizedExpression)

  const rendered = useMemo(() => {
    if (!sourceLatex) return ''
    try {
      return katex.renderToString(sourceLatex, {
        throwOnError: false,
        strict: 'ignore',
        output: 'htmlAndMathml',
        displayMode,
      })
    } catch {
      return ''
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
