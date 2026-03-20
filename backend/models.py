"""
SQLAlchemy ORM models for the MathScript educational backbone.

Tables:
  - courses     : top-level learning paths (e.g. "Addition Adventure")
  - lessons     : ordered sections inside a course
  - steps       : individual practice problems inside a lesson
  - attempts    : a learner's submission for a step
  - progress    : summarised per-session per-lesson completion state
"""
import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    Float,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(String(80), unique=True, nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    icon = Column(String(10), default="📚")
    order_index = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    lessons = relationship(
        "Lesson", back_populates="course", order_by="Lesson.order_index"
    )


class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    slug = Column(String(80), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    order_index = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    course = relationship("Course", back_populates="lessons")
    steps = relationship(
        "Step", back_populates="lesson", order_by="Step.order_index"
    )
    progress = relationship("Progress", back_populates="lesson")

    __table_args__ = (UniqueConstraint("course_id", "slug"),)


class Step(Base):
    __tablename__ = "steps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, default=0, nullable=False)
    # Type of step: 'math', 'multiple_choice', 'text'
    step_type = Column(String(30), default="math", nullable=False)
    instructions = Column(Text, nullable=False)
    # For math steps: the problem expression, e.g. "3 + 4"
    problem = Column(String(500), default="")
    # For multiple-choice steps: JSON array of options
    options = Column(Text, default="")
    # Correct answer (used for deterministic checking)
    correct_answer = Column(String(200), default="")
    # Hint text shown after a wrong attempt
    hint = Column(Text, default="")
    # XP awarded on correct completion
    xp_reward = Column(Integer, default=10, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    lesson = relationship("Lesson", back_populates="steps")
    attempts = relationship("Attempt", back_populates="step")


class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(50), nullable=False, index=True)
    step_id = Column(Integer, ForeignKey("steps.id", ondelete="CASCADE"), nullable=False)
    user_answer = Column(Text, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    feedback = Column(Text, default="")
    xp_earned = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    step = relationship("Step", back_populates="attempts")


class Progress(Base):
    __tablename__ = "progress"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(50), nullable=False, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    steps_completed = Column(Integer, default=0, nullable=False)
    steps_total = Column(Integer, default=0, nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)
    total_xp = Column(Integer, default=0, nullable=False)
    last_step_id = Column(Integer, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    lesson = relationship("Lesson", back_populates="progress")

    __table_args__ = (UniqueConstraint("session_id", "lesson_id"),)
