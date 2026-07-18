#!/bin/sh
# Startup:
#   1. Ensure an AUTH_SECRET exists — if none was provided, generate a random
#      one and persist it in the data volume (data/.auth_secret) so sessions
#      survive restarts and rebuilds. This means NO .env file is required to
#      deploy: the only truly secret value is created automatically.
#   2. Apply pending database migrations (creates the database on first run).
#   3. Start the Next.js standalone server.
set -e

if [ -z "$AUTH_SECRET" ]; then
  SECRET_FILE=/app/data/.auth_secret
  if [ ! -f "$SECRET_FILE" ]; then
    node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" > "$SECRET_FILE"
    echo "Generated a new AUTH_SECRET (persisted in data/.auth_secret)."
  fi
  AUTH_SECRET="$(cat "$SECRET_FILE")"
  export AUTH_SECRET
fi

npx prisma migrate deploy
exec node server.js
