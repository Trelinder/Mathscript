import streamlit as st
import os
import base64
import io
import time
import urllib.parse
from google import genai
from google.genai import types
import datetime
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
    "Wizard 🧙‍♂️": "uses magic potions and spellbooks",
    "Captain 🚀": "uses spaceships and alien technology",
    "Dino 🦖": "uses prehistoric stomping and fossils",
    "Goku 💥": "uses Super Saiyan power, Kamehameha blasts, and martial arts",
    "Ninja 🥷": "uses stealth, shadow clones, and throwing stars",
    "Pirate 🏴‍☠️": "uses treasure maps, cannons, and a mighty ship"
}

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
                prompt = f"Explain {math_input} using a {char_choice} analogy. The hero is using {gear}. Keep it fun!"
                response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)

                st.session_state.coins += 50
                st.session_state.history.append({
                    "Time": datetime.datetime.now().strftime("%Y-%m-%d"),
                    "Concept": math_input, "Hero": char_choice
                })

                st.markdown("### 📜 THE VICTORY STORY")
                st.write(response.text)
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
                    clean_hero = "".join(c for c in char_choice if c.isascii()).strip()
                    image_prompt = f"A colorful cartoon illustration of a {clean_hero} character teaching math, specifically about {math_input}. The hero is holding {gear}. Fun, kid-friendly, vibrant colors, game art style, no text in the image."
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
