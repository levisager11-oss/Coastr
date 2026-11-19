#!/usr/bin/env bash
# Upload the room relay to Cloudflare as the Worker "coastr-rooms".
# Needs CF_ACCOUNT (account id) and a token with Workers rights in CF_TOKEN
# (in a session where the Cloudflare API is already authorised, any value works for CF_TOKEN).
set -euo pipefail
cd "$(dirname "$0")"
: "${CF_ACCOUNT:?set CF_ACCOUNT to the Cloudflare account id}"
: "${CF_TOKEN:=unused}"
API="https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/workers/scripts/coastr-rooms"
# The migration only runs the first time; later uploads keep the same Durable Object class.
if curl -fsS -H "Authorization: Bearer $CF_TOKEN" "$API/settings" >/dev/null 2>&1; then
  MIG=''
else
  MIG=',"migrations":{"new_tag":"v1","new_sqlite_classes":["Room"]}'
fi
META='{"main_module":"rooms.js","compatibility_date":"2025-09-01","bindings":[{"type":"durable_object_namespace","name":"ROOMS","class_name":"Room"}]'"$MIG"'}'
curl -fsS -X PUT "$API" -H "Authorization: Bearer $CF_TOKEN" \
  -F "metadata=$META;type=application/json" \
  -F "rooms.js=@rooms.js;type=application/javascript+module" | head -c 400; echo
# make sure it answers on workers.dev
curl -fsS -X POST "$API/subdomain" -H "Authorization: Bearer $CF_TOKEN" -H 'content-type: application/json' -d '{"enabled":true}' >/dev/null
echo "deployed"
