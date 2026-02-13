import os
import io
import re
import base64
import datetime
import wave
import random
import logging
import requests as http_requests
from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from typing import Optional
from google import genai
from google.genai import types
from fpdf import FPDF
from openai import OpenAI

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

app.add_middleware(GZipMiddleware, minimum_size=500)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("REPLIT_DEV_DOMAIN", "*"), os.environ.get("REPL_SLUG", "*")],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        path = request.url.path
        if path.startswith("/assets/") or path.startswith("/images/"):
            response.headers["Cache-Control"] = "public, max-age=604800, immutable"
        else:
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        return response

app.add_middleware(SecurityHeadersMiddleware)

PII_PATTERNS = [
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'), '[REDACTED]'),
    (re.compile(r'\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b'), '[REDACTED]'),
    (re.compile(r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b'), '[REDACTED]'),
    (re.compile(r'\b(?:\d{4}[-\s]?){3}\d{4}\b'), '[REDACTED]'),
    (re.compile(r'\b(?:bearer|token|key|password|secret|auth|credential)[:\s=]+\S+', re.IGNORECASE), '[REDACTED]'),
    (re.compile(r'\b(?:sk-|pk_|api[_-]?key[_-]?|ghp_|gho_|xox[bpas]-)\S+', re.IGNORECASE), '[REDACTED]'),
    (re.compile(r'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'), '[REDACTED]'),
    (re.compile(r'\b[A-Fa-f0-9]{32,}\b'), '[REDACTED]'),
]

def sanitize_input(text: str) -> str:
    if not text:
        return text
    sanitized = text
    for pattern, replacement in PII_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized

def sanitize_error(error: Exception) -> str:
    msg = str(error)
    for pattern, replacement in PII_PATTERNS:
        msg = pattern.sub(replacement, msg)
    return msg

os.environ.setdefault("OPENAI_API_KEY", os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY", ""))
os.environ.setdefault("OPENAI_BASE_URL", os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL", ""))
os.environ.setdefault("GOOGLE_API_KEY", os.environ.get("AI_INTEGRATIONS_GEMINI_API_KEY", ""))

_openai_client = None
_gemini_client = None

def get_openai_client():
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI()
    return _openai_client

def get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        gemini_base = os.environ.get("AI_INTEGRATIONS_GEMINI_BASE_URL", "")
        opts = {'api_version': '', 'base_url': gemini_base} if gemini_base else {'api_version': ''}
        _gemini_client = genai.Client(http_options=opts)
    return _gemini_client

CHARACTERS = {
    "Wizard": {
        "pronouns": "he/his",
        "story": "uses magic potions and spellbooks",
        "look": "an old wizard with a long beard, pointy hat, purple robe, and a glowing staff",
        "emoji": "🧙‍♂️",
        "color": "#7B1FA2",
        "particles": ["✨", "⭐", "🔮", "💫", "🌟"],
        "action": "casting a spell"
    },
    "Goku": {
        "pronouns": "he/his",
        "story": "uses Super Saiyan power, Kamehameha blasts, and martial arts",
        "look": "an anime martial arts fighter with spiky golden hair, orange gi outfit, powering up with energy aura",
        "emoji": "💥",
        "color": "#FF6F00",
        "particles": ["⚡", "💥", "🔥", "💪", "✊"],
        "action": "powering up"
    },
    "Ninja": {
        "pronouns": "he/his",
        "story": "uses stealth, shadow clones, and throwing stars",
        "look": "a masked ninja in black outfit with a headband, holding throwing stars and a katana sword",
        "emoji": "🥷",
        "color": "#37474F",
        "particles": ["💨", "🌀", "⚔️", "🌙", "💫"],
        "action": "throwing stars"
    },
    "Princess": {
        "pronouns": "she/her",
        "story": "uses royal magic, enchanted castles, and fairy tale power",
        "look": "a brave princess in a sparkling pink and gold gown with a tiara, holding a magical scepter",
        "emoji": "👑",
        "color": "#E91E63",
        "particles": ["👑", "💎", "🦋", "🌸", "✨"],
        "action": "casting royal magic"
    },
    "Hulk": {
        "pronouns": "he/his",
        "story": "uses incredible super strength, smashing, and unstoppable power",
        "look": "a massive green muscular superhero with torn purple shorts, clenching his fists and looking powerful",
        "emoji": "💪",
        "color": "#2E7D32",
        "particles": ["💥", "💪", "🪨", "⚡", "🔥"],
        "action": "smashing"
    },
    "Spider-Man": {
        "pronouns": "he/his",
        "story": "uses web-slinging, wall-crawling, and spider senses",
        "look": "a superhero in a red and blue spider suit with web patterns, shooting webs from his wrists",
        "emoji": "🕷️",
        "color": "#D32F2F",
        "particles": ["🕸️", "🕷️", "💫", "⚡", "🌀"],
        "action": "slinging webs"
    },
    "Miles Morales": {
        "pronouns": "he/his",
        "story": "uses venom blasts, invisibility, web-slinging, and spider senses as the new Spider-Man",
        "look": "a young African American Latino teenager superhero in a black spider suit with red web patterns and red spider logo, wearing a hoodie, with electric venom sparks from his hands",
        "emoji": "🕸️",
        "color": "#B71C1C",
        "particles": ["🕸️", "⚡", "💥", "✨", "🌀"],
        "action": "charging a venom blast"
    },
    "Storm": {
        "pronouns": "she/her",
        "story": "uses weather control, lightning bolts, wind gusts, and the power of storms",
        "look": "a powerful African American woman superhero with flowing white mohawk hair, dark brown skin, bright blue eyes, silver and black bodysuit with a cape, summoning lightning",
        "emoji": "⚡",
        "color": "#1565C0",
        "particles": ["⚡", "🌩️", "💨", "🌪️", "✨"],
        "action": "summoning a storm"
    }
}

SHOP_ITEMS = [
    {"id": "fire_sword", "name": "Fire Sword", "emoji": "🗡️🔥", "price": 100},
    {"id": "ice_shield", "name": "Ice Shield", "emoji": "🛡️❄️", "price": 100},
    {"id": "magic_wand", "name": "Magic Wand", "emoji": "🪄✨", "price": 150},
    {"id": "dino_saddle", "name": "Dino Saddle", "emoji": "🦖🪑", "price": 200},
    {"id": "missile_launcher", "name": "Missile Launcher", "emoji": "🚀💣", "price": 250},
    {"id": "lightning_gauntlets", "name": "Lightning Gauntlets", "emoji": "🧤⚡", "price": 300},
]

sessions: dict = {}

def get_session(sid: str):
    if sid not in sessions:
        sessions[sid] = {"coins": 0, "inventory": [], "history": []}
    return sessions[sid]


class StoryRequest(BaseModel):
    hero: str
    problem: str
    session_id: str

class ShopRequest(BaseModel):
    item_id: str
    session_id: str


@app.get("/api/characters")
def get_characters():
    return CHARACTERS

@app.get("/api/shop")
def get_shop():
    return SHOP_ITEMS

@app.get("/api/session/{session_id}")
def get_session_data(session_id: str):
    return get_session(session_id)

class SegmentImageRequest(BaseModel):
    hero: str
    segment_text: str
    segment_index: int
    session_id: str

class BatchSegmentImageRequest(BaseModel):
    hero: str
    segments: list[str]
    session_id: str

class TTSRequest(BaseModel):
    text: str
    voice: str = "Kore"
    voice_id: Optional[str] = None

@app.post("/api/problem-from-image")
async def problem_from_image(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")

    img_base64 = base64.b64encode(contents).decode("utf-8")
    mime = file.content_type or "image/jpeg"

    try:
        response = get_openai_client().chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "user", "content": [
                    {"type": "text", "text": (
                        "Look at this image of a math problem. Extract ONLY the math problem or question from the image. "
                        "Return just the math problem as plain text, nothing else. "
                        "If there are multiple problems, pick the first one. "
                        "If you cannot find a math problem, respond with exactly: NO_PROBLEM_FOUND"
                    )},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_base64}"}}
                ]}
            ],
        )
        problem = response.choices[0].message.content.strip()

        if not problem or "NO_PROBLEM_FOUND" in problem:
            raise HTTPException(status_code=400, detail="Couldn't find a math problem in this photo. Try a clearer picture!")

        return {"problem": problem}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error analyzing image. Please try again.")

@app.post("/api/story")
def generate_story(req: StoryRequest):
    hero = CHARACTERS.get(req.hero)
    if not hero:
        raise HTTPException(status_code=400, detail="Unknown hero")

    session = get_session(req.session_id)
    gear = ", ".join(session["inventory"]) if session["inventory"] else "bare hands"

    try:
        char_pronouns = hero.get('pronouns', 'he/him')
        pronoun_he = char_pronouns.split('/')[0].capitalize()
        pronoun_his = char_pronouns.split('/')[1] if '/' in char_pronouns else 'his'

        safe_problem = sanitize_input(req.problem)

        math_response = get_openai_client().chat.completions.create(
            model="o4-mini",
            messages=[
                {"role": "user", "content": (
                    f"Solve this math problem step by step for a child learning math: {safe_problem}\n\n"
                    f"Format your response EXACTLY like this:\n"
                    f"STEP 1: (first step, simple and clear)\n"
                    f"STEP 2: (next step)\n"
                    f"STEP 3: (next step if needed)\n"
                    f"STEP 4: (next step if needed)\n"
                    f"ANSWER: (the final answer)\n\n"
                    f"Use 2-4 steps. Each step should be one short sentence a child can follow. "
                    f"Use simple math notation. Show the work clearly."
                )}
            ],
        )
        math_solution = math_response.choices[0].message.content or ""

        math_steps = []
        answer_line = ""
        for line in math_solution.split('\n'):
            line = line.strip()
            if line.upper().startswith('STEP'):
                step_text = re.sub(r'^STEP\s*\d+\s*[:\.]\s*', '', line, flags=re.IGNORECASE)
                if step_text:
                    math_steps.append(step_text)
            elif line.upper().startswith('ANSWER'):
                answer_line = re.sub(r'^ANSWER\s*[:\.]\s*', '', line, flags=re.IGNORECASE)

        if not math_steps:
            for line in math_solution.split('\n'):
                line = line.strip()
                if line and not line.upper().startswith('ANSWER'):
                    math_steps.append(line)
        if answer_line and answer_line not in math_steps:
            math_steps.append(f"Answer: {answer_line}")

        prompt = (
            f"You are a fun kids' storyteller. Explain the math concept '{safe_problem}' as a short adventure story "
            f"starring {req.hero} who {hero['story']}. The hero is equipped with {gear}.\n\n"
            f"CRITICAL MATH ACCURACY: A math expert has verified the solution below. You MUST use this exact answer and steps in your story. DO NOT calculate the answer yourself.\n"
            f"Verified solution:\n{math_solution}\n\n"
            f"IMPORTANT: {req.hero} uses {char_pronouns} pronouns. Always refer to {req.hero} as '{pronoun_he}' and '{pronoun_his}' — never use the wrong pronouns.\n\n"
            f"IMPORTANT: Split the story into EXACTLY 4 short paragraphs separated by the delimiter '---SEGMENT---'.\n"
            f"Each paragraph should be 2-3 sentences max, fun, action-packed, and easy for a child to read.\n"
            f"Paragraph 1: The hero discovers the math problem (the challenge appears).\n"
            f"Paragraph 2: The hero uses {pronoun_his} powers to start solving it (show the steps from the verified solution).\n"
            f"Paragraph 3: The hero fights through the tricky part and figures it out.\n"
            f"Paragraph 4: Victory! {pronoun_he} celebrates and reveals the verified correct answer clearly.\n\n"
            f"Do NOT number the paragraphs. Just write them separated by ---SEGMENT---."
        )
        response = get_gemini_client().models.generate_content(model="gemini-2.5-flash", contents=prompt)
        story_text = response.text

        segments = [s.strip() for s in story_text.split('---SEGMENT---') if s.strip()]
        if len(segments) < 2:
            segments = [s.strip() for s in story_text.split('\n\n') if s.strip()]
        if len(segments) > 6:
            segments = segments[:6]
        if len(segments) == 0:
            segments = [story_text]

        session["coins"] += 50
        session["history"].append({
            "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "concept": req.problem,
            "hero": req.hero
        })

        return {"segments": segments, "story": story_text, "coins": session["coins"], "math_steps": math_steps}
    except Exception as e:
        if "FREE_CLOUD_BUDGET_EXCEEDED" in str(e):
            raise HTTPException(status_code=429, detail="Cloud budget exceeded")
        raise HTTPException(status_code=500, detail="Story generation failed. Please try again.")

@app.post("/api/segment-image")
async def generate_segment_image(req: SegmentImageRequest):
    hero = CHARACTERS.get(req.hero)
    if not hero:
        raise HTTPException(status_code=400, detail="Unknown hero")

    scene_moods = [
        "discovering a challenge, looking curious and determined, bright dramatic lighting",
        "using special powers with energy effects, action pose, dynamic movement",
        "in an intense battle or puzzle-solving moment, focused and powerful",
        "celebrating victory with a triumphant pose, confetti and sparkles, joyful"
    ]
    mood = scene_moods[min(req.segment_index, len(scene_moods) - 1)]

    import asyncio
    def _gen_image():
        try:
            image_prompt = (
                f"A colorful cartoon illustration for a children's storybook. "
                f"{hero['look']} {mood}. "
                f"Context: {req.segment_text[:100]}. "
                f"Style: bright, kid-friendly, game art, no text or words in the image."
            )
            response = get_openai_client().images.generate(
                model="dall-e-3",
                prompt=image_prompt,
                size="1024x1024",
                quality="standard",
                n=1,
            )
            image_url = response.data[0].url
            if image_url:
                img_resp = http_requests.get(image_url, timeout=30)
                if img_resp.status_code == 200:
                    image_b64 = base64.b64encode(img_resp.content).decode('utf-8')
                    return {"image": image_b64, "mime": "image/png"}
        except Exception as e:
            logger.warning(f"[IMG] Segment image error: {e}")
            if "FREE_CLOUD_BUDGET_EXCEEDED" in str(e):
                raise HTTPException(status_code=429, detail="Cloud budget exceeded")
        return {"image": None, "mime": None}

    return await asyncio.to_thread(_gen_image)


@app.post("/api/segment-images-batch")
async def generate_segment_images_batch(req: BatchSegmentImageRequest):
    hero = CHARACTERS.get(req.hero)
    if not hero:
        raise HTTPException(status_code=400, detail="Unknown hero")

    scene_moods = [
        "discovering a challenge, looking curious and determined, bright dramatic lighting",
        "using special powers with energy effects, action pose, dynamic movement",
        "in an intense battle or puzzle-solving moment, focused and powerful",
        "celebrating victory with a triumphant pose, confetti and sparkles, joyful"
    ]

    import asyncio
    import concurrent.futures

    def _gen_one(seg_text, seg_idx):
        import time as _time
        mood = scene_moods[min(seg_idx, len(scene_moods) - 1)]
        image_prompt = (
            f"A colorful cartoon illustration for a children's storybook. "
            f"{hero['look']} {mood}. "
            f"Context: {seg_text[:100]}. "
            f"Style: bright, kid-friendly, game art, no text or words in the image."
        )
        for attempt in range(3):
            try:
                logger.warning(f"[IMG] Generating image for segment {seg_idx} (attempt {attempt+1})...")
                response = get_openai_client().images.generate(
                    model="dall-e-3",
                    prompt=image_prompt,
                    size="1024x1024",
                    quality="standard",
                    n=1,
                )
                image_url = response.data[0].url
                if image_url:
                    img_resp = http_requests.get(image_url, timeout=30)
                    if img_resp.status_code == 200:
                        image_b64 = base64.b64encode(img_resp.content).decode('utf-8')
                        logger.warning(f"[IMG] Segment {seg_idx} image generated OK")
                        return {"image": image_b64, "mime": "image/png"}
                logger.warning(f"[IMG] Segment {seg_idx}: no image URL, retrying...")
            except Exception as e:
                logger.warning(f"[IMG] Segment {seg_idx} attempt {attempt+1} error: {e}")
                if "FREE_CLOUD_BUDGET_EXCEEDED" in str(e):
                    return {"image": None, "mime": None, "error": "budget_exceeded"}
            if attempt < 2:
                _time.sleep(1)
        return {"image": None, "mime": None}

    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        tasks = [
            loop.run_in_executor(pool, _gen_one, seg, idx)
            for idx, seg in enumerate(req.segments)
        ]
        results = await asyncio.gather(*tasks)

    return {"images": list(results)}


def _get_elevenlabs_key():
    return os.environ.get("ELEVENLABS_API_KEY", "")

STORYTELLER_VOICES = [
    "pqHfZKP75CvOlQylNhV4",  # Aria - expressive, warm female
    "21m00Tcm4TlvDq8ikWAM",  # Rachel - calm, gentle female
    "nPczCjzI2devNBz1zQrb",  # Bill - trustworthy, warm male
    "N2lVS1w4EtoT3dr4eOWO",  # Brian - deep, warm male
    "XB0fDUnXU5powFXDhCwa",  # Charlie - natural, friendly male
    "iP95p4xoKVk53GoZ742B",  # Charlotte - sweet, young female
]


def math_to_spoken(text):
    t = text
    t = re.sub(r'(\d+)\s*[×x\*]\s*(\d+)', r'\1 times \2', t)
    t = re.sub(r'(\d+)\s*[÷/]\s*(\d+)', r'\1 divided by \2', t)
    t = re.sub(r'(\d+)\s*\+\s*(\d+)', r'\1 plus \2', t)
    t = re.sub(r'(\d+)\s*[-–—]\s*(\d+)', r'\1 minus \2', t)
    t = re.sub(r'(\d+)\s*=\s*(\d+)', r'\1 equals \2', t)
    t = t.replace('%', ' percent')
    t = re.sub(r'(\d+)\s*\^(\d+)', r'\1 to the power of \2', t)
    t = re.sub(r'√(\d+)', r'the square root of \1', t)
    return t


@app.get("/api/tts/voices")
def get_tts_voices():
    return {"voices": STORYTELLER_VOICES}


@app.post("/api/tts")
async def generate_tts(req: TTSRequest):
    import asyncio
    def _gen_audio():
        try:
            voice_id = req.voice_id if req.voice_id and req.voice_id in STORYTELLER_VOICES else random.choice(STORYTELLER_VOICES)
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
            headers = {
                "xi-api-key": _get_elevenlabs_key(),
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            }
            payload = {
                "text": math_to_spoken(req.text),
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.55,
                    "similarity_boost": 0.7,
                    "style": 0.45,
                    "use_speaker_boost": True,
                },
            }
            resp = http_requests.post(url, json=payload, headers=headers, timeout=30)
            if resp.status_code == 200:
                audio_b64 = base64.b64encode(resp.content).decode('utf-8')
                return {"audio": audio_b64, "mime": "audio/mpeg"}
            else:
                pass
        except Exception:
            pass
        return {"audio": None}

    return await asyncio.to_thread(_gen_audio)


