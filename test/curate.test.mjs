import test from "node:test";
import assert from "node:assert/strict";
import { curateContext } from "../src/curate.mjs";

const blocks = [
  { id: "old", role: "assistant", content: "Resolved discussion about an unrelated database migration." },
  { id: "decision", role: "user", content: "The next implementation must stay small." },
  { id: "open", role: "context", content: "TODO: verify the Codex plugin manifest.", status: "open" },
];

test("missing key keeps every block", async () => {
  const result = await curateContext({ nextTopic: "Implement the context selector", blocks }, { apiKey: "" });
  assert.equal(result.status, "unchanged");
  assert.equal(result.reason, "missing_api_key");
  assert.deepEqual(result.retained, blocks);
  assert.equal(result.stats.requests, 0);
  assert.equal(result.stats.estimatedOriginalTokens, result.stats.estimatedRetainedTokens);
  assert.equal(result.stats.estimatedTokenReductionPercent, 0);
  assert.equal(result.stats.tokenEstimateMethod, "content_utf8_bytes_divided_by_4");
});

test("drops only high-probability unrelated blocks", async () => {
  const jev = async ({ questions }) => ({
    response: {
      model: "jev-test",
      answers: Object.fromEntries(Object.keys(questions).map((id) => [id, id === "block_0"
        ? { type: "choice", choice: "drop", confidence: 0.98, probabilities: { keep: 0.02, drop: 0.98 } }
        : { type: "choice", choice: "keep", confidence: 0.9, probabilities: { keep: 0.95, drop: 0.05 } }])),
      usage: { input_tokens: 10, output_tokens: 2 },
    },
    requestId: "req_test",
    latencyMs: 3,
  });

  const result = await curateContext(
    { nextTopic: "Implement the context selector", blocks },
    { apiKey: "test-key", jev },
  );

  assert.equal(result.status, "curated");
  assert.deepEqual(result.retained.map((block) => block.id), ["decision", "open"]);
  assert.deepEqual(result.removed.map((item) => item.id), ["old"]);
  assert.equal(result.stats.requests, 1);
  assert.ok(result.stats.estimatedRetainedTokens < result.stats.estimatedOriginalTokens);
  assert.ok(result.stats.estimatedTokenReductionPercent > 0);
});

test("uncertain drop stays in the handoff", async () => {
  const jev = async ({ questions }) => ({
    response: {
      model: "jev-test",
      answers: Object.fromEntries(Object.keys(questions).map((id) => [id, {
        type: "choice",
        choice: "drop",
        confidence: 0.2,
        probabilities: { keep: 0.2, drop: 0.8 },
      }])),
      usage: { input_tokens: 10, output_tokens: 2 },
    },
    latencyMs: 2,
  });

  const result = await curateContext(
    { nextTopic: "Implement the context selector", blocks, dropThreshold: 0.9 },
    { apiKey: "test-key", jev },
  );

  assert.equal(result.status, "unchanged");
  assert.equal(result.retained.length, blocks.length);
});

test("Jev failure keeps every block", async () => {
  const jev = async () => { throw new Error("simulated failure"); };
  const result = await curateContext(
    { nextTopic: "Implement the context selector", blocks },
    { apiKey: "test-key", jev },
  );

  assert.equal(result.reason, "jev_error");
  assert.deepEqual(result.retained, blocks);
  assert.match(result.warning, /Nothing was removed/);
});
