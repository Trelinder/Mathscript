#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${ROOT_DIR}/.env}"
VAULT_NAME="${VAULT_NAME:-mathscriptkeynew}"
SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-2a0644bf-8f9b-452d-93cc-815c1d0a98aa}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI (az) is required" >&2
  exit 1
fi

declare -a KEY_MAPPINGS=(
  "AI_INTEGRATIONS_GEMINI_BASE_URL:AI-INTEGRATIONS-GEMINI-BASE-URL"
  "GEMINI_API_KEY:gemini-api"
  "GOOGLE_API_KEY:gemini-api"
  "OPENAI_API_KEY:openAI-Api"
  "AZURE_OPENAI_API_KEY:openAI-Api"
  "AZURE_TTS_OPENAI_ENDPOINT:azure-tts-openai-endpoint"
  "AZURE_TTS_OPENAI_API_KEY:azure-tts-openai-api-key"
  "STRIPE_SECRET_KEY:stripe-secret-key"
  "STRIPE_PUBLISHABLE_KEY:stripe-publishable-key"
  "RESEND_API_KEY:resend-api-key"
  "RESEND_FROM_EMAIL:resend-from-email"
  "FIREBASE_SERVICE_ACCOUNT_JSON:firebase-service-account-json"
  "SESSION_SECRET:session-secret"
  "ADMIN_PASSWORD:admin-password"
)

load_env_value() {
  local key="$1"
  python3 - "$ENV_FILE" "$key" <<'PY'
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
target = sys.argv[2]

for raw_line in env_path.read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    name, value = line.split('=', 1)
    if name.strip() == target:
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        print(value)
        raise SystemExit(0)

raise SystemExit(1)
PY
}

az account set --subscription "${SUBSCRIPTION_ID}" >/dev/null

for mapping in "${KEY_MAPPINGS[@]}"; do
  source_key="${mapping%%:*}"
  vault_secret="${mapping#*:}"

  if ! value="$(load_env_value "${source_key}")"; then
    echo "Skipping missing key: ${source_key}" >&2
    continue
  fi

  if [[ -z "${value}" ]]; then
    echo "Skipping empty key: ${source_key}" >&2
    continue
  fi

  az keyvault secret set \
    --vault "${VAULT_NAME}" \
    --subscription "${SUBSCRIPTION_ID}" \
    --name "${vault_secret}" \
    --value "${value}" \
    >/dev/null

  echo "Uploaded ${source_key} -> ${vault_secret}"
done

echo "Done uploading secrets to ${VAULT_NAME}"