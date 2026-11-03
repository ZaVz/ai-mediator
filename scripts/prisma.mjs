// Prisma CLI does not load .env.local by default; use Next's own env loader.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd(), true);
const result = spawnSync(
  process.execPath,
  [require.resolve("prisma/build/index.js"), ...process.argv.slice(2)],
  {
    // Prisma 5's schema engine returned a blank error on fresh SQLite creation
    // in this macOS/Node 24 environment unless an explicit log filter was set.
    stdio: "inherit",
    env: { ...process.env, RUST_LOG: "info" },
  },
);
process.exit(result.status ?? 1);
