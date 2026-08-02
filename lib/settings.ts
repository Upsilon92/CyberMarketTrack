// =============================================================================
// Generic key/value settings store (Setting table). Values are JSON strings.
// Used for the LLM configuration (key "llm") and the RSS last-run marker
// (key "rss.lastRun").
// =============================================================================
import { prisma } from "@/lib/prisma";

export async function readSetting<T = unknown>(key: string): Promise<T | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await prisma.setting.upsert({
    where: { key },
    update: { value: v },
    create: { key, value: v },
  });
}
