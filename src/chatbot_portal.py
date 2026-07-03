from __future__ import annotations

import ast
import logging
import operator
import re
from dataclasses import dataclass, field
from uuid import uuid4

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from openai import AzureOpenAI
from pydantic import BaseModel, Field

from src.config import settings

router = APIRouter()
app = FastAPI(title="The Math Script Services Chatbot")
logger = logging.getLogger("chatbot-portal")

BOOKING_REQUIRED_FIELDS = ("name", "email", "preferred_time_request")
TIME_HINT_RE = re.compile(
    r"\b(\d{1,2}(:\d{2})?\s?(am|pm)?|today|tomorrow|tonight|next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|pst|pdt|est|edt|cst|cdt|mst|mdt|utc|gmt|america/[a-z_]+|morning|afternoon|evening)\b",
    re.IGNORECASE,
)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
BOOKING_TERMS = ("schedule", "book", "appointment", "calendly", "meeting", "call", "calendar")
MATH_TRIGGER_WORDS = ("solve", "calculate", "compute", "evaluate", "simplify", "factor")
MATH_SYMBOL_RE = re.compile(r"[0-9=+\-*/^×÷()]")
LINEAR_VARIABLE_RE = re.compile(r"\b([a-zA-Z])\b")
SAFE_ARITHMETIC_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
}
SAFE_UNARY_OPERATORS = {ast.UAdd: operator.pos, ast.USub: operator.neg}


@dataclass
class LinearExpr:
    coefficient: float = 0.0
    constant: float = 0.0

    def __add__(self, other: "LinearExpr") -> "LinearExpr":
        return LinearExpr(self.coefficient + other.coefficient, self.constant + other.constant)

    def __sub__(self, other: "LinearExpr") -> "LinearExpr":
        return LinearExpr(self.coefficient - other.coefficient, self.constant - other.constant)

    def __mul__(self, other: "LinearExpr") -> "LinearExpr":
        if self.coefficient and other.coefficient:
            raise ValueError("nonlinear expression")
        if other.coefficient:
            return LinearExpr(other.coefficient * self.constant, other.constant * self.constant)
        return LinearExpr(self.coefficient * other.constant, self.constant * other.constant)

    def __truediv__(self, other: "LinearExpr") -> "LinearExpr":
        if other.coefficient:
            raise ValueError("division by a variable expression is not supported")
        if other.constant == 0:
            raise ZeroDivisionError("division by zero")
        return LinearExpr(self.coefficient / other.constant, self.constant / other.constant)




@dataclass
class ChatSession:
    messages: list[dict[str, str]] = field(default_factory=list)
    name: str | None = None
    email: str | None = None
    timezone: str | None = None
    preferred_time_request: str | None = None
    topic: str | None = None
    notes: str | None = None
    booked_zoom_url: str | None = None
    booking_reference: str | None = None


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str = Field(min_length=1, max_length=4000)
    name: str | None = None
    email: str | None = None
    timezone: str | None = None

class ChatResponse(BaseModel):
    session_id: str
    reply: str
    intent: str
    booked: bool = False
    calendly_url: str | None = None
    missing_fields: list[str] = Field(default_factory=list)
    collected_details: dict[str, str] = Field(default_factory=dict)


class CalendlyBookingResponse(BaseModel):
    calendly_url: str
    message: str


chat_sessions: dict[str, ChatSession] = {}


def _new_session_id() -> str:
    return str(uuid4())


def _get_session(session_id: str | None) -> tuple[str, ChatSession]:
    resolved_session_id = session_id or _new_session_id()
    return resolved_session_id, chat_sessions.setdefault(resolved_session_id, ChatSession())


def _looks_like_booking_request(message: str) -> bool:
    lowered = message.lower()
    return any(term in lowered for term in BOOKING_TERMS)


def _extract_email(message: str) -> str | None:
    match = EMAIL_RE.search(message)
    return match.group(0) if match else None


def _extract_preferred_time_request(message: str) -> str | None:
    return message.strip() if TIME_HINT_RE.search(message) else None


