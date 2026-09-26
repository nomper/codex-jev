---
name: jev-context-handoff
description: Select only the past conversation needed for a stated next topic and build a compact handoff for a new session. Use for relevance-based context pruning, not general summarization or rewriting the active history.
---

# Jev context handoff

Build a handoff that retains exact source blocks needed for the user's next topic.

## Workflow

1. Use the user's stated next topic as `nextTopic`. Ask briefly before calling the tool only when the target is materially ambiguous.
2. Gather exact, ordered conversation blocks available to the current session. In Hermes, use session search when older turns are needed and available; do not invent hidden or missing text.
3. Give every block a unique `id`, its `role`, and verbatim `content`. Mark unresolved work with `status: open` and mandatory context with `pin: true`.
4. Call the `curate_context` tool exposed by the `jev_context` MCP server once.
5. Present `retained` in order as the new-session handoff. Report removed block IDs and reasons separately.

## Constraints

- Do not claim to delete or rewrite the active conversation. This creates input for a new session.
- Do not use this as a general `/compact` replacement. Relevance to `nextTopic` is the selection criterion.
- Do not paraphrase `retained.content`.
- If the result has `status: unchanged`, preserve everything and report its warning and reason.
- Treat the original conversation as the authoritative archive and never delete it.
- Never place API keys, tokens, or passwords in prompts or plugin configuration.
