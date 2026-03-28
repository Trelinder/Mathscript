from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

vault_url = "https://mathscriptkey.vault.azure.net/"
credential = DefaultAzureCredential()
client = SecretClient(vault_url=vault_url, credential=credential)

gemini_key = client.get_secret("gemini-api").value
openai_key = client.get_secret("openAI-Api").value

print("Gemini key loaded:", bool(gemini_key))
print("OpenAI key loaded:", bool(openai_key))
