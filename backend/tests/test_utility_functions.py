"""
Unit tests for backend utility functions that were previously untested:
  - sanitize_error
  - _format_math_number
  - extract_answer_from_math_steps
  - _difficulty_label
  - _ideology_label
  - normalize_age_group
  - normalize_player_name
  - normalize_realm
  - _sanitize_privacy_settings
  - _is_valid_parent_pin
  - _compute_mastery_score
"""

import pytest
from main import (
    sanitize_error,
    _format_math_number,
    extract_answer_from_math_steps,
    _difficulty_label,
    _ideology_label,
    normalize_age_group,
    normalize_player_name,
    normalize_realm,
    _sanitize_privacy_settings,
    _is_valid_parent_pin,
    _compute_mastery_score,
    AGE_GROUP_SETTINGS,
    REALM_CHOICES,
)


# ─────────────────────────────────────────────────────────────────────────────
# sanitize_error
# ─────────────────────────────────────────────────────────────────────────────
class TestSanitizeError:
    def test_returns_string(self):
        result = sanitize_error(ValueError("something went wrong"))
        assert isinstance(result, str)

    def test_preserves_generic_error_message(self):
        result = sanitize_error(RuntimeError("generic error message"))
        assert "generic error message" in result

    def test_redacts_email_in_exception_message(self):
        result = sanitize_error(Exception("failed for user alice@example.com"))
        assert "alice@example.com" not in result

    def test_redacts_phone_number_in_exception_message(self):
        result = sanitize_error(Exception("called from 555-123-4567"))
        assert "555-123-4567" not in result

    def test_handles_exception_with_no_message(self):
        result = sanitize_error(Exception())
        assert isinstance(result, str)

    def test_handles_exception_with_empty_string_message(self):
        result = sanitize_error(Exception(""))
        assert isinstance(result, str)


# ─────────────────────────────────────────────────────────────────────────────
# _format_math_number
# ─────────────────────────────────────────────────────────────────────────────
class TestFormatMathNumber:
    def test_integer_value_returns_integer_string(self):
        assert _format_math_number(7.0) == "7"

    def test_negative_integer_value(self):
        assert _format_math_number(-3.0) == "-3"

    def test_zero_returns_zero_string(self):
        assert _format_math_number(0.0) == "0"

    def test_float_is_truncated_to_significant_digits(self):
        result = _format_math_number(3.14159)
        assert result.startswith("3.14")
        assert not result.endswith("0")

    def test_large_integer_value(self):
        assert _format_math_number(1_000_000.0) == "1000000"

    def test_near_integer_float_is_formatted_as_integer(self):
        # 5.0000000001 is within 1e-9 of 5 — should return "5"
        assert _format_math_number(5.0000000001) == "5"

    def test_trailing_zeros_stripped_from_decimal(self):
        result = _format_math_number(1.5)
        assert result == "1.5"
        assert not result.endswith("0")

    def test_one_half(self):
        result = _format_math_number(0.5)
        assert result == "0.5"


# ─────────────────────────────────────────────────────────────────────────────
# extract_answer_from_math_steps
# ─────────────────────────────────────────────────────────────────────────────
class TestExtractAnswerFromMathSteps:
    def test_returns_answer_from_last_step_prefixed_with_answer(self):
        steps = ["Step 1: 3 + 4", "Step 2: = 7", "Answer: 7"]
        assert extract_answer_from_math_steps(steps) == "7"

    def test_returns_last_answer_step_when_multiple_present(self):
        steps = ["Answer: intermediate", "Answer: 42"]
        assert extract_answer_from_math_steps(steps) == "42"

    def test_case_insensitive_answer_prefix(self):
        steps = ["ANSWER: 15"]
        assert extract_answer_from_math_steps(steps) == "15"

    def test_returns_empty_string_when_no_answer_step(self):
        steps = ["Step 1: add", "Step 2: multiply"]
        assert extract_answer_from_math_steps(steps) == ""

    def test_returns_empty_string_for_empty_list(self):
        assert extract_answer_from_math_steps([]) == ""

    def test_returns_empty_string_for_none(self):
        assert extract_answer_from_math_steps(None) == ""

    def test_strips_surrounding_whitespace_from_answer(self):
        steps = ["Answer:   99  "]
        assert extract_answer_from_math_steps(steps) == "99"

    def test_answer_with_expression(self):
        steps = ["Answer: x = 5"]
        assert extract_answer_from_math_steps(steps) == "x = 5"

    def test_skips_non_answer_steps(self):
        steps = ["The answer is not here", "Final: 10"]
        assert extract_answer_from_math_steps(steps) == ""


