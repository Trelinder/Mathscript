import streamlit as st
import os
from google import genai
from google.genai import types

# 1. Page Config
st.set_page_config(page_title="The Math Script", page_icon="🏫")
st.title("The Math Script 🏫")

# 2. Setup Gemini Client using Replit AI Integrations
# This internally uses Replit AI Integrations for Gemini access, 
# does not require your own API key, and charges are billed to your credits.
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

# 3. App Interface
math_input = st.text_input("What math problem are we stuck on?", placeholder="e.g. Why is 2+2=4?")

if st.button("Generate My Story"):
    if math_input:
        with st.spinner("Thinking of a fun analogy..."):
            try:
                # Using gemini-2.5-flash which is supported by AI integrations
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=f"Explain '{math_input}' using a fun analogy for a kid. Keep it simple and engaging."
                )
                if response.text:
                    st.success("Here's your story!")
                    st.write(response.text)
                else:
                    st.warning("I couldn't generate a story for that. Try a different problem!")
            except Exception as e:
                error_msg = str(e)
                if "FREE_CLOUD_BUDGET_EXCEEDED" in error_msg:
                    st.error("Cloud budget exceeded. Please check your Replit account.")
                else:
                    st.error(f"An error occurred: {e}")
    else:
        st.warning("Please enter a math problem first!")
