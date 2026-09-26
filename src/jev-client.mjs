const DEFAULT_JEV_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/alpha/decisions";

export class JevRequestError extends Error {
  constructor(message, { code, status, requestId } = {}) {
    super(message);
    this.name = "JevRequestError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numberInUnitRange(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function sameKeys(actual, expected) {
  const left = [...Object.keys(actual)].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function validateDistribution(probabilities, expectedKeys) {
  if (!isObject(probabilities) || !sameKeys(probabilities, expectedKeys)) return false;
  const values = Object.values(probabilities);
  if (!values.every(numberInUnitRange)) return false;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.abs(sum - 1) <= 0.01;
}

export function validateJevResponse(payload, questions) {
  if (!isObject(payload) || typeof payload.model !== "string" || !isObject(payload.answers)) {
    throw new JevRequestError("Jev returned an invalid response.", { code: "INVALID_RESPONSE" });
  }

  const questionIds = Object.keys(questions);
  if (!sameKeys(payload.answers, questionIds)) {
    throw new JevRequestError("Jev returned a different set of answers than requested.", {
      code: "INVALID_RESPONSE",
    });
  }

  for (const id of questionIds) {
    const question = questions[id];
    const answer = payload.answers[id];
    if (!isObject(answer) || answer.type !== question.type) {
      throw new JevRequestError(`Jev returned an invalid answer for ${id}.`, {
        code: "INVALID_RESPONSE",
      });
    }

    if (question.type === "noul") {
      if (!numberInUnitRange(answer.noul)) {
        throw new JevRequestError(`Jev returned an invalid noul value for ${id}.`, {
          code: "INVALID_RESPONSE",
        });
      }
      continue;
    }

    if (!numberInUnitRange(answer.confidence)) {
      throw new JevRequestError(`Jev returned invalid confidence for ${id}.`, {
        code: "INVALID_RESPONSE",
      });
    }

    if (question.type === "choice") {
      const options = Object.keys(question.criteria);
      if (!options.includes(answer.choice) || !validateDistribution(answer.probabilities, options)) {
        throw new JevRequestError(`Jev returned an invalid choice for ${id}.`, {
          code: "INVALID_RESPONSE",
        });
      }
      const maxProbability = Math.max(...Object.values(answer.probabilities));
      if (answer.probabilities[answer.choice] + 1e-9 < maxProbability) {
        throw new JevRequestError(`Jev returned a non-maximum choice for ${id}.`, {
          code: "INVALID_RESPONSE",
        });
      }
      continue;
    }

    if (question.type === "score") {
      const levels = question.criteria.map((_, index) => String(index));
      if (
        !Number.isFinite(answer.score) ||
        answer.score < 0 ||
        answer.score > levels.length - 1 ||
        !isObject(answer.legend) ||
        !sameKeys(answer.legend, levels) ||
        !validateDistribution(answer.probabilities, levels)
      ) {
        throw new JevRequestError(`Jev returned an invalid score for ${id}.`, {
          code: "INVALID_RESPONSE",
        });
      }
    }
  }

  return payload;
}

async function callOpenRouter({ apiKey, apiKeyEnv, state, questions, endpoint, model, timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  let response;

  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/nomper/codex-jev",
        "X-Title": "codex-jev",
      },
      body: JSON.stringify({ model, state, questions }),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    throw new JevRequestError(timedOut ? "OpenRouter request timed out." : "OpenRouter request failed.", {
      code: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
    });
  } finally {
    clearTimeout(timeout);
  }

  let requestId = response.headers?.get?.("x-request-id") ?? undefined;
  if (!response.ok) {
    const message = response.status === 401
      ? `OpenRouter authentication failed. Check ${apiKeyEnv}.`
      : `OpenRouter request failed with HTTP ${response.status}.`;
    throw new JevRequestError(message, {
      code: "HTTP_ERROR",
      status: response.status,
      requestId,
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new JevRequestError("OpenRouter returned non-JSON data.", {
      code: "INVALID_RESPONSE",
      requestId,
    });
  }

  requestId ??= typeof payload.id === "string" ? payload.id : undefined;

  return {
    provider: "openrouter",
    response: validateJevResponse(payload, questions),
    requestId,
    latencyMs: Date.now() - startedAt,
  };
}

export async function callJev({
  apiKey,
  state,
  questions,
  provider = "typesafe",
  endpoint = DEFAULT_JEV_URL,
  model = provider === "openrouter" ? "~typesafe/jev-latest" : "jev-latest",
  apiKeyEnv = provider === "openrouter" ? "OPENROUTER_API_KEY" : "TYPESAFE_API_KEY",
  timeoutMs = 15000,
  fetchImpl = fetch,
}) {
  if (!apiKey) {
    throw new JevRequestError(`${apiKeyEnv} is not configured.`, { code: "MISSING_KEY" });
  }

  if (provider === "openrouter") {
    return callOpenRouter({
      apiKey,
      apiKeyEnv,
      state,
      questions,
      endpoint: endpoint === DEFAULT_JEV_URL ? DEFAULT_OPENROUTER_URL : endpoint,
      model,
      timeoutMs,
      fetchImpl,
    });
  }
  if (provider !== "typesafe") {
    throw new JevRequestError(`Unsupported provider: ${provider}.`, { code: "INVALID_CONFIG" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  const startedAt = Date.now();

  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "codex-jev/0.1.0",
      },
      body: JSON.stringify({ state, model, questions }),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    throw new JevRequestError(timedOut ? "Jev request timed out." : "Jev request failed.", {
      code: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
    });
  } finally {
    clearTimeout(timeout);
  }

  const requestId = response.headers?.get?.("x-typesafe-request-id") ?? undefined;
  if (!response.ok) {
    const message = response.status === 401
      ? "Jev authentication failed. Check TYPESAFE_API_KEY."
      : `Jev request failed with HTTP ${response.status}.`;
    throw new JevRequestError(message, {
      code: "HTTP_ERROR",
      status: response.status,
      requestId,
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new JevRequestError("Jev returned non-JSON data.", {
      code: "INVALID_RESPONSE",
      requestId,
    });
  }

  return {
    provider: "typesafe",
    response: validateJevResponse(payload, questions),
    requestId,
    latencyMs: Date.now() - startedAt,
  };
}
