#!/bin/bash
# Add MINIMAX_API_KEY as a GitHub secret using GitHub's public-key encryption.
# Requires: Python 3 with pynacl OR Node.js with tweetnacl.
# Falls back to printing a curl payload you can paste.
#
# Usage: MINIMAX_API_KEY=sk-... ./scripts/add-secret.sh

set -e

REPO="${REPO:-yip-lgtm/seven-steps}"
GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-${GH_PERSONAL_ACCESS_TOKEN:-}}}"
SECRET_NAME="${SECRET_NAME:-MINIMAX_API_KEY}"
SECRET_VALUE="${MINIMAX_API_KEY:?must set MINIMAX_API_KEY env var}"

if [ -z "$GH_TOKEN" ]; then
  echo "GH_TOKEN not set. Set GH_TOKEN (or GITHUB_TOKEN) to a GitHub PAT with 'secrets: write'."
  exit 1
fi

# Get public key
PUBKEY_JSON=$(curl -sS -H "Authorization: token $GH_TOKEN" \
  "https://api.github.com/repos/$REPO/actions/secrets/public-key")
KEY_ID=$(echo "$PUBKEY_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0)).key_id)")
KEY=$(echo "$PUBKEY_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0)).key)")

if [ -z "$KEY_ID" ] || [ -z "$KEY" ]; then
  echo "Failed to fetch public key:"
  echo "$PUBKEY_JSON"
  exit 1
fi

echo "key_id: $KEY_ID"

# Encrypt with Python (preferred)
if command -v python3 >/dev/null 2>&1; then
  if python3 -c "import nacl" 2>/dev/null; then
    PAYLOAD=$(KEY="$KEY" KEY_ID="$KEY_ID" SECRET_VALUE="$SECRET_VALUE" python3 -c "
import base64, os
from nacl.public import SealedBox, PublicKey
sb = SealedBox(PublicKey(base64.b64decode(os.environ['KEY'])))
enc = sb.encrypt(os.environ['SECRET_VALUE'].encode())
import json
print(json.dumps({'encrypted_value': base64.b64encode(enc).decode(), 'key_id': os.environ['KEY_ID']}))
")
    echo "✓ Encrypted with pynacl"
  else
    echo "pynacl not installed. Install with: pip install pynacl"
    echo "Or use the Web UI: https://github.com/$REPO/settings/secrets/actions"
    exit 1
  fi
else
  echo "Python 3 not available. Use the Web UI: https://github.com/$REPO/settings/secrets/actions"
  exit 1
fi

# Push to GitHub
RESULT=$(curl -sS -X PUT \
  -H "Authorization: token $GH_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$REPO/actions/secrets/$SECRET_NAME" \
  -d "$PAYLOAD")
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" -X PUT \
  -H "Authorization: token $GH_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$REPO/actions/secrets/$SECRET_NAME" \
  -d "$PAYLOAD")

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "204" ]; then
  echo "✓ Secret '$SECRET_NAME' set on $REPO"
else
  echo "✗ Failed (HTTP $HTTP_CODE): $RESULT"
  exit 1
fi
