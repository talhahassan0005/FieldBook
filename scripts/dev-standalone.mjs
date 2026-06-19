/**
 * One-command local demo: starts a built-in in-memory MongoDB, seeds the
 * sample MATEBELE2022 field book, and runs `next dev` — no MongoDB install needed.
 *
 *   npm run dev:standalone   ->  http://localhost:3000
 *
 * The first run downloads a MongoDB binary (~once); it is cached afterwards.
 * For real/production use, set MONGODB_URI in .env.local and use `npm run dev`.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Invoke node binaries directly (not npm.cmd) — avoids Windows spawn EINVAL.
const node = process.execPath;
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const seedScript = path.join(root, "scripts", "seed.mjs");

console.log("⏳ Starting in-memory MongoDB (first run downloads the binary, please wait)…");
const mongod = await MongoMemoryServer.create({
  instance: { port: 27017, dbName: "cadastral_fieldbook" },
});

// Make every child process use this database.
process.env.MONGODB_URI = mongod.getUri("cadastral_fieldbook");
console.log("✓ MongoDB ready:", process.env.MONGODB_URI);

console.log("🌱 Seeding sample MATEBELE2022 data…");
spawnSync(node, [seedScript], { stdio: "inherit", env: process.env, cwd: root });

console.log("🚀 Starting Next.js dev server… (open http://localhost:3000)\n");
const dev = spawn(node, [nextBin, "dev"], { stdio: "inherit", env: process.env, cwd: root });

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try { dev.kill(); } catch {}
  try { await mongod.stop(); } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
dev.on("exit", shutdown);
