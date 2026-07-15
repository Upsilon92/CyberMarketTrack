// =============================================================================
// Prisma client singleton.
//
// Prisma 7: the client is generated into lib/generated/prisma and connects to
// SQLite through the better-sqlite3 driver adapter. The globalThis trick avoids
// exhausting connections during `next dev` hot reloads.
// =============================================================================
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./data/cybermarkettrack.db",
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
