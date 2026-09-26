import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

async function smoke(entrypoint, provider) {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CONTEXT_SELECTOR_PROVIDER: provider,
      CONTEXT_SELECTOR_MODEL: "",
      TYPESAFE_API_KEY: "",
      OPENROUTER_API_KEY: "",
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const lines = createInterface({ input: child.stdout });
  const pending = [];
  lines.on("line", (line) => {
    const waiter = pending.shift();
    if (waiter) waiter.resolve(JSON.parse(line));
  });

  function receive(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for MCP response")), timeoutMs);
      pending.push({
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
      });
    });
  }

  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "codex-jev-smoke", version: "0.1.0" },
      },
    });
    const initialized = await receive();
    if (!initialized.result?.serverInfo) throw new Error(`MCP initialize failed for ${entrypoint} (${provider})`);

    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const listed = await receive();
    const names = listed.result?.tools?.map((tool) => tool.name) ?? [];
    if (names.length !== 1 || names[0] !== "curate_context") {
      throw new Error(`Unexpected tool list for ${entrypoint} (${provider})`);
    }

    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "curate_context",
        arguments: {
          nextTopic: "Continue implementation",
          blocks: [{ id: "b1", role: "user", content: "Keep this instruction." }],
        },
      },
    });
    const called = await receive();
    const result = JSON.parse(called.result.content[0].text);
    if (result.reason !== "missing_api_key" || result.retained.length !== 1) {
      throw new Error(`Fail-safe behavior failed for ${entrypoint} (${provider})`);
    }
  } finally {
    child.stdin.end();
    child.kill();
  }
}

for (const provider of ["typesafe", "openrouter"]) {
  await smoke("plugins/codex-jev/dist/server.mjs", provider);
  await smoke("scripts/hermes-server.mjs", provider);
}
console.error("Codex and Hermes MCP smoke tests passed for TypeSafe and OpenRouter");