# ─────────────────────────────────────────────────────────────────────────────
# _difficulty_label
# ─────────────────────────────────────────────────────────────────────────────
class TestDifficultyLabel:
    def test_level_1_is_Rookie(self):
        assert _difficulty_label(1) == "Rookie"

    def test_level_5_is_Veteran(self):
        assert _difficulty_label(5) == "Veteran"

    def test_level_10_is_Archmage(self):
        assert _difficulty_label(10) == "Archmage"

    def test_unknown_level_returns_Journeyman(self):
        assert _difficulty_label(0) == "Journeyman"
        assert _difficulty_label(11) == "Journeyman"
        assert _difficulty_label(-1) == "Journeyman"

    def test_all_defined_levels_return_non_empty_string(self):
        for level in range(1, 11):
            label = _difficulty_label(level)
            assert isinstance(label, str) and len(label) > 0


# ─────────────────────────────────────────────────────────────────────────────
# _ideology_label
# ─────────────────────────────────────────────────────────────────────────────
class TestIdeologyLabel:
    def test_very_negative_meter_is_architect_of_order(self):
        assert _ideology_label(-100) == "Architect of Order"
        assert _ideology_label(-60) == "Architect of Order"

    def test_moderately_negative_meter_is_constructive_thinker(self):
        assert _ideology_label(-40) == "Constructive Thinker"
        assert _ideology_label(-20) == "Constructive Thinker"

    def test_neutral_meter_is_balanced_explorer(self):
        assert _ideology_label(0) == "Balanced Explorer"
        assert _ideology_label(10) == "Balanced Explorer"
        assert _ideology_label(-19) == "Balanced Explorer"

    def test_moderately_positive_meter_is_curious_adventurer(self):
        assert _ideology_label(20) == "Curious Adventurer"
        assert _ideology_label(50) == "Curious Adventurer"
        assert _ideology_label(59) == "Curious Adventurer"

    def test_very_positive_meter_is_free_spirit_explorer(self):
        assert _ideology_label(60) == "Free-Spirit Explorer"
        assert _ideology_label(100) == "Free-Spirit Explorer"

    def test_returns_string_for_boundary_values(self):
        for val in [-60, -20, 0, 19, 20, 59, 60]:
            assert isinstance(_ideology_label(val), str)


# ─────────────────────────────────────────────────────────────────────────────
# normalize_age_group
# ─────────────────────────────────────────────────────────────────────────────
class TestNormalizeAgeGroup:
    def test_valid_age_groups_are_passed_through(self):
        for age_group in AGE_GROUP_SETTINGS.keys():
            assert normalize_age_group(age_group) == age_group

    def test_none_returns_default(self):
        assert normalize_age_group(None) == "8-10"

    def test_empty_string_returns_default(self):
        assert normalize_age_group("") == "8-10"

    def test_unknown_value_returns_default(self):
        assert normalize_age_group("adult") == "8-10"
        assert normalize_age_group("0-4") == "8-10"

    def test_default_is_8_10(self):
        assert normalize_age_group("anything_invalid") == "8-10"


# ─────────────────────────────────────────────────────────────────────────────
# normalize_player_name
# ─────────────────────────────────────────────────────────────────────────────
class TestNormalizePlayerName:
    def test_simple_alphanumeric_name_passes_through(self):
        assert normalize_player_name("Alice") == "Alice"

    def test_strips_special_characters(self):
        result = normalize_player_name("Al!ce@#")
        assert "!" not in result
        assert "@" not in result
        assert "#" not in result

    def test_allows_spaces_hyphens_underscores(self):
        result = normalize_player_name("Al-ice_One Two")
        assert "-" in result
        assert "_" in result
        assert " " in result

    def test_none_returns_hero(self):
        assert normalize_player_name(None) == "Hero"

    def test_empty_string_returns_hero(self):
        assert normalize_player_name("") == "Hero"

    def test_string_of_only_special_chars_returns_hero(self):
        assert normalize_player_name("!@#$%") == "Hero"

    def test_truncates_to_24_characters(self):
        result = normalize_player_name("A" * 30)
        assert len(result) <= 24

    def test_exactly_24_characters_not_truncated(self):
        name = "B" * 24
        result = normalize_player_name(name)
        assert len(result) == 24

    def test_name_with_numbers_is_preserved(self):
        assert normalize_player_name("Hero42") == "Hero42"


# ─────────────────────────────────────────────────────────────────────────────
# normalize_realm
# ─────────────────────────────────────────────────────────────────────────────
class TestNormalizeRealm:
    def test_valid_realms_are_passed_through(self):
        for realm in REALM_CHOICES:
            assert normalize_realm(realm) == realm

    def test_none_returns_first_realm(self):
        assert normalize_realm(None) == REALM_CHOICES[0]

    def test_empty_string_returns_first_realm(self):
        assert normalize_realm("") == REALM_CHOICES[0]

    def test_unknown_realm_returns_first_realm(self):
        assert normalize_realm("Unknown Place") == REALM_CHOICES[0]

    def test_default_is_sky_citadel(self):
        assert normalize_realm("bad_realm") == "Sky Citadel"


