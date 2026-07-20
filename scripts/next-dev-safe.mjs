import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const useTurbo = !args.includes("--webpack");

const nextArgs = ["dev", "--port", "3000"];
if (useTurbo) {
  nextArgs.push("--turbopack");
}

console.log(
  useTurbo
    ? "Starte next dev mit Turbopack (stabilerer Dev-Cache als Webpack-HMR)."
    : "Starte next dev mit Webpack.",
);
console.log("Hinweis: pnpm run build nicht parallel ausführen, solange der Dev-Server läuft.");
console.log("");

const child = spawn("next", nextArgs, {
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
