/**
 * parseMathSteps.js
 *
 * Parses an arithmetic expression string using the mathjs library and returns
 * a step-by-step breakdown of each binary operation in evaluation order
 * (deepest sub-expression first, matching operator precedence).
 *
 * Uses math.parse() to generate an AST and node.traverse() to validate the
 * tree (rejecting algebraic expressions that contain variables or functions),
 * then a recursive post-order algorithm to collect each binary operation as a
 * human-readable step.
 *
 * Return type
 * ───────────
 *   Step[]  where Step = {
 *     stepNum: number,
 *     left:    number,
 *     op:      string,   // display symbol: '+' | '−' | '×' | '÷' | '^'
 *     right:   number,
 *     result:  number,
 *     label:   string,   // e.g. "5 × 6 = 30"
 *   }
 *
 * Returns [] when:
 *   • the input is null/undefined/empty
 *   • the expression contains variables or unsupported constructs
 *   • there are no binary operations to show (single number)
 *
 * Usage
 * ─────
 *   import { parseMathSteps } from '../utils/parseMathSteps'
 *   const steps = parseMathSteps('5 × 6 × 6')
 *   // → [ { stepNum:1, left:5, op:'×', right:6, result:30, label:'5 × 6 = 30' },
 *   //     { stepNum:2, left:30, op:'×', right:6, result:180, label:'30 × 6 = 180' } ]
 */

import { parse } from 'mathjs'

// ── Display operator mapping ──────────────────────────────────────────────────

const DISPLAY_OP = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^' }

// ── Number display helper ─────────────────────────────────────────────────────

/**
 * Format a number for display: integers without a decimal point, fractions
 * with up to 4 significant decimal places (no trailing zeros).
 *
 * @param {number} n
 * @returns {string}
 */
function fmt(n) {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n)) return String(n)
  return parseFloat(n.toFixed(4)).toString()
}

// ── Input normalisation ───────────────────────────────────────────────────────

/**
 * Normalise operator characters to ASCII equivalents that mathjs understands,
 * and strip common narrative suffixes (e.g. "= 30 holds true") that would
 * cause the parser to fail.
 *
 * @param {string} raw  - raw input string from the game / quest narrative
 * @returns {string}    - normalised expression ready for math.parse()
 */
function normalise(raw) {
  return raw
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\u2212/g, '-')   // Unicode MINUS SIGN
    // Lone 'x'/'X' between digits/brackets counts as multiplication (e.g. "5 x 6").
    // Named variables like "2n + 3" are intentionally NOT converted here —
    // node.traverse() will catch the SymbolNode and return [] for algebra.
    // Use [ \t] (space + tab only) instead of \s to avoid matching newlines
    // or other control characters that should never appear in arithmetic input.
    .replace(/(?<=[\d) \t])[xX](?=[\d( \t])/g, '*')
    // Strip trailing "= answer" / "holds true" suffixes added by quest narratives
    .replace(/=\s*[\d.,]+\s*(holds\s+true)?$/i, '')
    .replace(/→.*$/i, '')
    .replace(/\?\s*$/g, '')
    .trim()
}

// ── Recursive post-order evaluator ───────────────────────────────────────────

/**
 * Recursively evaluate a mathjs AST node, collecting each binary operation
 * into rawSteps in post-order (deepest sub-expressions evaluated first).
 *
 * @param {object} node     - mathjs MathNode
 * @param {Array}  rawSteps - accumulator; mutated in place
 * @returns {number}        - numeric value of this node
 * @throws {Error}          - if node type is unsupported (caller catches)
 */
function evaluateNode(node, rawSteps) {
  switch (node.type) {
    case 'ConstantNode':
      return Number(node.value)

    case 'ParenthesisNode':
      return evaluateNode(node.content, rawSteps)

    case 'OperatorNode': {
      const args = node.args
      // Unary operator (e.g. negation: -5)
      if (args.length === 1) {
        const v = evaluateNode(args[0], rawSteps)
        return node.op === '-' ? -v : v
      }
      // Binary operator — evaluate children deepest-first (post-order)
      if (args.length === 2) {
        const left  = evaluateNode(args[0], rawSteps)
        const right = evaluateNode(args[1], rawSteps)
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
      break
    }
    default:
      throw new Error(`Unsupported node type: ${node.type}`)
  }
  return NaN
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse an arithmetic expression and return the sequence of binary-operation
 * steps in evaluation order (deepest sub-expression first, PEMDAS-compliant).
 *
 * Internally:
 *  1. Normalises the input string (unicode operators, narrative suffixes).
 *  2. Calls math.parse(expression) to build an AST.
 *  3. Uses node.traverse() to walk the tree and reject any expression that
 *     contains a SymbolNode (variable), FunctionNode, or AssignmentNode —
 *     guarding against algebra or unsupported syntax being passed to the
 *     recursive evaluator.
 *  4. Runs a recursive post-order algorithm over the AST to simplify the
 *     deepest operations first, collecting each step as a { left, op, right,
 *     result } descriptor.
 *  5. Maps the raw step descriptors to the Step[] interface expected by
 *     CalculationBreakdown and other UI consumers.
 *
 * @param {string|null|undefined} expr  - raw math expression string
 * @returns {Step[]}
 *
 * @typedef {{ stepNum: number, left: number, op: string, right: number, result: number, label: string }} Step
 */
export function parseMathSteps(expr) {
  if (!expr || typeof expr !== 'string') return []

  const normalised = normalise(expr)
  if (!normalised) return []

  // Step 1 — Build AST with mathjs
  let root
  try {
    root = parse(normalised)
  } catch {
    return []
  }

  // Step 2 — Use node.traverse() to validate: reject expressions that contain
  // variable names, function calls, or assignment operators (algebra).
  // node.traverse() does not support early exit via return value, so we throw
  // a sentinel symbol to abort traversal as soon as an unsupported node is
  // found.  This avoids walking the rest of the tree unnecessarily.
  const _UNSUPPORTED = Symbol('unsupported')
  let unsupported = false
  try {
    root.traverse(function(node) {
      if (
        node.type === 'SymbolNode'     ||   // variable reference, e.g. "x"
        node.type === 'FunctionNode'   ||   // function call, e.g. "sqrt(4)"
        node.type === 'AssignmentNode'      // assignment, e.g. "x = 5"
      ) {
        throw _UNSUPPORTED
      }
    })
  } catch(e) {
    if (e === _UNSUPPORTED) unsupported = true
    else throw e   // re-throw unexpected errors from the AST walk
  }
  if (unsupported) return []

  // Step 3 — Recursively evaluate the AST in post-order, collecting steps
  const rawSteps = []
  try {
    evaluateNode(root, rawSteps)
  } catch {
    return []
  }

  // A single literal number has no binary operations to display
  if (rawSteps.length === 0) return []

  // Step 4 — Map to the Step[] interface with display-ready labels
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
