#!/usr/bin/env node
/**
 * Docker entrypoint:
 * 1) Optional: parse /app/chats → /app/.built/chats
 * 2) Start Next.js standalone server
 *
 * Env:
 *   BUILD_CHATS_ON_START=0  → skip rebuild, use existing .built volume
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const buildOnStart = process.env.BUILD_CHATS_ON_START !== "0";

if (buildOnStart) {
  console.log("[docker] Building chats from /app/chats → /app/.built/chats …");
  const build = spawnSync("tsx", ["scripts/build-chats.ts"], {
    stdio: "inherit",
    env: process.env,
  });
  if ((build.status ?? 1) !== 0) {
    process.exit(build.status ?? 1);
  }
} else {
  console.log("[docker] Skipping chat build (BUILD_CHATS_ON_START=0).");
}

if (!existsSync("server.js")) {
  console.error("[docker] server.js missing — standalone build incomplete.");
  process.exit(1);
}

console.log(`[docker] Starting Next.js on 0.0.0.0:${process.env.PORT ?? 3000}`);

const server = spawnSync(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0",
    PORT: process.env.PORT ?? "3000",
  },
});

process.exit(server.status ?? 1);
