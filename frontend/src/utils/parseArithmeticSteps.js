/**
 * parseArithmeticSteps.js
 *
 * Parses a simple arithmetic expression string and produces the ordered list
 * of binary-operation steps that reduce the expression to its final value.
 * Operator precedence is respected (× / before + −).
 *
 * Supported input forms
 * ─────────────────────
 *   • ASCII operators:    5 * 6 * 6   |  3 + 4 - 1   |  20 / 4   |  2 ^ 3
 *   • Unicode operators:  5 × 6       |  10 ÷ 2       |  10 − 3
 *   • Alternate ×:        5 x 6       |  5 X 6   (bare 'x' or 'X' treated as ×)
 *   • Leading unary −:    -5 + 3
 *   • Parentheses:        (2 + 3) * 4
 *
 * Returns an empty array when:
 *   • the input is not a parsable arithmetic expression (algebra, fractions,
 *     or expressions containing letters other than a lone 'x'/'X' operator)
 *   • only a single literal number is present (no operations to show)
 *
 * Return type
 * ─────────────
 *   Step[]  where Step = { stepNum: number, left: number, op: string, right: number, result: number }
 *
 *   op is always a display symbol:  '+' | '−' | '×' | '÷' | '^'
 */

// ── Normalisation helpers ────────────────────────────────────────────────────

const DISPLAY_OP = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^' }

/**
 * Normalise operator characters to plain ASCII so the tokeniser only needs
 * to deal with a single representation of each operator.
 *
 * @param {string} raw
 * @returns {string}
 */
function normalise(raw) {
  return raw
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\u2212/g, '-') // unicode MINUS SIGN
    // Lone 'x' / 'X' surrounded by digits / spaces / parens counts as multiplication.
    // We must NOT replace letters that are part of identifiers (algebra like "x + 5").
    .replace(/(?<=[\d)\s])[xX](?=[\d(\s])/g, '*')
    .trim()
}

// ── Tokeniser ────────────────────────────────────────────────────────────────

const TOK_NUM = 'num'
const TOK_OP  = 'op'
const TOK_LP  = 'lp'
const TOK_RP  = 'rp'

/**
 * @typedef {{ type: string, value: string|number }} Token
 */

/**
 * Split the normalised expression string into tokens.
 * Throws when an unrecognised character (e.g. a letter in an algebra context)
 * is encountered.
 *
 * @param {string} expr  normalised expression
 * @returns {Token[]}
 */
function tokenise(expr) {
  const tokens = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]
    if (/\s/.test(ch)) { i++; continue }

    if (/\d/.test(ch) || (ch === '.' && i + 1 < expr.length && /\d/.test(expr[i + 1]))) {
      let num = ''
      while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === '.')) {
        num += expr[i++]
      }
      tokens.push({ type: TOK_NUM, value: parseFloat(num) })
      continue
    }

    if ('+-*/^'.includes(ch)) {
      tokens.push({ type: TOK_OP, value: ch })
      i++
      continue
    }

    if (ch === '(') { tokens.push({ type: TOK_LP, value: '(' }); i++; continue }
    if (ch === ')') { tokens.push({ type: TOK_RP, value: ')' }); i++; continue }

    // Anything else (letters, = signs, arrow, …) → bail out to caller
    throw new Error(`Unrecognised character: ${ch}`)
  }
  return tokens
}

// ── Recursive-descent parser → AST ──────────────────────────────────────────

/**
 * @typedef {{ type: 'num', value: number }
 *           |{ type: 'unary', op: string, inner: ASTNode }
 *           |{ type: 'bin', op: string, left: ASTNode, right: ASTNode }} ASTNode
 */

class Parser {
  /** @param {Token[]} tokens */
  constructor(tokens) {
    this.tokens = tokens
    this.pos = 0
  }

  peek() { return this.tokens[this.pos] }
  consume() { return this.tokens[this.pos++] }

