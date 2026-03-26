import streamlit as st
import streamlit.components.v1 as components
import os
import base64
import io
import time
import urllib.parse
from google import genai
from google.genai import types
import datetime
import json
import uuid
from fpdf import FPDF

st.set_page_config(page_title="The Math Script: Ultimate Quest", page_icon="🎮", layout="wide")

st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
    .main { background-color: #f0ebe3; color: #333333; }
    h1 {
        font-family: 'Press Start 2P', monospace !important;
        color: #2E7D32 !important;
        text-shadow: 2px 2px 0px #81C784 !important;
        letter-spacing: 1px;
        font-size: 24px !important;
        line-height: 1.6 !important;
    }
    h2, h3 {
        font-family: 'Press Start 2P', monospace !important;
        color: #1565C0 !important;
        text-shadow: 1px 1px 0px #90CAF9 !important;
        letter-spacing: 1px;
        font-size: 16px !important;
        line-height: 1.6 !important;
    }
    .stButton>button {
        width: 100%; background: linear-gradient(180deg, #4CAF50 0%, #388E3C 100%);
        color: white; border: 3px solid #2E7D32; padding: 14px; font-size: 14px;
        font-family: 'Press Start 2P', monospace; border-radius: 4px; transition: 0.2s;
        text-shadow: 1px 1px 0px rgba(0,0,0,0.4);
        box-shadow: inset 0 -4px 0 #1B5E20;
        line-height: 1.5;
    }
    .stButton>button:hover {
        transform: translateY(-2px);
        box-shadow: inset 0 -4px 0 #1B5E20, 0 4px 8px rgba(0,0,0,0.2);
    }
    .coin-box {
        background: #FFF8E1; border: 3px solid #FFB300; padding: 15px;
        border-radius: 4px; text-align: center; margin-bottom: 20px;
    }
    [data-testid="stSidebar"] {
        background-color: #E8F5E9 !important;
    }
    p, li {
        font-family: 'Segoe UI', Arial, sans-serif !important;
        font-size: 16px !important;
        line-height: 1.8 !important;
        color: #333 !important;
    }
    .stRadio label, .stTextInput label, .stMetric label {
        font-family: 'Press Start 2P', monospace !important;
        font-size: 12px !important;
        line-height: 1.6 !important;
        color: #444 !important;
    }
    [data-testid="stMetricValue"] {
        font-family: 'Press Start 2P', monospace !important;
        color: #E65100 !important;
        font-size: 20px !important;
    }
    </style>
    """, unsafe_allow_html=True)

if 'coins' not in st.session_state: st.session_state.coins = 0
if 'inventory' not in st.session_state: st.session_state.inventory = []
if 'history' not in st.session_state: st.session_state.history = []
if 'onboarded' not in st.session_state: st.session_state.onboarded = False

def generate_pdf(history):
    pdf = FPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", 'B', 16)
    pdf.cell(200, 10, txt="Math Script: Progress Report", ln=True, align='C')
    pdf.ln(10)

    pdf.set_font("Helvetica", size=12)

    for entry in history:
        clean_concept = "".join(c for c in entry['Concept'] if c.isascii())
        clean_hero = "".join(c for c in entry['Hero'] if c.isascii())

        text_line = f"{entry['Time']} - {clean_concept} ({clean_hero})"
        pdf.cell(0, 10, txt=text_line, ln=True)

    return pdf.output()

if not st.session_state.onboarded:
    st.title("🚀 WELCOME TO THE MATH SCRIPT")
    st.markdown("""
    ### Your mission, should you choose to accept it:
    1. **Choose a Hero** to guide you through the Math Realms.
    2. **Fight Math Bosses** by turning scary problems into fun stories.
    3. **Earn Gold** to buy legendary gear in the Hero's Shop.
    4. **Level Up** your brain!
    """)
    if st.button("START MY FIRST MISSION"):
        st.session_state.onboarded = True
        st.rerun()
    st.stop()

with st.sidebar:
    st.title("💰 TREASURY")
    st.metric("Gold Coins", f"{st.session_state.coins}G")

    st.markdown("---")
    st.header("🛒 HERO'S SHOP")
    shop_items = {"🔥 Fire Sword": 100, "🛡️ Ice Shield": 150, "✨ Magic Wand": 200, "🦖 Dino Saddle": 300, "🚀 Missile Launcher": 250, "⚡ Lightning Gauntlets": 350}

    for item, price in shop_items.items():
        if item in st.session_state.inventory:
            st.button(f"OWNED: {item}", disabled=True)
        else:
            if st.button(f"Buy {item} ({price}G)"):
                if st.session_state.coins >= price:
                    st.session_state.coins -= price
                    st.session_state.inventory.append(item)
                    st.toast(f"Unlocking {item}...")
                    st.rerun()
                else:
                    st.error("Need more Gold!")

    st.markdown("---")
    st.header("🎒 INVENTORY")
    if st.session_state.inventory:
        for i in st.session_state.inventory: st.write(f"✅ {i}")
    else: st.write("Empty...")

st.title("🛡️ THE MATH QUEST")

AI_INTEGRATIONS_GEMINI_API_KEY = os.environ.get("AI_INTEGRATIONS_GEMINI_API_KEY")
AI_INTEGRATIONS_GEMINI_BASE_URL = os.environ.get("AI_INTEGRATIONS_GEMINI_BASE_URL")

if not AI_INTEGRATIONS_GEMINI_API_KEY or not AI_INTEGRATIONS_GEMINI_BASE_URL:
    st.error("Gemini integration is not fully configured. Please wait for the setup to complete.")
    st.stop()

client = genai.Client(
    api_key=AI_INTEGRATIONS_GEMINI_API_KEY,
    http_options={
        'api_version': '',
        'base_url': AI_INTEGRATIONS_GEMINI_BASE_URL
    }
)

characters = {
    "Wizard 🧙‍♂️": {
        "story": "uses magic potions and spellbooks",
        "look": "an old wizard with a long beard, pointy hat, purple robe, and a glowing staff",
        "emoji": "🧙‍♂️",
        "color": "#7B1FA2",
        "particles": ["✨", "⭐", "🔮", "💫", "🌟"],
        "action": "casting a spell"
    },
    "Goku 💥": {
        "story": "uses Super Saiyan power, Kamehameha blasts, and martial arts",
        "look": "an anime martial arts fighter with spiky golden hair, orange gi outfit, powering up with energy aura",
        "emoji": "💥",
        "color": "#FF6F00",
        "particles": ["⚡", "💥", "🔥", "💪", "✊"],
        "action": "powering up"
    },
    "Ninja 🥷": {
        "story": "uses stealth, shadow clones, and throwing stars",
        "look": "a masked ninja in black outfit with a headband, holding throwing stars and a katana sword",
        "emoji": "🥷",
        "color": "#37474F",
        "particles": ["💨", "🌀", "⚔️", "🌙", "💫"],
        "action": "throwing stars"
    },
    "Princess 👑": {
        "story": "uses royal magic, enchanted castles, and fairy tale power",
        "look": "a brave princess in a sparkling pink and gold gown with a tiara, holding a magical scepter",
        "emoji": "👑",
        "color": "#E91E63",
        "particles": ["👑", "💎", "🦋", "🌸", "✨"],
        "action": "casting royal magic"
    },
    "Hulk 💪": {
        "story": "uses incredible super strength, smashing, and unstoppable power",
        "look": "a massive green muscular superhero with torn purple shorts, clenching his fists and looking powerful",
        "emoji": "💪",
        "color": "#2E7D32",
        "particles": ["💥", "💪", "🪨", "⚡", "🔥"],
        "action": "smashing"
    },
    "Spider-Man 🕷️": {
        "story": "uses web-slinging, wall-crawling, and spider senses",
        "look": "a superhero in a red and blue spider suit with web patterns, shooting webs from his wrists",
        "emoji": "🕷️",
        "color": "#D32F2F",
        "particles": ["🕸️", "🕷️", "💫", "⚡", "🌀"],
        "action": "slinging webs"
    }
}

def get_hero_animation_html(hero_name, hero_data, story_text):
    emoji = hero_data["emoji"]
    color = hero_data["color"]
    particles = hero_data["particles"]
    action = hero_data["action"]
    clean_name = "".join(c for c in hero_name if c.isascii()).strip()

    uid = uuid.uuid4().hex[:8]

    story_json = json.dumps(story_text)
    particles_json = json.dumps(particles)

    html = f"""
    <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
    <div id="scene-{uid}" style="
        background: linear-gradient(135deg, {color}15, {color}30);
        border: 3px solid {color};
        border-radius: 12px;
        padding: 20px;
        margin: 10px 0;
        position: relative;
        overflow: hidden;
        min-height: 280px;
    ">
        <div id="particles-{uid}" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;"></div>

        <div id="hero-{uid}" style="
            font-size: 80px;
            text-align: center;
            position: relative;
            z-index: 2;
            animation: heroEntrance_{uid} 1s ease-out, heroFloat_{uid} 3s ease-in-out infinite 1s;
        ">{emoji}</div>

        <div id="action-{uid}" style="
            text-align: center;
            font-family: 'Press Start 2P', monospace;
            font-size: 14px;
            color: {color};
            margin: 10px 0;
            opacity: 0;
            animation: fadeSlideUp_{uid} 0.8s ease-out 0.5s forwards, pulse_{uid} 2s ease-in-out infinite 1.3s;
            position: relative;
            z-index: 2;
        ">{clean_name} is {action}!</div>

        <div style="
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 16px;
            line-height: 1.8;
            color: #333;
            padding: 15px;
            background: rgba(255,255,255,0.85);
            border-radius: 8px;
            margin-top: 15px;
            position: relative;
            z-index: 2;
            border-left: 4px solid {color};
        ">
            <div id="typed-{uid}" style="min-height: 50px;"></div>
        </div>
    </div>

    <style>
        @keyframes heroEntrance_{uid} {{
            0% {{ transform: translateY(-100px) scale(0); opacity: 0; }}
            50% {{ transform: translateY(20px) scale(1.3); opacity: 1; }}
            100% {{ transform: translateY(0) scale(1); opacity: 1; }}
        }}
        @keyframes heroFloat_{uid} {{
            0%, 100% {{ transform: translateY(0) rotate(0deg); }}
            25% {{ transform: translateY(-15px) rotate(5deg); }}
            75% {{ transform: translateY(-15px) rotate(-5deg); }}
        }}
        @keyframes fadeSlideUp_{uid} {{
            from {{ opacity: 0; transform: translateY(20px); }}
            to {{ opacity: 1; transform: translateY(0); }}
        }}
        @keyframes particleFly_{uid} {{
            0% {{ opacity: 1; transform: translate(0, 0) scale(1); }}
            100% {{ opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0.3); }}
        }}
        @keyframes pulse_{uid} {{
            0%, 100% {{ text-shadow: 0 0 5px {color}; }}
            50% {{ text-shadow: 0 0 20px {color}, 0 0 30px {color}88; }}
        }}
    </style>

    <script>
        (function() {{
            const storyData = {story_json};
            const particles = {particles_json};
            const container = document.getElementById('particles-{uid}');
            const typedEl = document.getElementById('typed-{uid}');

            function spawnParticle() {{
                const p = document.createElement('div');
                p.textContent = particles[Math.floor(Math.random() * particles.length)];
                p.style.cssText = `
                    position: absolute;
                    font-size: ${{18 + Math.random() * 24}}px;
                    left: ${{Math.random() * 90}}%;
                    top: ${{Math.random() * 90}}%;
                    pointer-events: none;
                    --tx: ${{(Math.random() - 0.5) * 200}}px;
                    --ty: ${{-50 - Math.random() * 150}}px;
                    animation: particleFly_{uid} ${{1.5 + Math.random() * 2}}s ease-out forwards;
                `;
                container.appendChild(p);
                setTimeout(() => p.remove(), 3500);
            }}

            let particleInterval = setInterval(spawnParticle, 300);
            setTimeout(() => {{
                clearInterval(particleInterval);
                particleInterval = setInterval(spawnParticle, 2000);
            }}, 5000);

            const lines = storyData.split('\\n');
            let lineIdx = 0;
            let charIdx = 0;
            const speed = 12;
            function typeWriter() {{
                if (lineIdx < lines.length) {{
                    if (charIdx < lines[lineIdx].length) {{
                        typedEl.appendChild(document.createTextNode(lines[lineIdx].charAt(charIdx)));
                        charIdx++;
                        setTimeout(typeWriter, speed);
                    }} else {{
                        typedEl.appendChild(document.createElement('br'));
                        lineIdx++;
                        charIdx = 0;
                        setTimeout(typeWriter, speed * 3);
                    }}
                }}
            }}
            setTimeout(typeWriter, 1200);
        }})();
    </script>
    """
    return html

col1, col2 = st.columns([1, 2])
with col1:
    char_choice = st.radio("SELECT YOUR HERO:", list(characters.keys()))
with col2:
    math_input = st.text_input("THE MATH BOSS (Enter Problem):", placeholder="e.g. 12 x 8 or What is a fraction?")

if st.button("⚔️ ATTACK WITH STORY"):
    if math_input:
        gear = ", ".join(st.session_state.inventory) if st.session_state.inventory else "bare hands"

        with st.spinner('Hero is casting a story spell...'):
            try:
                hero_info = characters[char_choice]
                prompt = f"Explain {math_input} using a {char_choice} analogy. The hero {hero_info['story']}. The hero is using {gear}. Keep it fun!"
                response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)

                st.session_state.coins += 50
                st.session_state.history.append({
                    "Time": datetime.datetime.now().strftime("%Y-%m-%d"),
                    "Concept": math_input, "Hero": char_choice
                })

                st.markdown("### 📜 THE VICTORY STORY")
                story_html = get_hero_animation_html(char_choice, hero_info, response.text)
                components.html(story_html, height=600, scrolling=True)
            except Exception as e:
                error_msg = str(e)
                if "FREE_CLOUD_BUDGET_EXCEEDED" in error_msg:
                    st.error("Cloud budget exceeded. Please check your Replit account.")
                else:
                    st.error(f"Story error: {e}")

        with st.spinner('Drawing a victory scene...'):
            image_generated = False
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    hero_info = characters[char_choice]
                    hero_look = hero_info["look"]
                    image_prompt = f"A colorful cartoon illustration of {hero_look}, teaching a math lesson about {math_input}. The character is also equipped with {gear}. The scene is fun, kid-friendly, vibrant colors, game art style. No text or words in the image."
                    image_response = client.models.generate_content(
                        model="gemini-2.5-flash-image",
                        contents=image_prompt,
                        config=types.GenerateContentConfig(
                            response_modalities=["TEXT", "IMAGE"]
                        )
                    )

                    if image_response.candidates:
                        candidate = image_response.candidates[0]
                        if candidate.content and candidate.content.parts:
                            for part in candidate.content.parts:
                                if hasattr(part, 'inline_data') and part.inline_data:
                                    image_data = part.inline_data.data
                                    if isinstance(image_data, str):
                                        image_data = base64.b64decode(image_data)
                                    st.markdown("### 🎨 VICTORY SCENE")
                                    st.image(image_data, use_container_width=True)
                                    image_generated = True
                                    break
                    if image_generated:
                        break
                except Exception as e:
                    error_msg = str(e)
                    if "FREE_CLOUD_BUDGET_EXCEEDED" in error_msg:
                        st.error("Cloud budget exceeded. Please check your Replit account.")
                        break
                    if attempt < max_retries - 1:
                        time.sleep(2)
                    else:
                        st.caption("Could not generate an image this time. Keep questing!")

        st.markdown("### 🎬 WATCH A VIDEO")
        safe_query = urllib.parse.quote_plus(f"math for kids {math_input}")
        video_url = f"https://www.youtube.com/results?search_query={safe_query}"
        st.markdown(
            f'<a href="{video_url}" target="_blank" style="'
            f'display:inline-block; padding:12px 24px; background:linear-gradient(180deg,#FF0000,#CC0000);'
            f'color:white; text-decoration:none; border-radius:4px; font-family:Press Start 2P,monospace;'
            f'font-size:12px; border:3px solid #990000; box-shadow:inset 0 -3px 0 #990000;'
            f'">▶ Watch Math Videos on YouTube</a>',
            unsafe_allow_html=True
        )

        st.balloons()
        st.toast("Victory! +50 Gold Earned!")
    else:
        st.warning("Enter a math problem to begin!")

st.markdown("<br><br>", unsafe_allow_html=True)
with st.expander("🔐 PARENT COMMAND CENTER"):
    if st.session_state.history:
        st.table(st.session_state.history)
        if st.download_button("📄 Download PDF Report", data=generate_pdf(st.session_state.history),
                              file_name="Math_Quest_Report.pdf", mime="application/pdf"):
            st.success("Report Generated!")
    else:
        st.write("No data yet. Start a quest to see progress!")
