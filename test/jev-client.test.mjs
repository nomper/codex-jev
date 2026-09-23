import test from "node:test";
import assert from "node:assert/strict";
import { callJev, JevRequestError, validateJevResponse } from "../src/jev-client.mjs";

const questions = {
  relevant: {
    type: "choice",
    instructions: "Keep or drop?",
    criteria: { keep: "Needed", drop: "Not needed" },
  },
};

test("accepts a valid Jev response", () => {
  const payload = {
    model: "jev-1.13.0",
    answers: {
      relevant: {
        type: "choice",
        choice: "keep",
        confidence: 0.8,
        probabilities: { keep: 0.9, drop: 0.1 },
      },
    },
    usage: { input_tokens: 100, output_tokens: 20 },
  };
  assert.equal(validateJevResponse(payload, questions), payload);
});

test("rejects missing answers", () => {
  assert.throws(
    () => validateJevResponse({ model: "jev-test", answers: {} }, questions),
    (error) => error instanceof JevRequestError && error.code === "INVALID_RESPONSE",
  );
});

test("rejects malformed probability distributions", () => {
  const payload = {
    model: "jev-test",
    answers: {
      relevant: {
        type: "choice",
        choice: "keep",
        confidence: 0.5,
        probabilities: { keep: 0.9, drop: 0.9 },
      },
    },
  };
  assert.throws(() => validateJevResponse(payload, questions), JevRequestError);
});

test("uses the configured endpoint and model", async () => {
  let capturedUrl;
  let capturedBody;
  const fetchImpl = async (url, options) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => "req_config" },
      json: async () => ({
        model: "jev-custom-result",
        answers: {
          relevant: {
            type: "choice",
            choice: "keep",
            confidence: 1,
            probabilities: { keep: 1, drop: 0 },
          },
        },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    };
  };

  await callJev({
    apiKey: "test-key",
    endpoint: "https://example.invalid/v1/systemone",
    model: "jev-custom",
    state: "test",
    questions,
    fetchImpl,
  });

  assert.equal(capturedUrl, "https://example.invalid/v1/systemone");
  assert.equal(capturedBody.model, "jev-custom");
});
