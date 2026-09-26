import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { curateContext } from "./curate.mjs";

async function loadRuntimeConfig() {
  const configUrl = new URL("../config.json", import.meta.url);
  const config = JSON.parse(await readFile(configUrl, "utf8"));
  if (!(["typesafe", "openrouter"].includes(config.provider))) {
    throw new Error("config.provider must be typesafe or openrouter.");
  }
  const selectedProvider = config.providers?.[config.provider];
  if (!selectedProvider) throw new Error(`config.providers.${config.provider} is required.`);
  const endpoint = new URL(selectedProvider.endpoint);

  if (endpoint.protocol !== "https:") throw new Error("config.endpoint must use HTTPS.");
  if (typeof selectedProvider.model !== "string" || selectedProvider.model.length === 0) throw new Error("config.model is required.");
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(selectedProvider.apiKeyEnv)) throw new Error("config.apiKeyEnv is invalid.");
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 30000) {
    throw new Error("config.timeoutMs must be an integer from 1000 through 30000.");
  }

  return {
    provider: config.provider,
    endpoint: endpoint.toString(),
    model: selectedProvider.model,
    apiKeyEnv: selectedProvider.apiKeyEnv,
    timeoutMs: config.timeoutMs,
  };
}

const runtimeConfig = await loadRuntimeConfig();

const blockSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.enum(["system", "developer", "user", "assistant", "tool_call", "tool_result", "context"]),
  content: z.string().min(1).max(20000),
  pin: z.boolean().optional(),
  status: z.enum(["open", "resolved"]).optional(),
  callId: z.string().min(1).max(100).optional(),
});

const inputSchema = z.object({
  nextTopic: z.string().min(1).max(5000).describe("The next topic or step that should receive context."),
  blocks: z.array(blockSchema).min(1).max(100).describe("Ordered, exact conversation blocks to evaluate."),
  dropThreshold: z.number().min(0.7).max(0.99).default(0.9)
    .describe("Only drop a block when Jev's drop probability reaches this value."),
}).superRefine((value, context) => {
  const ids = value.blocks.map((block) => block.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Every block id must be unique.", path: ["blocks"] });
  }
  if (JSON.stringify(value).length > 500000) {
    context.addIssue({ code: "custom", message: "The request is larger than 500,000 characters." });
  }
});

function createServer() {
  const server = new McpServer({ name: "codex-jev", version: "0.1.0" });

  server.registerTool(
    "curate_context",
    {
      description: "Select exact conversation blocks needed for a stated next topic. It creates a handoff packet; it does not edit the active chat history.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      const result = await curateContext(input, {
        apiKey: process.env[runtimeConfig.apiKeyEnv],
        apiKeyEnv: runtimeConfig.apiKeyEnv,
        jevOptions: {
          provider: runtimeConfig.provider,
          endpoint: runtimeConfig.endpoint,
          model: runtimeConfig.model,
          apiKeyEnv: runtimeConfig.apiKeyEnv,
          timeoutMs: runtimeConfig.timeoutMs,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  return server;
}

void serveStdio(createServer);
console.error("codex-jev MCP server running on stdio");