# ─────────────────────────────────────────────────────────────────────────────
# _sanitize_privacy_settings
# ─────────────────────────────────────────────────────────────────────────────
class TestSanitizePrivacySettings:
    def test_none_returns_defaults(self):
        result = _sanitize_privacy_settings(None)
        assert result["parental_consent"] is False
        assert result["allow_telemetry"] is False
        assert result["allow_personalization"] is True
        assert result["data_retention_days"] == 30

    def test_non_dict_returns_defaults(self):
        result = _sanitize_privacy_settings("not a dict")
        assert isinstance(result, dict)
        assert "parental_consent" in result

    def test_valid_dict_is_sanitized(self):
        raw = {
            "parental_consent": True,
            "allow_telemetry": True,
            "allow_personalization": False,
            "data_retention_days": 90,
        }
        result = _sanitize_privacy_settings(raw)
        assert result["parental_consent"] is True
        assert result["allow_telemetry"] is True
        assert result["allow_personalization"] is False
        assert result["data_retention_days"] == 90

    def test_truthy_string_is_coerced_to_bool(self):
        raw = {"parental_consent": "yes"}
        result = _sanitize_privacy_settings(raw)
        # bool("yes") → True
        assert result["parental_consent"] is True

    def test_partial_dict_fills_missing_fields_with_defaults(self):
        raw = {"parental_consent": True}
        result = _sanitize_privacy_settings(raw)
        assert result["allow_telemetry"] is False
        assert result["allow_personalization"] is True
        assert result["data_retention_days"] == 30

    def test_data_retention_days_is_cast_to_int(self):
        raw = {"data_retention_days": "60"}
        result = _sanitize_privacy_settings(raw)
        assert isinstance(result["data_retention_days"], int)
        assert result["data_retention_days"] == 60

    def test_empty_dict_returns_all_defaults(self):
        result = _sanitize_privacy_settings({})
        assert result == {
            "parental_consent": False,
            "allow_telemetry": False,
            "allow_personalization": True,
            "data_retention_days": 30,
        }


# ─────────────────────────────────────────────────────────────────────────────
# _is_valid_parent_pin
# ─────────────────────────────────────────────────────────────────────────────
class TestIsValidParentPin:
    def test_valid_four_digit_pin(self):
        assert _is_valid_parent_pin("1234") is True

    def test_valid_pin_with_leading_zero(self):
        assert _is_valid_parent_pin("0099") is True

    def test_all_zeros(self):
        assert _is_valid_parent_pin("0000") is True

    def test_all_nines(self):
        assert _is_valid_parent_pin("9999") is True

    def test_three_digit_string_is_invalid(self):
        assert _is_valid_parent_pin("123") is False

    def test_five_digit_string_is_invalid(self):
        assert _is_valid_parent_pin("12345") is False

    def test_empty_string_is_invalid(self):
        assert _is_valid_parent_pin("") is False

    def test_non_digit_characters_are_invalid(self):
        assert _is_valid_parent_pin("12ab") is False

    def test_pin_with_spaces_is_invalid(self):
        assert _is_valid_parent_pin("12 4") is False

    def test_none_is_invalid(self):
        assert _is_valid_parent_pin(None) is False

    def test_integer_is_invalid(self):
        assert _is_valid_parent_pin(1234) is False


# ─────────────────────────────────────────────────────────────────────────────
# _compute_mastery_score
# ─────────────────────────────────────────────────────────────────────────────
class TestComputeMasteryScore:
    def test_zero_attempts_returns_zero(self):
        entry = {"total": 0, "correct": 0}
        # total is clamped to 1 internally, so raw = 0/1 * 0.0 confidence = 0
        assert _compute_mastery_score(entry) == 0.0

    def test_perfect_score_with_many_attempts_returns_1(self):
        entry = {"total": 10, "correct": 10}
        result = _compute_mastery_score(entry)
        assert result == 1.0

    def test_all_wrong_returns_zero(self):
        entry = {"total": 5, "correct": 0}
        assert _compute_mastery_score(entry) == 0.0

    def test_half_correct_with_full_confidence(self):
        # total=10 → confidence=1.0; correct=5 → raw=0.5; score = 0.5 * 1.0 = 0.5
        entry = {"total": 10, "correct": 5}
        assert _compute_mastery_score(entry) == pytest.approx(0.5, abs=0.001)

    def test_confidence_ramps_up_as_attempts_increase(self):
        # At total=1 confidence=0.2; at total=5 confidence=1.0
        entry_few = {"total": 1, "correct": 1}
        entry_many = {"total": 5, "correct": 5}
        assert _compute_mastery_score(entry_few) < _compute_mastery_score(entry_many)

    def test_score_is_rounded_to_3_decimal_places(self):
        entry = {"total": 3, "correct": 2}
        result = _compute_mastery_score(entry)
        # Result should have at most 3 decimal places
        assert result == round(result, 3)

    def test_score_is_between_0_and_1(self):
        for total in range(1, 20):
            for correct in range(0, total + 1):
                entry = {"total": total, "correct": correct}
                score = _compute_mastery_score(entry)
                assert 0.0 <= score <= 1.0

    def test_missing_keys_default_to_zero(self):
        # Missing total and correct keys — should not crash
        entry = {}
        result = _compute_mastery_score(entry)
        assert result == 0.0
