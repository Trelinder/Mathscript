import os; import re; api_keys = ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY']; [print(f'{key}={value}') for key, value in os.environ.items() if key in api_keys]
