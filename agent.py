import os

from openai import AzureOpenAI

# Azure App Settings / shell environment variables.
AZURE_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", os.getenv("AZURE_API_VERSION", "2024-10-21"))

if not AZURE_ENDPOINT:
    raise RuntimeError("AZURE_OPENAI_ENDPOINT is not set")
if not AZURE_API_KEY:
    raise RuntimeError("AZURE_OPENAI_API_KEY is not set")

client = AzureOpenAI(
    azure_endpoint=AZURE_ENDPOINT,
    api_key=AZURE_API_KEY,
    api_version=AZURE_API_VERSION,
)


MODELS = {
    "1": ("Terra (Balanced)", "gpt-5.6-terra"),
    "2": ("Luna (Fast / Lightweight)", "gpt-5.6-luna"),
    "3": ("Sol (Architect / Heavy)", "gpt-5.6-sol"),
}

BASE_SYSTEM_PROMPT = (
    "You are Luna, an autonomous coding agent running inside an isolated workspace. "
    "You may not claim to run filesystem commands unless the workspace tools are actually available. "
    "When tools are unavailable, give the shortest possible next step and ask for the needed workspace access."
)

print("\n=== Select Model Deployment ===")
for key, (name, model_id) in MODELS.items():
    print(f"[{key}] {name} ({model_id})")

choice = input("\nSelect model [1-3] (default is 1 for Terra): ").strip()
selected_name, selected_model = MODELS.get(choice, MODELS["1"])

print(f"\n[Active Model: {selected_name}]")
print("=== Azure AI Session Online ===")
print("Type 'exit' or press Ctrl+C to quit.\n")

messages = [
    {
        "role": "system",
        "content": BASE_SYSTEM_PROMPT,
    }
]

while True:
    try:
        user_input = input("You > ")
        if user_input.strip().lower() in {"exit", "quit"}:
            print("Goodbye!")
            break
        if not user_input.strip():
            continue

        messages.append({"role": "user", "content": user_input})

        response = client.chat.completions.create(
            model=selected_model,
            messages=messages,
        )

        reply = response.choices[0].message.content or ""
        messages.append({"role": "assistant", "content": reply})
        print(f"\nAgent ({selected_model}) >\n{reply}\n")

    except (KeyboardInterrupt, EOFError):
        print("\nExiting session.")
        break
    except Exception as exc:
        print(f"\nError: {exc}\n")
