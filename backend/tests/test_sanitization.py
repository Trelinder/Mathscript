"""
Unit tests for backend input sanitization and attack detection:
  - sanitize_input
  - _detect_attack_patterns
"""

import pytest
from main import sanitize_input, _detect_attack_patterns


# ─────────────────────────────────────────────────────────────────────────────
# sanitize_input (PII redaction)
# ─────────────────────────────────────────────────────────────────────────────


class TestSanitizeInput:
    def test_passthrough_clean_text(self):
        text = "What is 3 + 4?"
        assert sanitize_input(text) == text

    def test_redacts_email(self):
        result = sanitize_input("contact me at alice@example.com please")
        assert "alice@example.com" not in result
        assert "[REDACTED]" in result

    def test_redacts_phone_number_dashes(self):
        result = sanitize_input("call 555-867-5309 now")
        assert "555-867-5309" not in result
        assert "[REDACTED]" in result

    def test_redacts_bearer_token(self):
        result = sanitize_input("Authorization: bearer my-secret-token-abc")
        assert "my-secret-token-abc" not in result

    def test_redacts_api_key_pattern(self):
        result = sanitize_input("api_key=sk-abcdefg1234567890xxxx")
        assert "sk-abcdefg1234567890xxxx" not in result

    def test_redacts_jwt_token(self):
        # A realistic-looking JWT (three base64url segments)
        jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        result = sanitize_input(f"token={jwt}")
        assert jwt not in result

    def test_redacts_long_hex_string(self):
        # 32-char hex strings are treated as potential secrets
        hex_str = "a" * 32
        result = sanitize_input(f"key={hex_str}")
        assert hex_str not in result

    def test_returns_empty_string_for_empty_input(self):
        assert sanitize_input("") == ""

    def test_returns_none_for_none(self):
        assert sanitize_input(None) is None

    def test_does_not_modify_normal_math(self):
        text = "3 × 4 = 12"
        assert sanitize_input(text) == text

    def test_multiple_pii_in_one_string(self):
        text = "email: test@test.com, phone: 555-123-4567"
        result = sanitize_input(text)
        assert "test@test.com" not in result
        assert "555-123-4567" not in result


# ─────────────────────────────────────────────────────────────────────────────
# _detect_attack_patterns
# ─────────────────────────────────────────────────────────────────────────────


class TestDetectAttackPatterns:
    def test_clean_math_input_returns_none(self):
        assert _detect_attack_patterns("3 + 4") is None

    def test_clean_story_input_returns_none(self):
        assert _detect_attack_patterns("What is the square root of 16?") is None

    def test_detects_sql_injection_drop(self):
        result = _detect_attack_patterns("'; DROP TABLE users; --")
        assert result is not None

    def test_detects_sql_union(self):
        result = _detect_attack_patterns("1 UNION SELECT * FROM users")
        assert result is not None

    def test_detects_python_eval_injection(self):
        # The attack patterns cover eval( calls
        result = _detect_attack_patterns("eval(os.system('id'))")
        assert result is not None

    def test_detects_python_import_injection(self):
        result = _detect_attack_patterns("__import__('os').system('id')")
        assert result is not None

    def test_detects_xss_script_tag(self):
        result = _detect_attack_patterns("<script>alert(1)</script>")
        assert result is not None

    def test_detects_path_traversal(self):
        result = _detect_attack_patterns("../../etc/passwd")
        assert result is not None

    def test_returns_none_for_empty_string(self):
        assert _detect_attack_patterns("") is None

    def test_returns_none_for_normal_sentence(self):
        assert _detect_attack_patterns("Solve for x when x + 5 = 10") is None

    def test_match_is_truncated_to_50_chars(self):
        injection = "'; DROP TABLE users; -- " + "x" * 100
        result = _detect_attack_patterns(injection)
        # Return value should be at most 50 characters
        if result is not None:
            assert len(result) <= 50
