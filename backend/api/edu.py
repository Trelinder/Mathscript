"""
Educational API router — courses, lessons, steps, attempts, progress.
Prefix: /api  (mounted by main.py)
"""
import ast
import json
import operator
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.db_edu import get_db
from backend.models import Course, Lesson, Step, Attempt, Progress

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------

class CourseOut(BaseModel):
    id: int
    slug: str
    title: str
    description: str
    icon: str
    order_index: int
    lesson_count: int = 0

    class Config:
        from_attributes = True


class LessonOut(BaseModel):
    id: int
    course_id: int
    slug: str
    title: str
    description: str
    order_index: int
    step_count: int = 0

    class Config:
        from_attributes = True


class StepOut(BaseModel):
    id: int
    lesson_id: int
    order_index: int
    step_type: str
    instructions: str
    problem: str
    options: list
    hint: str
    xp_reward: int

    class Config:
        from_attributes = True


class AttemptRequest(BaseModel):
    session_id: str
    answer: str


class AttemptResult(BaseModel):
    is_correct: bool
    feedback: str
    xp_earned: int
    next_step_id: Optional[int] = None
    lesson_completed: bool = False
    hint: str = ""


class ProgressOut(BaseModel):
    lesson_id: int
    lesson_title: str
    steps_completed: int
    steps_total: int
    is_completed: bool
    total_xp: int
    last_step_id: Optional[int] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Safe math evaluator (reused from existing backend logic)
# ---------------------------------------------------------------------------

_SAFE_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
}


def _safe_eval(node) -> float:
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
    elif isinstance(node, ast.BinOp):
        op_fn = _SAFE_OPS.get(type(node.op))
        if op_fn:
            return op_fn(_safe_eval(node.left), _safe_eval(node.right))
    elif isinstance(node, ast.UnaryOp):
        op_fn = _SAFE_OPS.get(type(node.op))
        if op_fn:
            return op_fn(_safe_eval(node.operand))
    raise ValueError(f"Unsupported expression: {ast.dump(node)}")


def evaluate_math(expr: str) -> Optional[float]:
    try:
        tree = ast.parse(expr.strip(), mode="eval")
        return _safe_eval(tree.body)
    except Exception:
        return None


def check_answer(step: Step, user_answer: str) -> tuple[bool, str]:
    """
    Returns (is_correct, feedback_message).
    Uses deterministic checking; no LLM required.
    """
    user_answer = user_answer.strip()

    if step.step_type == "math":
        # Try to evaluate both sides numerically
        correct_val = evaluate_math(step.correct_answer or "")
        user_val = evaluate_math(user_answer)

        if not step.correct_answer:
            return False, "❌ This step has no correct answer configured."
        elif correct_val is None:
            # Fall back to string comparison
            is_correct = user_answer.lower() == step.correct_answer.strip().lower()
        elif user_val is not None:
            is_correct = abs(user_val - correct_val) < 1e-9
        else:
            is_correct = False

        if is_correct:
            return True, "✅ Correct! Great work!"
        else:
            expected = step.correct_answer or str(correct_val)
            return False, f"❌ Not quite. The answer is {expected}."

    elif step.step_type == "multiple_choice":
        is_correct = user_answer.lower() == step.correct_answer.strip().lower()
        if is_correct:
            return True, "✅ Correct! Well done!"
        return False, f"❌ That's not right. The correct answer was: {step.correct_answer}"

    else:
        # text / open-ended — basic string match
        is_correct = user_answer.lower() == step.correct_answer.strip().lower()
        if is_correct:
            return True, "✅ Correct!"
        return False, f"❌ Expected: {step.correct_answer}"


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------

@router.get("/courses", response_model=list[CourseOut])
def list_courses():
    with get_db() as db:
        courses = (
            db.query(Course)
            .filter(Course.is_active)
            .order_by(Course.order_index)
            .all()
        )
        result = []
        for c in courses:
            result.append(
                CourseOut(
                    id=c.id,
                    slug=c.slug,
                    title=c.title,
                    description=c.description,
                    icon=c.icon,
                    order_index=c.order_index,
                    lesson_count=len([l for l in c.lessons if l.is_active]),
                )
            )
        return result


@router.get("/courses/{course_id}", response_model=dict)
def get_course(course_id: int):
    with get_db() as db:
        course = db.query(Course).filter(Course.id == course_id, Course.is_active).first()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        lessons_out = [
            LessonOut(
                id=l.id,
                course_id=l.course_id,
                slug=l.slug,
                title=l.title,
                description=l.description,
                order_index=l.order_index,
                step_count=len(l.steps),
            )
            for l in course.lessons
            if l.is_active
        ]
        return {
            "id": course.id,
            "slug": course.slug,
            "title": course.title,
            "description": course.description,
            "icon": course.icon,
            "order_index": course.order_index,
            "lessons": [l.model_dump() for l in lessons_out],
        }


# ---------------------------------------------------------------------------
# Lessons
# ---------------------------------------------------------------------------