  /** Addition and subtraction (lowest precedence after exponentiation) */
  parseExpr() {
    let left = this.parseTerm()
    while (this.peek() && this.peek().type === TOK_OP &&
           (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value
      const right = this.parseTerm()
      left = { type: 'bin', op, left, right }
    }
    return left
  }

  /** Multiplication and division */
  parseTerm() {
    let left = this.parsePower()
    while (this.peek() && this.peek().type === TOK_OP &&
           (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.consume().value
      const right = this.parsePower()
      left = { type: 'bin', op, left, right }
    }
    return left
  }

  /** Exponentiation (right-associative) */
  parsePower() {
    const base = this.parsePrimary()
    if (this.peek() && this.peek().type === TOK_OP && this.peek().value === '^') {
      this.consume()
      const exp = this.parsePower() // right-associative
      return { type: 'bin', op: '^', left: base, right: exp }
    }
    return base
  }

  /** Numbers, parenthesised sub-expressions, leading unary minus */
  parsePrimary() {
    const tok = this.peek()
    if (!tok) throw new Error('Unexpected end of expression')

    if (tok.type === TOK_NUM) {
      this.consume()
      return { type: 'num', value: tok.value }
    }

    if (tok.type === TOK_LP) {
      this.consume()
      const expr = this.parseExpr()
      if (!this.peek() || this.peek().type !== TOK_RP) throw new Error('Missing closing parenthesis')
      this.consume()
      return expr
    }

    // Unary minus/plus
    if (tok.type === TOK_OP && (tok.value === '-' || tok.value === '+')) {
      this.consume()
      const inner = this.parsePrimary()
      if (tok.value === '-') return { type: 'unary', op: '-', inner }
      return inner
    }

    throw new Error(`Unexpected token: ${tok.value}`)
  }
}

// ── AST evaluator with step collection ──────────────────────────────────────

/**
 * Recursively evaluate the AST, pushing each binary operation to `rawSteps`.
 * Returns the numeric value of the sub-expression.
 *
 * @param {ASTNode} node
 * @param {{ left: number, op: string, right: number, result: number }[]} rawSteps
 * @returns {number}
 */
function evalAST(node, rawSteps) {
  if (node.type === 'num') return node.value

  if (node.type === 'unary') {
    const v = evalAST(node.inner, rawSteps)
    return node.op === '-' ? -v : v
  }

  // node.type === 'bin'
  const left  = evalAST(node.left,  rawSteps)
  const right = evalAST(node.right, rawSteps)

  let result
  switch (node.op) {
    case '+': result = left + right; break
    case '-': result = left - right; break
    case '*': result = left * right; break
    case '/': result = left / right; break
    case '^': result = Math.pow(left, right); break
    default:  result = NaN
  }

  rawSteps.push({ left, op: node.op, right, result })
  return result
}

// ── Number display helper ────────────────────────────────────────────────────

/**
 * Format a number for display: whole numbers as integers, fractions with up
 * to 4 significant decimal places (no trailing zeros).
 *
 * @param {number} n
 * @returns {string}
 */
function fmt(n) {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n)) return String(n)
  // Round to 4 dp to avoid floating-point noise, then strip trailing zeros
  return parseFloat(n.toFixed(4)).toString()
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse an arithmetic expression and return the sequence of binary-operation
 * steps in evaluation order (deepest sub-expression first, respecting
 * operator precedence).
 *
 * @param {string|null|undefined} expr  - raw user-typed math string
 * @returns {Step[]}
 *
 * @typedef {{ stepNum: number, left: number, op: string, right: number, result: number, label: string }} Step
 */
export function parseArithmeticSteps(expr) {
  if (!expr || typeof expr !== 'string') return []

  // Strip trailing "= answer" or "holds true" suffixes the narrative may append
  const stripped = expr
    .replace(/=\s*[\d.,]+\s*(holds\s+true)?$/i, '')
    .replace(/→.*$/i, '')   // algebra arrow, e.g. "x + 5 = 10 → x = ?"
    .replace(/\?\s*$/g, '') // trailing question mark
    .trim()

  if (!stripped) return []

  const norm = normalise(stripped)

  // Reject expressions that contain any letters after normalisation —
  // valid 'x'/'X' multiplication operators are already converted to '*' by
  // normalise(), so any remaining letter indicates algebra or unsupported syntax.
  if (/[a-zA-Z]/.test(norm)) return []

  let tokens
  try {
    tokens = tokenise(norm)
  } catch {
    return []
  }

  // A single literal number has no operations — nothing to break down.
  if (tokens.length <= 1) return []

  let ast
  try {
    const parser = new Parser(tokens)
    ast = parser.parseExpr()
    // Ensure we consumed the whole token stream
    if (parser.pos < parser.tokens.length) return []
  } catch {
    return []
  }

  const rawSteps = []
  try {
    evalAST(ast, rawSteps)
  } catch {
    return []
  }

  if (rawSteps.length === 0) return []

  return rawSteps.map((s, i) => {
    const dispOp = DISPLAY_OP[s.op] ?? s.op
    const label  = `${fmt(s.left)} ${dispOp} ${fmt(s.right)} = ${fmt(s.result)}`
    return {
      stepNum: i + 1,
      left:    s.left,
      op:      dispOp,
      right:   s.right,
      result:  s.result,
      label,
    }
  })
}
