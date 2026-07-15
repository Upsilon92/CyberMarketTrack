#!/bin/sh
# Applies pending database migrations (creates the database on first run),
# then starts the Next.js standalone server.
set -e
npx prisma migrate deploy
exec node server.js
