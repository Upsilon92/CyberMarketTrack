// Frees the dev/prod server port (default 3000) by killing whatever process is
// listening on it. Cross-platform: netstat+taskkill on Windows, lsof+kill on
// POSIX. Run via `npm stop` (optionally `PORT=4000 npm stop`).
import { execSync } from "node:child_process";

const port = Number(process.env.PORT) || 3000;
const isWin = process.platform === "win32";

function pidsOnPort() {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8" });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        // e.g. "  TCP    0.0.0.0:3000   0.0.0.0:0   LISTENING   12345"
        const m = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/);
        if (m && Number(m[1]) === port) pids.add(m[2]);
      }
      return [...pids];
    }
    const out = execSync(`lsof -ti tcp:${port} -s tcp:LISTEN`, { encoding: "utf8" });
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return []; // nothing listening (lsof/netstat exit non-zero when no match)
  }
}

const pids = pidsOnPort();
if (pids.length === 0) {
  console.log(`Port ${port} is already free.`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    if (isWin) execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    else process.kill(Number(pid), "SIGTERM");
    console.log(`Killed process ${pid} on port ${port}.`);
  } catch (e) {
    console.error(`Could not kill process ${pid}: ${e.message}`);
  }
}