@app.post("/api/image")
def generate_image(req: StoryRequest):
    hero = CHARACTERS.get(req.hero)
    if not hero:
        raise HTTPException(status_code=400, detail="Unknown hero")

    session = get_session(req.session_id)
    gear = ", ".join(session["inventory"]) if session["inventory"] else "bare hands"

    max_retries = 3
    for attempt in range(max_retries):
        try:
            image_prompt = f"A colorful cartoon illustration of {hero['look']}, teaching a math lesson about {req.problem}. The character is also equipped with {gear}. The scene is fun, kid-friendly, vibrant colors, game art style. No text or words in the image."
            response = get_openai_client().images.generate(
                model="dall-e-3",
                prompt=image_prompt,
                size="1024x1024",
                quality="standard",
                n=1,
            )
            image_url = response.data[0].url
            if image_url:
                img_resp = http_requests.get(image_url, timeout=30)
                if img_resp.status_code == 200:
                    image_b64 = base64.b64encode(img_resp.content).decode('utf-8')
                    return {"image": image_b64, "mime": "image/png"}
        except Exception as e:
            logger.warning(f"[IMG] Single image error attempt {attempt}: {e}")
            if "FREE_CLOUD_BUDGET_EXCEEDED" in str(e):
                raise HTTPException(status_code=429, detail="Cloud budget exceeded")
            if attempt == max_retries - 1:
                raise HTTPException(status_code=500, detail="Image generation failed")
            import time
            time.sleep(2)

    raise HTTPException(status_code=500, detail="Could not generate image")


