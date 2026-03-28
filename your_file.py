from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

vault_url = "https://mathscriptkey.vault.azure.net/"
credential = DefaultAzureCredential()
client = SecretClient(vault_url=vault_url, credential=credential)

GEMINI_API_KEY = client.get_secret("gemini-api").value
OPENAI_API_KEY = client.get_secret("openAI-Api").value
