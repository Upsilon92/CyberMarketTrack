// Prisma 7 configuration file (replaces the old package.json "prisma" block).
// The CLI no longer auto-loads .env, hence the explicit dotenv import.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // SQLite database file — a single file under data/, trivial to back up
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: "prisma/migrations",
    // Seed command, run by `npx prisma db seed`
    seed: "tsx prisma/seed.ts",
  },
});
