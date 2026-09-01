#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "→ Type checking..."
npx tsc --noEmit
echo "✓ Types OK"

echo "→ Deploying to production..."
source "$SCRIPT_DIR/../credentials/vercel.env"
vercel --prod --yes --token "$VERCEL_TOKEN"