@router.get("/lessons/{lesson_id}", response_model=dict)
def get_lesson(lesson_id: int):
    with get_db() as db:
        lesson = db.query(Lesson).filter(Lesson.id == lesson_id, Lesson.is_active).first()
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        steps_out = [
            StepOut(
                id=s.id,
                lesson_id=s.lesson_id,
                order_index=s.order_index,
                step_type=s.step_type,
                instructions=s.instructions,
                problem=s.problem,
                options=json.loads(s.options) if s.options else [],
                hint=s.hint,
                xp_reward=s.xp_reward,
            )
            for s in lesson.steps
        ]
        return {
            "id": lesson.id,
            "course_id": lesson.course_id,
            "slug": lesson.slug,
            "title": lesson.title,
            "description": lesson.description,
            "order_index": lesson.order_index,
            "steps": [s.model_dump() for s in steps_out],
        }


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------

@router.get("/steps/{step_id}", response_model=StepOut)
def get_step(step_id: int):
    with get_db() as db:
        step = db.query(Step).filter(Step.id == step_id).first()
        if not step:
            raise HTTPException(status_code=404, detail="Step not found")
        return StepOut(
            id=step.id,
            lesson_id=step.lesson_id,
            order_index=step.order_index,
            step_type=step.step_type,
            instructions=step.instructions,
            problem=step.problem,
            options=json.loads(step.options) if step.options else [],
            hint=step.hint,
            xp_reward=step.xp_reward,
        )


@router.post("/steps/{step_id}/attempt", response_model=AttemptResult)
def submit_attempt(step_id: int, req: AttemptRequest):
    if not req.session_id or len(req.session_id) > 50:
        raise HTTPException(status_code=400, detail="Invalid session_id")
    if not req.answer or len(req.answer) > 500:
        raise HTTPException(status_code=400, detail="Answer too long or empty")

    with get_db() as db:
        step = db.query(Step).filter(Step.id == step_id).first()
        if not step:
            raise HTTPException(status_code=404, detail="Step not found")

        is_correct, feedback = check_answer(step, req.answer)
        xp_earned = step.xp_reward if is_correct else 0

        # Record the attempt
        attempt = Attempt(
            session_id=req.session_id,
            step_id=step_id,
            user_answer=req.answer,
            is_correct=is_correct,
            feedback=feedback,
            xp_earned=xp_earned,
        )
        db.add(attempt)

        # Update or create progress for this lesson
        progress = (
            db.query(Progress)
            .filter(
                Progress.session_id == req.session_id,
                Progress.lesson_id == step.lesson_id,
            )
            .first()
        )

        lesson = db.query(Lesson).filter(Lesson.id == step.lesson_id).first()
        total_steps = len(lesson.steps) if lesson else 0

        if not progress:
            progress = Progress(
                session_id=req.session_id,
                lesson_id=step.lesson_id,
                steps_total=total_steps,
                steps_completed=0,
                total_xp=0,
            )
            db.add(progress)

        if is_correct:
            # Count distinct completed steps for this session/lesson
            completed_step_ids = {
                a.step_id
                for a in db.query(Attempt)
                .filter(
                    Attempt.session_id == req.session_id,
                    Attempt.is_correct,
                )
                .all()
                if a.step_id in [s.id for s in lesson.steps]
            }
            completed_step_ids.add(step_id)
            progress.steps_completed = len(completed_step_ids)
            progress.total_xp = (progress.total_xp or 0) + xp_earned
            progress.last_step_id = step_id

        # Check if lesson is now complete
        lesson_completed = progress.steps_completed >= total_steps and total_steps > 0
        progress.is_completed = lesson_completed

        # Find next step in lesson
        next_step_id = None
        if lesson:
            sorted_steps = sorted(lesson.steps, key=lambda s: s.order_index)
            for i, s in enumerate(sorted_steps):
                if s.id == step_id and i + 1 < len(sorted_steps):
                    next_step_id = sorted_steps[i + 1].id
                    break

        db.flush()

        return AttemptResult(
            is_correct=is_correct,
            feedback=feedback,
            xp_earned=xp_earned,
            next_step_id=next_step_id,
            lesson_completed=lesson_completed,
            hint=step.hint if not is_correct else "",
        )


# ---------------------------------------------------------------------------
# Progress
# ---------------------------------------------------------------------------

@router.get("/me/progress", response_model=list[ProgressOut])
def get_my_progress(session_id: str = Query(..., max_length=50)):
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    with get_db() as db:
        rows = (
            db.query(Progress)
            .filter(Progress.session_id == session_id)
            .all()
        )
        result = []
        for p in rows:
            lesson = db.query(Lesson).filter(Lesson.id == p.lesson_id).first()
            result.append(
                ProgressOut(
                    lesson_id=p.lesson_id,
                    lesson_title=lesson.title if lesson else "Unknown",
                    steps_completed=p.steps_completed,
                    steps_total=p.steps_total,
                    is_completed=p.is_completed,
                    total_xp=p.total_xp,
                    last_step_id=p.last_step_id,
                )
            )
        return result
