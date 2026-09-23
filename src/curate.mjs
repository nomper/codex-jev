import { callJev } from "./jev-client.mjs";

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:ghp|github_pat|sk)-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|token|password)\s*[:=]\s*[^\s]{8,}/i,
];

function hasPossibleSecret(text) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function unchanged(nextTopic, blocks, reason, warning) {
  const originalChars = blocks.reduce((sum, block) => sum + block.content.length, 0);
  return {
    status: "unchanged",
    reason,
    nextTopic,
    retained: blocks,
    removed: [],
    stats: {
      inputBlocks: blocks.length,
      retainedBlocks: blocks.length,
      removedBlocks: 0,
      originalChars,
      retainedChars: originalChars,
      requests: 0,
    },
    ...(warning ? { warning } : {}),
  };
}

function protectionReason(block) {
  if (block.pin === true) return "pinned";
  if (block.status === "open") return "open_work";
  if (block.role === "system" || block.role === "developer") return "instruction";
  if (hasPossibleSecret(block.content)) return "possible_secret_not_sent";
  return null;
}

function buildRequest(nextTopic, candidates) {
  const state = {
    next_topic: nextTopic,
    candidates: candidates.map(({ block, index }) => ({
      key: `block_${index}`,
      role: block.role,
      content: block.content,
    })),
  };

  const questions = Object.fromEntries(candidates.map(({ index }) => [
    `block_${index}`,
    {
      type: "choice",
      instructions: {
        candidate: `block_${index}`,
        question: "Is this candidate needed to continue the next topic without losing a relevant instruction, decision, unresolved item, fact, path, error, or verification result?",
      },
      criteria: {
        keep: "Needed for the next topic, or uncertain enough that removing it could lose useful context.",
        drop: "Completed, superseded, duplicated, or unrelated to the next topic.",
      },
    },
  ]));

  return { state, questions };
}

export async function curateContext(
  { nextTopic, blocks, dropThreshold = 0.9 },
  { apiKey = process.env.TYPESAFE_API_KEY, jev = callJev, jevOptions = {} } = {},
) {
  if (!apiKey) {
    return unchanged(nextTopic, blocks, "missing_api_key", "TYPESAFE_API_KEY is not configured; nothing was removed.");
  }

  const protectedByIndex = new Map();
  const candidates = [];
  blocks.forEach((block, index) => {
    const reason = protectionReason(block);
    if (reason) protectedByIndex.set(index, reason);
    else candidates.push({ block, index });
  });

  if (candidates.length === 0) return unchanged(nextTopic, blocks, "nothing_eligible");

  const { state, questions } = buildRequest(nextTopic, candidates);
  let result;
  try {
    result = await jev({ apiKey, state, questions, ...jevOptions });
  } catch (error) {
    return unchanged(nextTopic, blocks, "jev_error", `${error.message} Nothing was removed.`);
  }

  const answers = result.response.answers;
  const keep = new Set(protectedByIndex.keys());
  const removed = [];

  for (const { block, index } of candidates) {
    const answer = answers[`block_${index}`];
    const dropProbability = answer.probabilities.drop;
    if (answer.choice === "drop" && dropProbability >= dropThreshold) {
      removed.push({
        id: block.id,
        reason: "not_needed_for_next_topic",
        dropProbability,
      });
    } else {
      keep.add(index);
    }
  }

  // Keep tool call/result pairs together when either half survives.
  const keptCallIds = new Set(blocks.filter((block, index) => keep.has(index) && block.callId).map((block) => block.callId));
  blocks.forEach((block, index) => {
    if (block.callId && keptCallIds.has(block.callId)) keep.add(index);
  });

  const retained = blocks.filter((_, index) => keep.has(index));
  const removedFinal = removed.filter(({ id }) => !retained.some((block) => block.id === id));
  const originalChars = blocks.reduce((sum, block) => sum + block.content.length, 0);
  const retainedChars = retained.reduce((sum, block) => sum + block.content.length, 0);

  return {
    status: removedFinal.length > 0 ? "curated" : "unchanged",
    reason: removedFinal.length > 0 ? "selection_complete" : "nothing_removed",
    nextTopic,
    retained,
    removed: removedFinal,
    protected: [...protectedByIndex].map(([index, reason]) => ({ id: blocks[index].id, reason })),
    stats: {
      inputBlocks: blocks.length,
      retainedBlocks: retained.length,
      removedBlocks: removedFinal.length,
      originalChars,
      retainedChars,
      requests: 1,
    },
    jev: {
      model: result.response.model,
      requestId: result.requestId,
      latencyMs: result.latencyMs,
      usage: result.response.usage,
    },
  };
}
