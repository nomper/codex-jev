# codex-jev

**English** | [日本語](README.ja.md)

A Codex plugin that selects past conversation blocks relevant to the next topic and builds a compact handoff for a new task.

This is not a general-purpose summary like `/compact`. It keeps exact source blocks needed for the user-supplied `nextTopic` and removes only blocks that are clearly unnecessary. It does not modify the active chat history.

## Minimal behavior

- Exposes one MCP tool: `jev_context.curate_context`
- Accepts a `nextTopic` and ordered conversation `blocks`
- Always preserves `system` / `developer` blocks, `pin: true`, and `status: open`
- Keeps likely secrets local and never sends those blocks to Jev
- Removes a block only when Jev's `drop` probability is at least 0.9 by default
- Preserves every block when the API key is missing, the request fails, or the response is invalid
- Keeps retained text verbatim and in its original order

## Jev configuration

Jev connection settings live in [`plugins/codex-jev/config.json`](plugins/codex-jev/config.json).

```json
{
  "endpoint": "https://api.typesafe.ai/v1/systemone",
  "model": "jev-latest",
  "apiKeyEnv": "TYPESAFE_API_KEY",
  "timeoutMs": 15000
}
```

`apiKeyEnv` is the name of the environment variable, not the API key itself. The actual key is never stored in this configuration file. The current `.mcp.json` also forwards `TYPESAFE_API_KEY` from Codex to the MCP process, so update both files if you change the variable name.

## Development

Requires Node.js 22 or later.

```powershell
npm install
npm run check
```

The build produces a single bundled file at `plugins/codex-jev/dist/server.mjs`. Plugin users do not need to run `npm install`.

## Install in Codex

Add this repository as a plugin marketplace, then install the plugin.

```powershell
codex plugin marketplace add https://github.com/nomper/codex-jev
codex plugin add codex-jev@codex-jev
```

Set the TypeSafe API key only in the environment that launches Codex. Do not write it into source or configuration files.

```powershell
$env:TYPESAFE_API_KEY = Read-Host 'TypeSafe API key' -MaskInput | ConvertFrom-SecureString -AsPlainText
codex
```

Open a new Codex task after changing the environment variable or plugin installation.

## Example input

```json
{
  "nextTopic": "Decide how to package the GitHub Copilot version",
  "blocks": [
    {
      "id": "request-1",
      "role": "user",
      "content": "Keep the implementation as simple as possible.",
      "pin": true
    },
    {
      "id": "old-1",
      "role": "assistant",
      "content": "Discussion of an unrelated task that is already complete."
    },
    {
      "id": "todo-1",
      "role": "context",
      "content": "Prepare design notes for the GitHub Copilot version.",
      "status": "open"
    }
  ]
}
```

The `retained` output contains the exact blocks to pass to the new task. `removed` contains only excluded IDs, reasons, and probabilities. Keep the original conversation as the authoritative archive.

The current GitHub Copilot portability notes are in [docs/github-copilot.md](docs/github-copilot.md) (Japanese).
