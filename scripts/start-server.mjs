import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

const root = process.cwd();
const buildDir = path.join(root, ".next");
const standaloneDir = path.join(buildDir, "standalone");
const standaloneServer = path.join(standaloneDir, "server.js");
const standaloneNextDir = path.join(standaloneDir, ".next");
const standaloneStaticDir = path.join(standaloneNextDir, "static");
const buildStaticDir = path.join(buildDir, "static");
const publicDir = path.join(root, "public");
const standalonePublicDir = path.join(standaloneDir, "public");

// Local starts should prefer the developer's .env values over .env.production.
dotenv.config({
  path: path.join(root, ".env"),
  override: true,
});

if (!existsSync(path.join(buildDir, "BUILD_ID"))) {
  console.error("No Next production build found in .next. Run `npm run build` first.");
  process.exit(1);
}

if (!existsSync(standaloneServer)) {
  console.error("No standalone server build found. Run `npm run build` first.");
  process.exit(1);
}

if (existsSync(buildStaticDir)) {
  cpSync(buildStaticDir, standaloneStaticDir, {
    force: true,
    recursive: true,
  });
}

if (existsSync(publicDir)) {
  cpSync(publicDir, standalonePublicDir, {
    force: true,
    recursive: true,
  });
}

const child = spawn(process.execPath, [standaloneServer], {
  cwd: standaloneDir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
