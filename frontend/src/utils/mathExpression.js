export function normalizeMathInput(rawValue) {
  if (rawValue == null) return ''
  return String(rawValue)
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[×✕]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function replaceFractions(latex) {
  let previous = latex
  let next = latex
  const fracPattern = /\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g
  do {
    previous = next
    next = next.replace(fracPattern, '($1)/($2)')
  } while (next !== previous)
  return next
}

export function latexToPlainMath(rawLatex) {
  if (!rawLatex) return ''
  let text = String(rawLatex).trim()
  text = text.replace(/^\$+|\$+$/g, '')
  text = replaceFractions(text)
  text = text.replace(/\\left|\\right/g, '')
  text = text.replace(/\\times|\\cdot/g, '*')
  text = text.replace(/\\div/g, '/')
  text = text.replace(/\\pm/g, '+/-')
  text = text.replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)')
  text = text.replace(/\\(?:mathrm|text)\{([^{}]+)\}/g, '$1')
  text = text.replace(/\^\{([^{}]+)\}/g, '^($1)')
  text = text.replace(/_\{([^{}]+)\}/g, '_($1)')
  text = text.replace(/\\([a-zA-Z]+)/g, '$1')
  text = text.replace(/[{}]/g, '')
  return normalizeMathInput(text)
}

export function plainMathToLatex(rawExpression) {
  const expression = normalizeMathInput(rawExpression)
  if (!expression) return ''
  if (expression.includes('\\')) return expression
  return expression
    .replace(/<=/g, '\\le ')
    .replace(/>=/g, '\\ge ')
    .replace(/!=/g, '\\ne ')
    .replace(/(\d)\s*x\s*(\d)/gi, '$1\\times $2')
    .replace(/\*/g, '\\times ')
    .replace(/sqrt\s*\(([^()]+)\)/gi, '\\sqrt{$1}')
}

export function hasBalancedDelimiters(rawExpression) {
  const expression = normalizeMathInput(rawExpression)
  const stack = []
  const closeForOpen = { '(': ')', '[': ']', '{': '}' }
  for (const char of expression) {
    if (closeForOpen[char]) {
      stack.push(closeForOpen[char])
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      const expected = stack.pop()
      if (char !== expected) return false
    }
  }
  return stack.length === 0
}

function isLikelyMath(rawExpression) {
  return /[0-9=+\-*/^()[\]{}\\]/.test(rawExpression || '')
}

export function getMathInputHint(rawExpression) {
  const expression = normalizeMathInput(rawExpression)
  if (!expression || !isLikelyMath(expression)) return ''
  if (!hasBalancedDelimiters(expression)) {
    return "It looks like there's a missing parenthesis. Try closing each opening bracket."
  }
  if (/[+\-*/^]$/.test(expression)) {
    return 'This ends with an operator. Add the next number or term to complete it.'
  }
  if (/(^|[^a-z])([+\-*/^])\s*([+\-*/^])(?![a-z])/i.test(expression)) {
    return 'I noticed two operators together. Removing one should fix it.'
  }
  if (/\/\s*0(?:\D|$)/.test(expression)) {
    return 'Division by zero is undefined. Try a non-zero denominator.'
  }
  return ''
}

export function deriveSimpleMathModel(rawExpression) {
  const expression = normalizeMathInput(rawExpression).replace(/[xX]/g, '*')
  if (!expression) return null
  const match = expression.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return null

  const left = Number(match[1])
  const operator = match[2]
  const right = Number(match[3])
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null
  if (operator === '/' && right === 0) return null

  const result = operator === '+'
    ? left + right
    : operator === '-'
      ? left - right
      : operator === '*'
        ? left * right
        : left / right

  if (!Number.isFinite(result)) return null
  return { left, right, operator, result: Number(result.toFixed(6)) }
}

export function toFriendlyMathError(rawMessage, expression = '') {
  const message = String(rawMessage || '').toLowerCase()
  const hint = getMathInputHint(expression)
  if (hint) return hint

  if (message.includes('daily limit')) {
    return 'You solved many problems today. You can continue tomorrow or unlock unlimited quests with Premium.'
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'That took a little longer than expected. Try a shorter expression or tap retry.'
  }
  if (message.includes('invalid') || message.includes('syntax') || message.includes('parse')) {
    return "I couldn't read part of that expression yet. Try checking symbols and spacing."
  }
  if (message.includes('network') || message.includes('failed to fetch')) {
    return 'Connection looks unstable. Please check internet and try again.'
  }
  return 'Almost there. Please try that expression one more time, and I will help with the next step.'
}
