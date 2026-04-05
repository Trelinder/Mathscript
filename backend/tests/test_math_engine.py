"""
Unit tests for backend math evaluation functions:
  - _normalize_math_expression
  - _safe_eval_math_ast
  - try_solve_basic_math
  - _detect_math_skill
"""

import ast
import pytest
from main import (
    _normalize_math_expression,
    _safe_eval_math_ast,
    try_solve_basic_math,
    _detect_math_skill,
)


# ─────────────────────────────────────────────────────────────────────────────
# _normalize_math_expression
# ─────────────────────────────────────────────────────────────────────────────


class TestNormalizeMathExpression:
    def test_simple_addition(self):
        assert _normalize_math_expression("2 + 3") == "2+3"

    def test_unicode_multiply(self):
        assert _normalize_math_expression("4 × 5") == "4*5"

    def test_unicode_divide(self):
        assert _normalize_math_expression("10 ÷ 2") == "10/2"

    def test_unicode_minus(self):
        # em-dash and en-dash should become regular minus
        assert _normalize_math_expression("10 – 3") == "10-3"

    def test_word_plus(self):
        assert _normalize_math_expression("3 plus 4") == "3+4"

    def test_word_minus(self):
        assert _normalize_math_expression("7 minus 2") == "7-2"

    def test_word_times(self):
        assert _normalize_math_expression("6 times 3") == "6*3"

    def test_word_multiplied_by(self):
        assert _normalize_math_expression("6 multiplied by 3") == "6*3"

    def test_word_divided_by(self):
        assert _normalize_math_expression("8 divided by 2") == "8/2"

    def test_word_over(self):
        assert _normalize_math_expression("9 over 3") == "9/3"

    def test_strips_leading_whitespace(self):
        assert _normalize_math_expression("  5 + 2") == "5+2"

    def test_strips_question_prefix(self):
        result = _normalize_math_expression("what is 3 + 4")
        assert result == "3+4"

    def test_strips_calculate_prefix(self):
        result = _normalize_math_expression("calculate 10 * 5")
        assert result == "10*5"

    def test_exponent_caret(self):
        result = _normalize_math_expression("2^3")
        assert result == "2**3"

    def test_unicode_squared(self):
        result = _normalize_math_expression("3²")
        assert result == "3**2"

    def test_equation_strips_rhs_question(self):
        # "x + 5 = ?" → strips right side
        result = _normalize_math_expression("5+3=?")
        assert result is not None

    def test_removes_commas_from_large_numbers(self):
        result = _normalize_math_expression("1,000 + 500")
        assert result == "1000+500"

    def test_returns_none_for_empty_string(self):
        assert _normalize_math_expression("") is None

    def test_returns_none_for_none(self):
        assert _normalize_math_expression(None) is None

    def test_returns_none_for_expression_with_letters(self):
        # Non-math characters make it invalid
        assert _normalize_math_expression("hello") is None

    def test_returns_none_for_expression_exceeding_length(self):
        long_expr = "1+" * 30
        assert _normalize_math_expression(long_expr) is None

    def test_triple_star_is_rejected(self):
        # "***" is invalid
        assert _normalize_math_expression("2***3") is None

    def test_valid_parentheses(self):
        result = _normalize_math_expression("(2 + 3) * 4")
        assert result == "(2+3)*4"


# ─────────────────────────────────────────────────────────────────────────────
# _safe_eval_math_ast
# ─────────────────────────────────────────────────────────────────────────────


def _parse_eval(expr: str) -> float:
    """Helper: parse and evaluate an expression through _safe_eval_math_ast."""
    return _safe_eval_math_ast(ast.parse(expr, mode="eval"))


class TestSafeEvalMathAst:
    def test_addition(self):
        assert _parse_eval("2+3") == pytest.approx(5.0)

    def test_subtraction(self):
        assert _parse_eval("10-4") == pytest.approx(6.0)

    def test_multiplication(self):
        assert _parse_eval("3*7") == pytest.approx(21.0)

    def test_division(self):
        assert _parse_eval("10/4") == pytest.approx(2.5)

    def test_floor_division(self):
        assert _parse_eval("7//2") == pytest.approx(3.0)

    def test_modulo(self):
        assert _parse_eval("10%3") == pytest.approx(1.0)

    def test_exponent(self):
        assert _parse_eval("2**3") == pytest.approx(8.0)

    def test_unary_minus(self):
        assert _parse_eval("-5") == pytest.approx(-5.0)

    def test_unary_plus(self):
        assert _parse_eval("+5") == pytest.approx(5.0)

    def test_nested_expression(self):
        assert _parse_eval("(2+3)*4") == pytest.approx(20.0)

    def test_division_by_zero_raises(self):
        with pytest.raises(ValueError, match="Division by zero"):
            _parse_eval("5/0")

    def test_large_power_raises(self):
        with pytest.raises(ValueError, match="Power too large"):
            _parse_eval("2**100")

    def test_large_base_power_raises(self):
        with pytest.raises(ValueError, match="Power too large"):
            _parse_eval("2000000**2")

    def test_result_too_large_raises(self):
        # The guard is `abs(out) > 1_000_000_000` (strictly greater), so
        # 500000001 + 500000001 = 1000000002 reliably exceeds the limit.
        with pytest.raises(ValueError, match="Value too large"):
            _parse_eval("500000001+500000001")

    def test_rejects_string_constant(self):
        tree = ast.parse("'hello'", mode="eval")
        with pytest.raises(ValueError):
            _safe_eval_math_ast(tree)

    def test_rejects_function_calls(self):
        with pytest.raises(ValueError):
            _parse_eval("abs(-5)")


