import streamlit as st
import os
from google import genai
import datetime
from fpdf import FPDF

st.set_page_config(page_title="The Math Script: Ultimate Quest", page_icon="🎮", layout="wide")

st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
    .main { background-color: #2d1b00; color: #f5f0e1; }
    h1, h2, h3 {
        font-family: 'Press Start 2P', monospace !important;
        color: #4CAF50 !important;
        text-shadow: 3px 3px 0px #2E7D32, -1px -1px 0px #000 !important;
        letter-spacing: 2px;
    }
    .stButton>button {
        width: 100%; background: linear-gradient(180deg, #4CAF50 0%, #2E7D32 100%);
        color: white; border: 3px solid #1B5E20; padding: 12px; font-size: 16px;
        font-family: 'Press Start 2P', monospace; border-radius: 4px; transition: 0.2s;
        text-shadow: 1px 1px 0px #000;
        box-shadow: inset 0 -4px 0 #1B5E20;
    }
    .stButton>button:hover {
        transform: translateY(-2px);
        box-shadow: inset 0 -4px 0 #1B5E20, 0 4px 8px rgba(0,0,0,0.3);
    }
    .coin-box {
        background: #3E2723; border: 3px solid #FFD54F; padding: 15px;
        border-radius: 4px; text-align: center; margin-bottom: 20px;
        box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
    }
    [data-testid="stSidebar"] {
        background-color: #1a1a2e !important;
        font-family: 'Press Start 2P', monospace;
    }
    .stRadio label, .stTextInput label, .stMetric label, p, li, span {
        font-family: 'Press Start 2P', monospace !important;
        font-size: 11px !important;
    }
    [data-testid="stMetricValue"] {
        font-family: 'Press Start 2P', monospace !important;
        color: #FFD54F !important;
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
    pdf.set_font("Arial", 'B', 16)
    pdf.cell(200, 10, txt="Math Script Progress Report", ln=True, align='C')
    pdf.set_font("Arial", size=12)
    pdf.ln(10)
    for entry in history:
        pdf.cell(0, 10, txt=f"{entry['Time']} - {entry['Concept']} ({entry['Hero']})", ln=True)
    return pdf.output(dest='S').encode('latin-1')

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
    shop_items = {"🔥 Fire Sword": 100, "🛡️ Ice Shield": 150, "✨ Magic Wand": 200, "🦖 Dino Saddle": 300}

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
    "Dino 🦖": "uses prehistoric stomping and fossils"
}

col1, col2 = st.columns([1, 2])
with col1:
    char_choice = st.radio("SELECT YOUR HERO:", list(characters.keys()))
with col2:
    math_input = st.text_input("THE MATH BOSS (Enter Problem):", placeholder="e.g. 12 x 8 or What is a fraction?")

if st.button("⚔️ ATTACK WITH STORY"):
    if math_input:
        with st.spinner('Hero is casting a story spell...'):
            try:
                gear = ", ".join(st.session_state.inventory) if st.session_state.inventory else "bare hands"
                prompt = f"Explain {math_input} using a {char_choice} analogy. The hero is using {gear}. Keep it fun!"

                response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)

                st.session_state.coins += 50
                st.session_state.history.append({
                    "Time": datetime.datetime.now().strftime("%Y-%m-%d"),
                    "Concept": math_input, "Hero": char_choice
                })

                st.markdown("### 📜 THE VICTORY STORY")
                st.write(response.text)
                st.balloons()
                st.toast("Victory! +50 Gold Earned!")
            except Exception as e:
                error_msg = str(e)
                if "FREE_CLOUD_BUDGET_EXCEEDED" in error_msg:
                    st.error("Cloud budget exceeded. Please check your Replit account.")
                else:
                    st.error(f"An error occurred: {e}")
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
