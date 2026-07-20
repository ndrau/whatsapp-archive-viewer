import { execSync, spawnSync } from "node:child_process";

function devServerRunning() {
  try {
    const output = execSync("lsof -ti:3000 2>/dev/null || true", {
      encoding: "utf8",
    }).trim();

    return Boolean(output);
  } catch {
    return false;
  }
}

if (devServerRunning()) {
  console.error("");
  console.error("Production-Build abgebrochen.");
  console.error("Auf Port 3000 läuft noch ein Dev-Server (next dev).");
  console.error("Der teilt sich den Ordner .next – ein paralleler Build zerstört den Cache");
  console.error("und führt zu Internal Server Error (Cannot find module './611.js').");
  console.error("");
  console.error("Bitte zuerst den Dev-Server stoppen, dann erneut pnpm run build ausführen.");
  console.error("Für schnelle Checks während der Entwicklung: pnpm run verify");
  console.error("");
  process.exit(1);
}

const result = spawnSync("next", ["build"], {
  stdio: "inherit",
  shell: false,
});

process.exit(result.status ?? 1);
