// =============================================================================
// `npm run backup` — timestamped copy of the SQLite file + full JSON export,
// both written into data/backups/. Documented in the README (cron strategy).
// =============================================================================
import "dotenv/config";
import { copyFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { exportDatabase } from "../lib/backup";

async function main() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const url = process.env.DATABASE_URL ?? "file:./data/cybermarkettrack.db";
  const dbPath = path.resolve(process.cwd(), url.replace(/^file:/, ""));
  const backupDir = path.resolve(process.cwd(), "data", "backups");
  await mkdir(backupDir, { recursive: true });

  const dbCopy = path.join(backupDir, `cybermarkettrack-${stamp}.db`);
  await copyFile(dbPath, dbCopy);

  const jsonPath = path.join(backupDir, `cybermarkettrack-${stamp}.json`);
  await writeFile(jsonPath, JSON.stringify(await exportDatabase(), null, 2), "utf8");

  console.log(`Backup done:\n  ${dbCopy}\n  ${jsonPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit());
