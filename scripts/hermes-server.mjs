import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

const configUrl = new URL("../plugins/codex-jev/config.json", import.meta.url);
const config = JSON.parse(await readFile(configUrl, "utf8"));

// Hermes intentionally filters ambient secrets from stdio MCP processes. Read
// only the supported selector settings and provider keys from its per-user .env.
const allowedEnvNames = new Set([
  "CONTEXT_SELECTOR_PROVIDER",
  "CONTEXT_SELECTOR_MODEL",
  ...Object.values(config.providers ?? {}).map((provider) => provider.apiKeyEnv),
]);
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
    for (const name of allowedEnvNames) {
      const value = parsed[name];
      if (process.env[name] === undefined && typeof value === "string" && value.length > 0) {
        process.env[name] = value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error(`Could not read the Hermes environment file: ${error.message}`);
    }
  }
}

const selectedProviderName = process.env.CONTEXT_SELECTOR_PROVIDER || config.provider;
const selectedProvider = config.providers?.[selectedProviderName];
if (!selectedProvider || !/^[A-Z][A-Z0-9_]{1,63}$/.test(selectedProvider.apiKeyEnv)) {
  throw new Error("The selected provider configuration is invalid.");
}

await import("../plugins/codex-jev/dist/server.mjs");