@app.post("/api/shop/buy")
def buy_item(req: ShopRequest):
    session = get_session(req.session_id)
    item = next((i for i in SHOP_ITEMS if i["id"] == req.item_id), None)
    if not item:
        raise HTTPException(status_code=400, detail="Unknown item")
    if item["name"] in session["inventory"]:
        raise HTTPException(status_code=400, detail="Already owned")
    if session["coins"] < item["price"]:
        raise HTTPException(status_code=400, detail="Not enough coins")

    session["coins"] -= item["price"]
    session["inventory"].append(item["name"])
    return {"coins": session["coins"], "inventory": session["inventory"]}


@app.get("/api/pdf/{session_id}")
def generate_pdf(session_id: str):
    session = get_session(session_id)
    history = session.get("history", [])

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Math Quest Progress Report", ln=True, align="C")
    pdf.ln(10)

    if history:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(60, 8, "Date", border=1, align="C")
        pdf.cell(70, 8, "Concept", border=1, align="C")
        pdf.cell(60, 8, "Hero", border=1, align="C")
        pdf.ln()
        pdf.set_font("Helvetica", "", 10)
        for entry in history:
            clean_hero = "".join(c for c in entry["hero"] if c.isascii())
            clean_concept = "".join(c for c in entry["concept"] if c.isascii())
            pdf.cell(60, 8, entry["time"], border=1, align="C")
            pdf.cell(70, 8, clean_concept[:30], border=1, align="C")
            pdf.cell(60, 8, clean_hero, border=1, align="C")
            pdf.ln()
    else:
        pdf.cell(0, 10, "No quests completed yet.", ln=True, align="C")

    pdf_bytes = pdf.output()
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=Math_Quest_Report.pdf"})


build_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(build_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(build_dir, "assets")), name="assets")
    images_dir = os.path.join(build_dir, "images")
    if os.path.exists(images_dir):
        app.mount("/images", StaticFiles(directory=images_dir), name="images")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(build_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(build_dir, "index.html"), headers={"Cache-Control": "no-cache"})
