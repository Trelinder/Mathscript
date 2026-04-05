"""
Unit tests for backend progression-engine functions:
  - _update_streak
  - _update_badges
  - _compute_dda_level
  - _build_learning_plan / _ensure_mastery_defaults
"""

import datetime
import pytest
from main import (
    _update_streak,
    _update_badges,
    _compute_dda_level,
    _build_learning_plan,
    _ensure_mastery_defaults,
    MATH_SKILLS,
    DDA_MIN,
    DDA_MAX,
    DDA_DEFAULT,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def today_str() -> str:
    return datetime.date.today().isoformat()


def yesterday_str() -> str:
    return (datetime.date.today() - datetime.timedelta(days=1)).isoformat()


def two_days_ago_str() -> str:
    return (datetime.date.today() - datetime.timedelta(days=2)).isoformat()


def base_session(**overrides) -> dict:
    """Return a minimal session dict suitable for streak / badge tests."""
    s = {
        "streak_count": 0,
        "last_active_date": "",
        "quests_completed": 0,
        "badges": [],
        "inventory": [],
        "perseverance_score": 0,
        "hint_count": 0,
        "ideology_meter": 0,
        "difficulty_level": DDA_DEFAULT,
        "guild": None,
        "history": [],
    }
    s.update(overrides)
    return s


# ─────────────────────────────────────────────────────────────────────────────
# _update_streak
# ─────────────────────────────────────────────────────────────────────────────


class TestUpdateStreak:
    def test_first_login_sets_streak_to_1(self):
        session = base_session(streak_count=0, last_active_date="")
        _update_streak(session)
        assert session["streak_count"] == 1
        assert session["last_active_date"] == today_str()

    def test_same_day_does_not_increment_streak(self):
        session = base_session(streak_count=3, last_active_date=today_str())
        _update_streak(session)
        assert session["streak_count"] == 3

    def test_consecutive_day_increments_streak(self):
        session = base_session(streak_count=2, last_active_date=yesterday_str())
        _update_streak(session)
        assert session["streak_count"] == 3
        assert session["last_active_date"] == today_str()

    def test_missed_day_resets_streak_to_1(self):
        session = base_session(streak_count=10, last_active_date=two_days_ago_str())
        _update_streak(session)
        assert session["streak_count"] == 1

    def test_very_old_date_resets_streak_to_1(self):
        session = base_session(streak_count=50, last_active_date="2000-01-01")
        _update_streak(session)
        assert session["streak_count"] == 1

    def test_invalid_date_string_resets_streak_to_1(self):
        session = base_session(streak_count=5, last_active_date="not-a-date")
        _update_streak(session)
        assert session["streak_count"] == 1

    def test_streak_minimum_is_1(self):
        session = base_session(streak_count=0, last_active_date="")
        _update_streak(session)
        assert session["streak_count"] >= 1

    def test_updates_last_active_date_to_today(self):
        session = base_session(streak_count=1, last_active_date=yesterday_str())
        _update_streak(session)
        assert session["last_active_date"] == today_str()


# ─────────────────────────────────────────────────────────────────────────────
# _update_badges
# ─────────────────────────────────────────────────────────────────────────────


class TestUpdateBadges:
    def test_no_badges_on_empty_session(self):
        session = base_session()
        _update_badges(session)
        assert "first_quest" not in session["badges"]

    def test_first_quest_badge_at_1(self):
        session = base_session(quests_completed=1)
        _update_badges(session)
        assert "first_quest" in session["badges"]

    def test_quests_5_badge(self):
        session = base_session(quests_completed=5)
        _update_badges(session)
        assert "quests_5" in session["badges"]

    def test_quests_15_badge(self):
        session = base_session(quests_completed=15)
        _update_badges(session)
        assert "quests_15" in session["badges"]
        assert "quests_5" in session["badges"]
        assert "first_quest" in session["badges"]

    def test_streak_3_badge(self):
        session = base_session(quests_completed=1, streak_count=3)
        _update_badges(session)
        assert "streak_3" in session["badges"]

    def test_streak_7_badge(self):
        session = base_session(quests_completed=1, streak_count=7)
        _update_badges(session)
        assert "streak_7" in session["badges"]

    def test_no_streak_7_at_streak_6(self):
        session = base_session(quests_completed=1, streak_count=6)
        _update_badges(session)
        assert "streak_7" not in session["badges"]

    def test_collector_badge_with_5_items(self):
        session = base_session(
            quests_completed=1,
            inventory=[{"id": f"item_{i}"} for i in range(5)],
        )
        _update_badges(session)
        assert "collector" in session["badges"]

    def test_no_collector_badge_with_4_items(self):
        session = base_session(
            quests_completed=1,
            inventory=[{"id": f"item_{i}"} for i in range(4)],
        )
        _update_badges(session)
        assert "collector" not in session["badges"]

    def test_perseverance_10_badge(self):
        session = base_session(quests_completed=1, perseverance_score=10)
        _update_badges(session)
        assert "perseverance_10" in session["badges"]

    def test_perseverance_25_badge(self):
        session = base_session(quests_completed=1, perseverance_score=25)
        _update_badges(session)
        assert "perseverance_25" in session["badges"]
        assert "perseverance_10" in session["badges"]

    def test_hint_master_badge(self):
        session = base_session(quests_completed=1, hint_count=5)
        _update_badges(session)
        assert "hint_master" in session["badges"]

    def test_constructive_path_badge(self):
        session = base_session(quests_completed=1, ideology_meter=-40)
        _update_badges(session)
        assert "constructive_path" in session["badges"]

    def test_explorative_path_badge(self):
        session = base_session(quests_completed=1, ideology_meter=40)
        _update_badges(session)
        assert "explorative_path" in session["badges"]

    def test_difficulty_master_badge(self):
        session = base_session(quests_completed=1, difficulty_level=8)
        _update_badges(session)
        assert "difficulty_master" in session["badges"]

    def test_no_difficulty_master_below_8(self):
        session = base_session(quests_completed=1, difficulty_level=7)
        _update_badges(session)
        assert "difficulty_master" not in session["badges"]

    def test_architects_guild_badges(self):
        session = base_session(quests_completed=18, guild="architects")
        _update_badges(session)
        assert "architect_initiate" in session["badges"]
        assert "architect_adept" in session["badges"]
        assert "architect_legend" in session["badges"]

    def test_chronos_order_guild_badges(self):
        session = base_session(quests_completed=6, guild="chronos_order")
        _update_badges(session)
        assert "chronos_initiate" in session["badges"]
        assert "chronos_adept" in session["badges"]
        assert "chronos_legend" not in session["badges"]

    def test_strategists_guild_initiate_only(self):
        session = base_session(quests_completed=1, guild="strategists")
        _update_badges(session)
        assert "strategist_initiate" in session["badges"]
        assert "strategist_adept" not in session["badges"]

    def test_badges_list_is_ordered_consistently(self):
        session = base_session(quests_completed=5, streak_count=3)
        _update_badges(session)
        # Running again should produce the same result
        badges_first = list(session["badges"])
        _update_badges(session)
        assert session["badges"] == badges_first

    def test_existing_badges_are_preserved(self):
        session = base_session(quests_completed=5, badges=["first_quest"])
        _update_badges(session)
        assert "first_quest" in session["badges"]
        assert "quests_5" in session["badges"]


# ─────────────────────────────────────────────────────────────────────────────
# _compute_dda_level
# ─────────────────────────────────────────────────────────────────────────────


class TestComputeDdaLevel:
    def test_not_enough_history_returns_current(self):
        session = base_session(
            history=[{}, {}],  # only 2 entries — less than 3
            difficulty_level=5,
            hint_count=0,
            quests_completed=2,
        )
        assert _compute_dda_level(session) == 5

    def test_high_hint_ratio_decreases_level(self):
        # hint_ratio = 8/10 = 0.8 (>= 0.7 threshold)
        session = base_session(
            history=[{}] * 8,
            difficulty_level=5,
            hint_count=8,
            quests_completed=10,
        )
        result = _compute_dda_level(session)
        assert result == 4  # current - 1

    def test_high_hint_ratio_does_not_go_below_min(self):
        session = base_session(
            history=[{}] * 8,
            difficulty_level=DDA_MIN,
            hint_count=9,
            quests_completed=10,
        )
        assert _compute_dda_level(session) == DDA_MIN

    def test_low_hint_ratio_with_5_quests_increases_level(self):
        # hint_ratio = 0/10 = 0.0 (<= 0.1) and len(recent) = 5 -> increase
        session = base_session(
            history=[{}] * 5,
            difficulty_level=5,
            hint_count=0,
            quests_completed=10,
        )
        assert _compute_dda_level(session) == 6  # current + 1

    def test_low_hint_ratio_does_not_go_above_max(self):
        session = base_session(
            history=[{}] * 5,
            difficulty_level=DDA_MAX,
            hint_count=0,
            quests_completed=10,
        )
        assert _compute_dda_level(session) == DDA_MAX

    def test_moderate_hints_low_quest_count_keeps_level(self):
        # hint_ratio = 0.3 (between 0.1 and 0.7) and quest_count < 10
        session = base_session(
            history=[{}] * 5,
            difficulty_level=3,
            hint_count=3,
            quests_completed=9,
        )
        assert _compute_dda_level(session) == 3

    def test_moderate_hints_high_quest_count_low_level_bumps_up(self):
        # hint_ratio = 0.3 (between 0.1 and 0.7), quest_count >= 10, current < 5
        # → code does: new_level = min(5, current + 1) = min(5, 4) = 4
        session = base_session(
            history=[{}] * 8,
            difficulty_level=3,
            hint_count=3,
            quests_completed=10,
        )
        result = _compute_dda_level(session)
        assert result == 4  # current(3) + 1, capped at 5

    def test_result_is_always_within_bounds(self):
        # Fuzz: try a range of hint/quest combos
        for hints in range(0, 30, 3):
            for quests in range(1, 25, 3):
                for level in range(DDA_MIN, DDA_MAX + 1):
                    session = base_session(
                        history=[{}] * 8,
                        difficulty_level=level,
                        hint_count=hints,
                        quests_completed=quests,
                    )
                    result = _compute_dda_level(session)
                    assert DDA_MIN <= result <= DDA_MAX, (
                        f"Out of bounds: level={level}, hints={hints}, quests={quests} → {result}"
                    )


# ─────────────────────────────────────────────────────────────────────────────
# _build_learning_plan
# ─────────────────────────────────────────────────────────────────────────────


class TestBuildLearningPlan:
    def test_returns_3_skills_by_default(self):
        session = {}
        plan = _build_learning_plan(session)
        assert len(plan) == 3

    def test_excludes_current_skill(self):
        session = {}
        plan = _build_learning_plan(session, current_skill="addition")
        skills_in_plan = [item["skill"] for item in plan]
        assert "addition" not in skills_in_plan

    def test_plan_items_have_required_fields(self):
        session = {}
        plan = _build_learning_plan(session)
        for item in plan:
            assert "skill" in item
            assert "mastery_score" in item
            assert "attempts" in item

    def test_prioritises_low_mastery_skills(self):
        session = {
            "mastery": {
                skill: {"correct": 0, "total": 0, "mastery_score": 0.0}
                for skill in MATH_SKILLS
            }
        }
        # Give "algebra" a high mastery score
        session["mastery"]["algebra"] = {"correct": 10, "total": 10, "mastery_score": 1.0}
        plan = _build_learning_plan(session)
        skills_in_plan = [item["skill"] for item in plan]
        # The plan should not lead with algebra (it's already mastered)
        assert skills_in_plan[0] != "algebra"

    def test_handles_no_mastery_data(self):
        session = {}
        # Should not raise
        plan = _build_learning_plan(session)
        assert isinstance(plan, list)

    def test_mastery_initialised_by_call(self):
        session = {}
        _build_learning_plan(session)
        # _ensure_mastery_defaults should have been called
        assert "mastery" in session
        for skill in MATH_SKILLS:
            assert skill in session["mastery"]


# ─────────────────────────────────────────────────────────────────────────────
# _ensure_mastery_defaults
# ─────────────────────────────────────────────────────────────────────────────


class TestEnsureMasteryDefaults:
    def test_adds_all_skills_to_empty_session(self):
        session = {}
        _ensure_mastery_defaults(session)
        for skill in MATH_SKILLS:
            assert skill in session["mastery"]

    def test_does_not_overwrite_existing_mastery(self):
        session = {
            "mastery": {
                "addition": {"correct": 5, "total": 7, "mastery_score": 0.714}
            }
        }
        _ensure_mastery_defaults(session)
        assert session["mastery"]["addition"]["correct"] == 5
        assert session["mastery"]["addition"]["total"] == 7

    def test_replaces_corrupted_mastery_value(self):
        session = {"mastery": {"addition": "not-a-dict"}}
        _ensure_mastery_defaults(session)
        assert isinstance(session["mastery"]["addition"], dict)
        assert "mastery_score" in session["mastery"]["addition"]

    def test_replaces_non_dict_mastery_root(self):
        session = {"mastery": "broken"}
        _ensure_mastery_defaults(session)
        assert isinstance(session["mastery"], dict)

    def test_adds_missing_keys_to_partial_entry(self):
        session = {"mastery": {"addition": {"correct": 3}}}
        _ensure_mastery_defaults(session)
        entry = session["mastery"]["addition"]
        assert "total" in entry
        assert "mastery_score" in entry