# ─────────────────────────────────────────────────────────────────────────────
# try_solve_basic_math
# ─────────────────────────────────────────────────────────────────────────────


class TestTrySolveBasicMath:
    def test_simple_addition(self):
        result = try_solve_basic_math("2 + 3")
        assert result is not None
        assert result["answer"] == "5"

    def test_multiplication(self):
        result = try_solve_basic_math("4 × 5")
        assert result["answer"] == "20"

    def test_division_exact(self):
        result = try_solve_basic_math("10 ÷ 2")
        assert result["answer"] == "5"

    def test_division_decimal(self):
        result = try_solve_basic_math("10 ÷ 4")
        assert result is not None
        assert result["answer"] == "2.5"

    def test_subtraction(self):
        result = try_solve_basic_math("10 – 3")
        assert result["answer"] == "7"

    def test_order_of_operations(self):
        result = try_solve_basic_math("2 + 3 * 4")
        assert result["answer"] == "14"

    def test_parentheses(self):
        result = try_solve_basic_math("(2 + 3) * 4")
        assert result["answer"] == "20"

    def test_word_form(self):
        result = try_solve_basic_math("5 times 6")
        assert result["answer"] == "30"

    def test_exponent(self):
        result = try_solve_basic_math("2^3")
        assert result["answer"] == "8"

    def test_returns_none_for_unsolvable(self):
        assert try_solve_basic_math("hello world") is None

    def test_returns_none_for_empty(self):
        assert try_solve_basic_math("") is None

    def test_returns_none_for_none(self):
        assert try_solve_basic_math(None) is None

    def test_returns_none_for_division_by_zero(self):
        assert try_solve_basic_math("5 / 0") is None

    def test_result_structure(self):
        result = try_solve_basic_math("3 + 4")
        assert "answer" in result
        assert "display_expr" in result
        assert "math_steps" in result
        assert "math_solution" in result
        assert isinstance(result["math_steps"], list)

    def test_large_number_rejected(self):
        # The limit is abs(out) > 1_000_000_000 (strictly greater).
        # 500000001 + 500000001 = 1000000002 exceeds the limit.
        assert try_solve_basic_math("500000001 + 500000001") is None

    def test_removes_commas(self):
        result = try_solve_basic_math("1,000 + 500")
        assert result is not None
        assert result["answer"] == "1500"


# ─────────────────────────────────────────────────────────────────────────────
# _detect_math_skill
# ─────────────────────────────────────────────────────────────────────────────


class TestDetectMathSkill:
    def test_addition_default(self):
        assert _detect_math_skill("5 + 3") == "addition"

    def test_subtraction(self):
        assert _detect_math_skill("10 − 4") == "subtraction"

    def test_subtraction_minus_word(self):
        assert _detect_math_skill("subtract 3 from 7") == "subtraction"

    def test_multiplication_symbol(self):
        assert _detect_math_skill("4 × 3") == "multiplication"

    def test_multiplication_word(self):
        assert _detect_math_skill("5 times 6") == "multiplication"

    def test_division_symbol(self):
        assert _detect_math_skill("12 ÷ 4") == "division"

    def test_division_word(self):
        assert _detect_math_skill("10 divided by 2") == "division"

    def test_fractions(self):
        assert _detect_math_skill("1/4 + 2/4") == "fractions"

    def test_decimals(self):
        assert _detect_math_skill("0.5 + 0.3") == "decimals"

    def test_algebra(self):
        assert _detect_math_skill("x = ?  solve for x") == "algebra"

    def test_exponents(self):
        assert _detect_math_skill("2^3") == "exponents"

    def test_exponent_word(self):
        assert _detect_math_skill("2 squared") == "exponents"

    def test_empty_string_defaults_to_addition(self):
        assert _detect_math_skill("") == "addition"
