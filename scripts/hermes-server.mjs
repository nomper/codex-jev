import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

const configUrl = new URL("../plugins/codex-jev/config.json", import.meta.url);
const config = JSON.parse(await readFile(configUrl, "utf8"));

if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(config.apiKeyEnv)) {
  throw new Error("config.apiKeyEnv is invalid.");
}

// Hermes intentionally filters ambient secrets from stdio MCP processes. Read
// only the configured Jev key from its documented per-user .env file instead.
if (process.env[config.apiKeyEnv] === undefined) {
  const envFiles = [
    process.env.HERMES_HOME ? join(process.env.HERMES_HOME, ".env") : undefined,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "hermes", ".env")
      : undefined,
    join(homedir(), ".hermes", ".env"),
  ].filter(Boolean);

  for (const envFile of new Set(envFiles)) {
    try {
      const parsed = parseEnv((await readFile(envFile, "utf8")).replace(/^\uFEFF/, ""));
      const value = parsed[config.apiKeyEnv];
      if (typeof value === "string" && value.length > 0) {
        process.env[config.apiKeyEnv] = value;
        break;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.error(`Could not read the Hermes environment file: ${error.message}`);
      }
    }
  }
}

await import("../plugins/codex-jev/dist/server.mjs");