def _update_session_from_message(session: ChatSession, payload: ChatRequest) -> None:
    if payload.name:
        session.name = payload.name.strip() or session.name
    if payload.email:
        session.email = payload.email.strip() or session.email
    if payload.timezone:
        session.timezone = payload.timezone.strip() or session.timezone

    message = payload.message.strip()
    if not session.email:
        extracted_email = _extract_email(message)
        if extracted_email:
            session.email = extracted_email
    if not session.preferred_time_request:
        extracted_time = _extract_preferred_time_request(message)
        if extracted_time:
            session.preferred_time_request = extracted_time


def _missing_booking_fields(session: ChatSession) -> list[str]:
    missing = []
    for field_name in BOOKING_REQUIRED_FIELDS:
        if not getattr(session, field_name):
            missing.append(field_name)
    return missing


def _next_booking_question(missing_fields: list[str]) -> str:
    if "name" in missing_fields:
        return "What name should I use for the Calendly booking?"
    if "email" in missing_fields:
        return "What email should I use to send the Calendly link or confirmation?"
    if "preferred_time_request" in missing_fields:
        return "What day and time works best for you, and what timezone should I use?"
    return "I just need one more detail to send the Calendly link."


def _calendly_link() -> str:
  link = settings.calendly_url or settings.scheduling_api_url
  if not link:
    raise HTTPException(status_code=500, detail="Calendly URL is missing")
  return link


def _get_search_context(query: str) -> str:
    if not settings.azure_ai_search_endpoint or not settings.azure_ai_search_index_name or not settings.azure_ai_search_api_key:
        return ""

    try:
        client = SearchClient(
            endpoint=settings.azure_ai_search_endpoint,
            index_name=settings.azure_ai_search_index_name,
            credential=AzureKeyCredential(settings.azure_ai_search_api_key),
        )
        snippets: list[str] = []
        results = client.search(search_text=query, top=3)
        for result in results:
            document = dict(result)
            title = str(document.get("title") or document.get("name") or document.get("id") or "document")
            body = (
                document.get("content")
                or document.get("text")
                or document.get("body")
                or document.get("description")
                or document.get("summary")
            )
            if body:
                snippets.append(f"{title}: {str(body)[:500]}")
        return "\n".join(snippets[:3])
    except Exception:
        logger.exception("Azure Search lookup failed")
        return ""


def _generate_general_reply(message: str, knowledge_context: str) -> str:
    if not settings.azure_openai_endpoint or not settings.azure_openai_deployment:
        return "I can help answer questions and share the Calendly booking link. Ask me anything about the site or say 'book a call' to get started."

    try:
        if not settings.azure_openai_api_key and not settings.azure_openai_use_entra_auth:
            raise HTTPException(status_code=500, detail="Azure OpenAI API key is missing")

        client = AzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
        )
        prompt = [
            {
                "role": "system",
                "content": (
                    "You are the website chatbot for services.themathscript.com. "
                    "Use the Azure Search context as the source of truth. "
                    "Answer briefly and clearly. If the user wants to schedule a call, ask for missing booking details one at a time."
                ),
            },
            {"role": "user", "content": f"Site context:\n{knowledge_context or 'No Azure Search context was returned.'}\n\nUser message:\n{message}"},
        ]
        response = client.responses.create(
            model=settings.azure_openai_deployment,
            input=prompt,
            max_output_tokens=settings.max_response_output_tokens,
            parallel_tool_calls=False,
            max_tool_calls=1,
        )
        return (response.output_text or "").strip() or "I can help with that, but I need one more detail."
    except Exception:
        logger.exception("General reply generation failed")
        return "I can help answer questions and share the Calendly booking link. Ask me anything about the site or say 'book a call' to get started."


def _schedule_calendly_call(session: ChatSession) -> tuple[str, str | None, str | None]:
    del session
    link = _calendly_link()
    return ("Use this Calendly link to book the call.", link, None)


