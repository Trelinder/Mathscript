"""
Seed script — inserts starter course content for MathScript.
Run with:  python -m backend.seed_edu

Safe to run multiple times — uses upsert logic (skips existing rows).
"""
import os
import sys
import json

# Ensure project root is on path when run directly
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.db_edu import engine, SessionLocal, init_edu_db
from backend.models import Course, Lesson, Step


SEED_DATA = [
    {
        "slug": "addition-adventure",
        "title": "Addition Adventure",
        "description": "Master the art of adding numbers, from single digits to larger sums.",
        "icon": "➕",
        "order_index": 1,
        "lessons": [
            {
                "slug": "single-digit-addition",
                "title": "Single-Digit Addition",
                "description": "Add two single-digit numbers together.",
                "order_index": 1,
                "steps": [
                    {
                        "order_index": 1,
                        "step_type": "math",
                        "instructions": "Add these numbers together and type your answer.",
                        "problem": "3 + 4",
                        "correct_answer": "7",
                        "hint": "Count up from 3: 4, 5, 6, 7.",
                        "xp_reward": 10,
                    },
                    {
                        "order_index": 2,
                        "step_type": "math",
                        "instructions": "What is the sum?",
                        "problem": "5 + 6",
                        "correct_answer": "11",
                        "hint": "5 + 5 = 10, then add 1 more.",
                        "xp_reward": 10,
                    },
                    {
                        "order_index": 3,
                        "step_type": "multiple_choice",
                        "instructions": "Choose the correct answer for 7 + 8.",
                        "problem": "7 + 8 = ?",
                        "options": ["13", "14", "15", "16"],
                        "correct_answer": "15",
                        "hint": "7 + 7 = 14, then add 1 more.",
                        "xp_reward": 15,
                    },
                ],
            },
            {
                "slug": "two-digit-addition",
                "title": "Two-Digit Addition",
                "description": "Add two-digit numbers with and without carrying.",
                "order_index": 2,
                "steps": [
                    {
                        "order_index": 1,
                        "step_type": "math",
                        "instructions": "Add these two-digit numbers.",
                        "problem": "23 + 14",
                        "correct_answer": "37",
                        "hint": "Add the tens (20+10=30), then the ones (3+4=7).",
                        "xp_reward": 15,
                    },
                    {
                        "order_index": 2,
                        "step_type": "math",
                        "instructions": "Add and carry if needed.",
                        "problem": "47 + 35",
                        "correct_answer": "82",
                        "hint": "7+5=12, write 2 carry 1. Then 4+3+1=8.",
                        "xp_reward": 20,
                    },
                ],
            },
        ],
    },
    {
        "slug": "subtraction-quest",
        "title": "Subtraction Quest",
        "description": "Learn to subtract numbers confidently.",
        "icon": "➖",
        "order_index": 2,
        "lessons": [
            {
                "slug": "basic-subtraction",
                "title": "Basic Subtraction",
                "description": "Subtract single-digit numbers.",
                "order_index": 1,
                "steps": [
                    {
                        "order_index": 1,
                        "step_type": "math",
                        "instructions": "Subtract the second number from the first.",
                        "problem": "9 - 4",
                        "correct_answer": "5",
                        "hint": "Count back from 9: 8, 7, 6, 5.",
                        "xp_reward": 10,
                    },
                    {
                        "order_index": 2,
                        "step_type": "math",
                        "instructions": "What is the difference?",
                        "problem": "15 - 8",
                        "correct_answer": "7",
                        "hint": "15 - 5 = 10, then 10 - 3 = 7.",
                        "xp_reward": 10,
                    },
                    {
                        "order_index": 3,
                        "step_type": "multiple_choice",
                        "instructions": "Choose the correct answer for 12 - 5.",
                        "problem": "12 - 5 = ?",
                        "options": ["5", "6", "7", "8"],
                        "correct_answer": "7",
                        "hint": "12 - 2 = 10, then 10 - 3 = 7.",
                        "xp_reward": 15,
                    },
                ],
            },
        ],
    },
    {
        "slug": "multiplication-magic",
        "title": "Multiplication Magic",
        "description": "Discover the power of multiplication.",
        "icon": "✖️",
        "order_index": 3,
        "lessons": [
            {
                "slug": "times-tables-2-5",
                "title": "Times Tables: 2 & 5",
                "description": "Master the 2× and 5× tables.",
                "order_index": 1,
                "steps": [
                    {
                        "order_index": 1,
                        "step_type": "math",
                        "instructions": "Multiply these numbers.",
                        "problem": "3 * 2",
                        "correct_answer": "6",
                        "hint": "3 groups of 2 = 2 + 2 + 2.",
                        "xp_reward": 10,
                    },
                    {
                        "order_index": 2,
                        "step_type": "math",
                        "instructions": "What is the product?",
                        "problem": "7 * 5",
                        "correct_answer": "35",
                        "hint": "Count by 5s seven times: 5, 10, 15, 20, 25, 30, 35.",
                        "xp_reward": 15,
                    },
                ],
            },
        ],
    },
]


def seed():
    init_edu_db()
    db = SessionLocal()
    try:
        for course_data in SEED_DATA:
            lessons_data = course_data.pop("lessons", [])
            course = db.query(Course).filter(Course.slug == course_data["slug"]).first()
            if not course:
                course = Course(**course_data)
                db.add(course)
                db.flush()
                print(f"  Created course: {course.title}")
            else:
                print(f"  Skipped existing course: {course.title}")

            for lesson_data in lessons_data:
                steps_data = lesson_data.pop("steps", [])
                lesson = (
                    db.query(Lesson)
                    .filter(
                        Lesson.course_id == course.id,
                        Lesson.slug == lesson_data["slug"],
                    )
                    .first()
                )
                if not lesson:
                    lesson = Lesson(course_id=course.id, **lesson_data)
                    db.add(lesson)
                    db.flush()
                    print(f"    Created lesson: {lesson.title}")
                else:
                    print(f"    Skipped existing lesson: {lesson.title}")

                for step_data in steps_data:
                    options = step_data.pop("options", [])
                    step_data["options"] = json.dumps(options) if options else ""
                    existing_step = (
                        db.query(Step)
                        .filter(
                            Step.lesson_id == lesson.id,
                            Step.order_index == step_data["order_index"],
                        )
                        .first()
                    )
                    if not existing_step:
                        step = Step(lesson_id=lesson.id, **step_data)
                        db.add(step)
                        print(f"      Created step {step_data['order_index']}: {step_data['problem']}")

        db.commit()
        print("\n✅ Seed complete.")
    except Exception as e:
        db.rollback()
        print(f"❌ Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("Seeding educational content...")
    seed()
