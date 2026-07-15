# =============================================================================
# CyberMarketTrack — multi-stage Docker build.
#
# Stage 1 (deps)    : installs dependencies from the lockfile
# Stage 2 (builder) : generates the Prisma client and builds Next.js
#                     (output: "standalone" -> minimal server bundle)
# Stage 3 (runner)  : slim runtime image; applies pending migrations at
#                     startup then starts the server.
#
# The SQLite database lives in /app/data — mount it as a volume
# (see docker-compose.yml) so the data survives container rebuilds.
#
# Debian-slim (not alpine): better-sqlite3 ships glibc prebuilt binaries,
# avoiding a native compilation toolchain in the image.
# =============================================================================

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL is only needed so the config file resolves during build
ENV DATABASE_URL="file:./data/cybermarkettrack.db"
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone server bundle (server.js + pruned node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma CLI (for `migrate deploy` at startup) + schema + migrations
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
RUN npm install --no-save prisma@^7.8.0 dotenv@^17

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p data

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