def _booking_context_summary(session: ChatSession) -> dict[str, str]:
    collected: dict[str, str] = {}
    if session.name:
        collected["name"] = session.name
    if session.email:
        collected["email"] = session.email
    if session.timezone:
        collected["timezone"] = session.timezone
    if session.preferred_time_request:
        collected["preferred_time_request"] = session.preferred_time_request
    if session.topic:
        collected["topic"] = session.topic
    return collected


def _normalize_math_expression(message: str) -> str:
    expression = message.strip().lower()
    expression = re.sub(r"^(what is|what's|whats|calculate|compute|evaluate|simplify|factor|solve)\s+", "", expression)
    expression = expression.replace("×", "*").replace("÷", "/").replace("^", "**")
    expression = re.sub(r"(\d)([a-zA-Z(])", r"\1*\2", expression)
    expression = re.sub(r"([a-zA-Z)])(\d)", r"\1*\2", expression)
    return expression.strip()


def _contains_math_signal(message: str) -> bool:
    lowered = message.lower()
    return bool(MATH_SYMBOL_RE.search(message) and (re.search(r"\d", message) or any(word in lowered for word in MATH_TRIGGER_WORDS)))


def _safe_eval_arithmetic(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _safe_eval_arithmetic(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.BinOp):
        left = _safe_eval_arithmetic(node.left)
        right = _safe_eval_arithmetic(node.right)
        operator_fn = SAFE_ARITHMETIC_OPERATORS.get(type(node.op))
        if not operator_fn:
            raise ValueError("unsupported operator")
        return float(operator_fn(left, right))
    if isinstance(node, ast.UnaryOp):
        operator_fn = SAFE_UNARY_OPERATORS.get(type(node.op))
        if not operator_fn:
            raise ValueError("unsupported unary operator")
        return float(operator_fn(_safe_eval_arithmetic(node.operand)))
    raise ValueError("unsupported expression")


def _format_number(value: float) -> str:
    if value.is_integer():
        return str(int(value))
    return f"{value:.10g}"


def _linear_expr_from_ast(node: ast.AST, variable_name: str) -> LinearExpr:
    if isinstance(node, ast.Expression):
        return _linear_expr_from_ast(node.body, variable_name)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return LinearExpr(0.0, float(node.value))
    if isinstance(node, ast.Name):
        if node.id != variable_name:
            raise ValueError("only one variable is supported")
        return LinearExpr(1.0, 0.0)
    if isinstance(node, ast.BinOp):
        left = _linear_expr_from_ast(node.left, variable_name)
        right = _linear_expr_from_ast(node.right, variable_name)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
        if isinstance(node.op, ast.Pow):
            if right.coefficient:
                raise ValueError("variable exponents are not supported")
            if right.constant not in (0.0, 1.0, 2.0):
                raise ValueError("only simple powers are supported")
            if right.constant == 0.0:
                return LinearExpr(0.0, 1.0)
            if right.constant == 1.0:
                return left
            if left.coefficient:
                raise ValueError("quadratic expressions are not supported")
            return LinearExpr(0.0, left.constant ** 2)
        raise ValueError("unsupported operator")
    if isinstance(node, ast.UnaryOp):
        value = _linear_expr_from_ast(node.operand, variable_name)
        if isinstance(node.op, ast.UAdd):
            return value
        if isinstance(node.op, ast.USub):
            return LinearExpr(-value.coefficient, -value.constant)
        raise ValueError("unsupported unary operator")
    raise ValueError("unsupported expression")


def _solve_math_problem(message: str) -> str | None:
    if not _contains_math_signal(message):
        return None

    normalized = _normalize_math_expression(message)
    if not normalized:
        return None

    if "=" in normalized:
        variable_match = LINEAR_VARIABLE_RE.search(normalized)
        if variable_match:
            variable_name = variable_match.group(1)
            left_text, right_text = [part.strip() for part in normalized.split("=", 1)]
            try:
                left_expr = _linear_expr_from_ast(ast.parse(left_text, mode="eval"), variable_name)
                right_expr = _linear_expr_from_ast(ast.parse(right_text, mode="eval"), variable_name)
                coefficient = left_expr.coefficient - right_expr.coefficient
                constant = right_expr.constant - left_expr.constant
                if coefficient == 0:
                    if constant == 0:
                        return "That equation has infinitely many solutions."
                    return "That equation has no solution."
                answer = constant / coefficient
                return f"{variable_name} = {_format_number(float(answer))}"
            except Exception:
                return None

    try:
        value = _safe_eval_arithmetic(ast.parse(normalized, mode="eval"))
        return f"{normalized} = {_format_number(float(value))}"
    except Exception:
        return None


HOME_PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The Math Script Chat</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6efe6;
      --panel: rgba(255, 255, 255, 0.78);
      --panel-strong: #ffffff;
      --ink: #1b1f2a;
      --muted: #666a75;
      --accent: #0f766e;
      --accent-2: #d97706;
      --accent-3: #7c3aed;
      --shadow: 0 24px 80px rgba(27, 31, 42, 0.18);
      --radius: 28px;
      --border: rgba(27, 31, 42, 0.1);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Trebuchet MS", "Gill Sans", "Noto Sans", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 28%),
        radial-gradient(circle at top right, rgba(217, 119, 6, 0.18), transparent 22%),
        linear-gradient(135deg, #f8f2ea 0%, #f6efe6 48%, #eef3f5 100%);
    }
    .shell {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 32px;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.05fr 0.95fr;
      gap: 24px;
      align-items: stretch;
    }
    .card {
      background: var(--panel);
      backdrop-filter: blur(22px);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .intro {
      padding: 34px;
      position: relative;
      isolation: isolate;
    }
    .intro::before, .intro::after {
      content: "";
      position: absolute;
      border-radius: 999px;
      pointer-events: none;
      z-index: -1;
    }
    .intro::before {
      width: 220px;
      height: 220px;
      top: -90px;
      right: -70px;
      background: rgba(15, 118, 110, 0.14);
    }
    .intro::after {
      width: 160px;
      height: 160px;
      bottom: -60px;
      left: -40px;
      background: rgba(124, 58, 237, 0.12);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(15, 118, 110, 0.1);
      color: var(--accent);
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      font-weight: 700;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(2.6rem, 5vw, 4.4rem);
      line-height: 0.95;
      margin: 18px 0 18px;
      letter-spacing: -0.04em;
      max-width: 12ch;
    }
    .lead {
      font-size: 1.05rem;
      line-height: 1.65;
      color: var(--muted);
      max-width: 54ch;
      margin: 0 0 22px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 26px;
    }
    .stat {
      background: rgba(255, 255, 255, 0.68);
      border: 1px solid rgba(27, 31, 42, 0.08);
      border-radius: 20px;
      padding: 14px 16px;
    }
    .stat strong {
      display: block;
      font-size: 1.1rem;
      margin-bottom: 4px;
    }
    .stat span {
      display: block;
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.35;
    }
    .chat-card {
      display: flex;
      flex-direction: column;
      min-height: 640px;
      background: var(--panel-strong);
    }
    .chat-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 22px;
      border-bottom: 1px solid rgba(27, 31, 42, 0.08);
    }
    .chat-title {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .chat-title strong {
      font-size: 1.02rem;
    }
    .chat-title span {
      font-size: 0.92rem;
      color: var(--muted);
    }
    .live-pill {
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(15, 118, 110, 0.12);
      color: var(--accent);
      font-size: 0.84rem;
      font-weight: 700;
    }
    .messages {
      flex: 1;
      padding: 20px 20px 8px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background:
        linear-gradient(180deg, rgba(15, 118, 110, 0.03), transparent 24%),
        linear-gradient(180deg, rgba(124, 58, 237, 0.03), transparent 50%);
    }
    .bubble {
      max-width: min(86%, 520px);
      padding: 14px 16px;
      border-radius: 18px;
      line-height: 1.5;
      white-space: pre-wrap;
      animation: rise 180ms ease-out;
    }
    .bubble.user {
      align-self: flex-end;
      background: linear-gradient(135deg, var(--accent), #0ea5a4);
      color: white;
      border-bottom-right-radius: 8px;
    }
    .bubble.assistant {
      align-self: flex-start;
      background: #f2f4f7;
      color: var(--ink);
      border-bottom-left-radius: 8px;
    }
    .bubble.system {
      align-self: center;
      background: rgba(217, 119, 6, 0.12);
      color: #8a4f00;
      font-size: 0.92rem;
    }
    .composer {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 18px;
      border-top: 1px solid rgba(27, 31, 42, 0.08);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.98));
    }
    .composer input {
      width: 100%;
      border: 1px solid rgba(27, 31, 42, 0.16);
      border-radius: 16px;
      padding: 14px 16px;
      font-size: 0.98rem;
      outline: none;
      background: white;
    }
    .composer input:focus {
      border-color: rgba(15, 118, 110, 0.55);
      box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12);
    }
    .composer button {
      border: 0;
      border-radius: 16px;
      padding: 0 18px;
      background: linear-gradient(135deg, var(--accent-3), var(--accent));
      color: white;
      font-weight: 700;
      cursor: pointer;
      min-width: 104px;
      box-shadow: 0 10px 24px rgba(15, 118, 110, 0.22);
    }
    .composer button:disabled {
      opacity: 0.68;
      cursor: not-allowed;
    }
    .booking-link {
      margin: 0 18px 18px;
      display: none;
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(15, 118, 110, 0.08);
      border: 1px solid rgba(15, 118, 110, 0.18);
      color: var(--ink);
    }
    .booking-link a {
      color: var(--accent);
      font-weight: 700;
      text-decoration: none;
    }
    .mini-note {
      margin-top: 18px;
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.55;
    }
    @keyframes rise {
      from { transform: translateY(6px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @media (max-width: 960px) {
      .hero { grid-template-columns: 1fr; }
      .chat-card { min-height: 580px; }
    }
    @media (max-width: 640px) {
      .shell { width: min(100vw - 20px, 1180px); padding: 10px 0 18px; }
      .intro, .chat-top, .messages, .composer { padding-left: 16px; padding-right: 16px; }
      .stats { grid-template-columns: 1fr; }
      .composer { grid-template-columns: 1fr; }
      .composer button { height: 48px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <article class="card intro">
        <div class="eyebrow">Azure chatbot + Zoom scheduling</div>
        <h1>Book a call without leaving the site.</h1>
        <p class="lead">
          Ask questions about the business, then hand the bot your name, email, and preferred time.
          If the Azure scheduler is connected, it will create the Zoom booking and return the link.
        </p>
        <div class="stats">
          <div class="stat"><strong>Azure OpenAI</strong><span>Concise replies from your configured model deployment.</span></div>
          <div class="stat"><strong>Azure Search</strong><span>Answers can come from indexed site knowledge stored in Azure.</span></div>
          <div class="stat"><strong>Zoom booking</strong><span>Hand off to an Azure Function or Logic App that creates the meeting.</span></div>
        </div>
        <p class="mini-note">
          Try: <strong>Can you help me book a Zoom call for next Tuesday afternoon?</strong>
        </p>
      </article>
      <section class="card chat-card" aria-label="Chatbot">
        <div class="chat-top">
          <div class="chat-title">
            <strong>The Math Script Assistant</strong>
            <span>Live booking, concise answers, Azure-backed context</span>
          </div>
          <div class="live-pill">Online</div>
        </div>
        <div class="messages" id="messages"></div>
        <div class="booking-link" id="booking-link"></div>
        <form class="composer" id="composer">
          <input id="message" autocomplete="off" placeholder="Ask a question, enter a math problem, or request a Zoom booking..." />
          <button type="submit" id="send-button">Send</button>
        </form>
      </section>
    </section>
  </main>
  <script>
    const messages = document.getElementById("messages");
    const composer = document.getElementById("composer");
    const input = document.getElementById("message");
    const sendButton = document.getElementById("send-button");
    const bookingLink = document.getElementById("booking-link");
    const storageKey = "mathscript-chat-session-id";
    let sessionId = localStorage.getItem(storageKey) || crypto.randomUUID();
    localStorage.setItem(storageKey, sessionId);

    function addBubble(role, text) {
      const bubble = document.createElement("div");
      bubble.className = `bubble ${role}`;
      bubble.textContent = text;
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
      return bubble;
    }

    function setBookingLink(url) {
      if (!url) {
        bookingLink.style.display = "none";
        bookingLink.innerHTML = "";
        return;
      }
      bookingLink.style.display = "block";
      bookingLink.innerHTML = `Zoom link ready: <a href="${url}" target="_blank" rel="noreferrer">Open meeting</a>`;
    }

    async function sendMessage(text) {
      addBubble("user", text);
      sendButton.disabled = true;
      const loadingBubble = addBubble("assistant", "Thinking...");
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, message: text }),
        });
        const data = await response.json();
        sessionId = data.session_id || sessionId;
        localStorage.setItem(storageKey, sessionId);
        loadingBubble.remove();
        addBubble("assistant", data.reply || "I couldn't generate a response.");
        setBookingLink(data.calendly_url);
      } catch (error) {
        loadingBubble.remove();
        addBubble("system", "The chat service is unavailable right now.");
      } finally {
        sendButton.disabled = false;
        input.focus();
      }
    }

    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      sendMessage(text);
    });

    addBubble("assistant", "Hi. I can answer questions from Azure-backed knowledge and help book a Zoom call. What would you like to do first?");
  </script>
