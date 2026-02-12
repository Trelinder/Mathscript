import os
import io
import base64
import datetime
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from typing import Optional
from google import genai
from google.genai import types
from fpdf import FPDF

app = FastAPI()

client = genai.Client(
    api_key=os.environ.get("AI_INTEGRATIONS_GEMINI_API_KEY", ""),
    http_options={
        'api_version': '',
        'base_url': os.environ.get("AI_INTEGRATIONS_GEMINI_BASE_URL", "")
    }
)

CHARACTERS = {
    "Wizard": {
        "story": "uses magic potions and spellbooks",
        "look": "an old wizard with a long beard, pointy hat, purple robe, and a glowing staff",
        "emoji": "🧙‍♂️",
        "color": "#7B1FA2",
        "particles": ["✨", "⭐", "🔮", "💫", "🌟"],
        "action": "casting a spell"
    },
    "Goku": {
        "story": "uses Super Saiyan power, Kamehameha blasts, and martial arts",
        "look": "an anime martial arts fighter with spiky golden hair, orange gi outfit, powering up with energy aura",
        "emoji": "💥",
        "color": "#FF6F00",
        "particles": ["⚡", "💥", "🔥", "💪", "✊"],
        "action": "powering up"
    },
    "Ninja": {
        "story": "uses stealth, shadow clones, and throwing stars",
        "look": "a masked ninja in black outfit with a headband, holding throwing stars and a katana sword",
        "emoji": "🥷",
        "color": "#37474F",
        "particles": ["💨", "🌀", "⚔️", "🌙", "💫"],
        "action": "throwing stars"
    },
    "Princess": {
        "story": "uses royal magic, enchanted castles, and fairy tale power",
        "look": "a brave princess in a sparkling pink and gold gown with a tiara, holding a magical scepter",
        "emoji": "👑",
        "color": "#E91E63",
        "particles": ["👑", "💎", "🦋", "🌸", "✨"],
        "action": "casting royal magic"
    },
    "Hulk": {
        "story": "uses incredible super strength, smashing, and unstoppable power",
        "look": "a massive green muscular superhero with torn purple shorts, clenching his fists and looking powerful",
        "emoji": "💪",
        "color": "#2E7D32",
        "particles": ["💥", "💪", "🪨", "⚡", "🔥"],
        "action": "smashing"
    },
    "Spider-Man": {
        "story": "uses web-slinging, wall-crawling, and spider senses",
        "look": "a superhero in a red and blue spider suit with web patterns, shooting webs from his wrists",
        "emoji": "🕷️",
        "color": "#D32F2F",
        "particles": ["🕸️", "🕷️", "💫", "⚡", "🌀"],
        "action": "slinging webs"
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

@app.post("/api/story")
def generate_story(req: StoryRequest):
    hero = CHARACTERS.get(req.hero)
    if not hero:
        raise HTTPException(status_code=400, detail="Unknown hero")

    session = get_session(req.session_id)
    gear = ", ".join(session["inventory"]) if session["inventory"] else "bare hands"

    try:
        prompt = f"Explain {req.problem} using a {req.hero} analogy. The hero {hero['story']}. The hero is using {gear}. Keep it fun and engaging for kids! Use action words and make the character do things related to their powers."
        response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        story_text = response.text

        session["coins"] += 50
        session["history"].append({
            "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "concept": req.problem,
            "hero": req.hero
        })

        return {"story": story_text, "coins": session["coins"]}
    except Exception as e:
        error_msg = str(e)
        if "FREE_CLOUD_BUDGET_EXCEEDED" in error_msg:
            raise HTTPException(status_code=429, detail="Cloud budget exceeded")
        raise HTTPException(status_code=500, detail=f"Story generation failed: {error_msg}")


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
            image_response = client.models.generate_content(
                model="gemini-2.5-flash-image",
                contents=image_prompt,
                config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
            )

            if image_response.candidates:
                candidate = image_response.candidates[0]
                if candidate.content and candidate.content.parts:
                    for part in candidate.content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            image_data = part.inline_data.data
                            if isinstance(image_data, bytes):
                                image_data = base64.b64encode(image_data).decode('utf-8')
                            return {"image": image_data, "mime": part.inline_data.mime_type or "image/png"}
        except Exception as e:
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

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(build_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(build_dir, "index.html"), headers={"Cache-Control": "no-cache"})