</body>
</html>"""


@router.get("/", response_class=HTMLResponse)
def home() -> HTMLResponse:
    return HTMLResponse(HOME_PAGE)


@router.get("/chat", response_class=HTMLResponse)
def chat_page() -> HTMLResponse:
    return HTMLResponse(HOME_PAGE)


@router.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    session_id, session = _get_session(payload.session_id)
    _update_session_from_message(session, payload)
    session.messages.append({"role": "user", "content": payload.message})
    session.messages[:] = session.messages[-12:]

    math_reply = _solve_math_problem(payload.message)
    if math_reply:
        session.messages.append({"role": "assistant", "content": math_reply})
        return ChatResponse(
            session_id=session_id,
            reply=math_reply,
            intent="math",
            booked=False,
            collected_details=_booking_context_summary(session),
        )

    knowledge_context = _get_search_context(payload.message)
    booking_intent = _looks_like_booking_request(payload.message) or bool(session.name or session.email or session.preferred_time_request)

    if booking_intent:
        missing_fields = _missing_booking_fields(session)
        if missing_fields:
            return ChatResponse(
                session_id=session_id,
                reply=_next_booking_question(missing_fields),
                intent="schedule",
                booked=False,
                calendly_url=_calendly_link() if (settings.calendly_url or settings.scheduling_api_url) else None,
                missing_fields=missing_fields,
                collected_details=_booking_context_summary(session),
            )

        confirmation, calendly_url, _ = _schedule_calendly_call(session)
        session.messages.append({"role": "assistant", "content": confirmation})
        return ChatResponse(
            session_id=session_id,
            reply=confirmation,
            intent="schedule",
            booked=True,
            calendly_url=calendly_url,
            collected_details=_booking_context_summary(session),
        )

    reply = _generate_general_reply(payload.message, knowledge_context)
    session.messages.append({"role": "assistant", "content": reply})
    return ChatResponse(
        session_id=session_id,
        reply=reply,
        intent="general",
        booked=False,
        collected_details=_booking_context_summary(session),
    )


@router.post("/api/schedule-calendly", response_model=CalendlyBookingResponse)
def schedule_calendly() -> CalendlyBookingResponse:
    link = _calendly_link()
    return CalendlyBookingResponse(calendly_url=link, message="Open this Calendly link to book the call.")


app.router.routes.extend(router.routes)