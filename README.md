# codex-jev

**English** | [日本語](README.ja.md)

A portable Agent Plugin for GitHub Copilot app, Codex, and Hermes that selects past conversation blocks relevant to the next topic and builds a compact handoff for a new task.

This is not a general-purpose summary like `/compact`. It keeps exact source blocks needed for the user-supplied `nextTopic` and removes only blocks that are clearly unnecessary. It does not modify the active chat history.

## Minimal behavior

- Exposes one MCP tool: `jev_context.curate_context`
- Accepts a `nextTopic` and ordered conversation `blocks`
- Always preserves `system` / `developer` blocks, `pin: true`, and `status: open`
- Keeps likely secrets local and never sends those blocks to Jev
- Removes a block only when Jev's `drop` probability is at least 0.9 by default
- Preserves every block when the API key is missing, the request fails, or the response is invalid
- Keeps retained text verbatim and in its original order
- Reports content-only estimated tokens before and after selection, plus the estimated reduction percentage

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

`apiKeyEnv` is the name of the environment variable, not the API key itself. The actual key is never stored in this configuration file. Codex forwards the variable through `plugins/codex-jev/.mcp.json`; the portable launcher reads only the key named by this configuration from the process environment or the Hermes environment file. If you rename the variable, update the Codex MCP configuration and `.env.example` too.

## Development

Requires Node.js 22 or later.

```powershell
npm install
npm run check
```

The build produces a single bundled file at `plugins/codex-jev/dist/server.mjs`. Both hosts reuse it, and plugin users do not need to run `npm install`.

## Install in Hermes

Hermes Agent 0.21.3 or later and Node.js 22 or later are required.

```powershell
hermes plugins install nomper/codex-jev --no-enable
hermes plugins enable codex-jev
```

Add the TypeSafe key to the Hermes environment file. Do not add it to `mcp.json` or any committed file.

```dotenv
# Windows: %LOCALAPPDATA%\hermes\.env
# Linux/macOS: ~/.hermes/.env
TYPESAFE_API_KEY=replace-with-your-key
```

Start a new Hermes session after enabling the plugin or changing the key. The portable skill can use Hermes session search for older exact turns before it calls `curate_context`.

## Install in the GitHub Copilot app

This section is for the standalone GitHub Copilot app, not the VS Code extension.

1. Open **Customize**, then **Plugins**.
2. Next to the marketplace selector, choose the option to add a marketplace.
3. Enter `nomper/codex-jev` and confirm.
4. Find `codex-jev` in that marketplace and choose **Install**.

Start a new Copilot session after installing or updating the plugin. On Windows, the launcher can read `TYPESAFE_API_KEY` from the same `%LOCALAPPDATA%\hermes\.env` file shown above, so one local secret configuration can serve both Copilot app and Hermes.

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

The `retained` output contains the exact blocks to pass to the new task. `removed` contains only excluded IDs, reasons, and probabilities. `stats` reports the estimated change from `estimatedOriginalTokens` to `estimatedRetainedTokens` and the reduction percentage. The estimate is content-only and model-independent (`UTF-8 bytes / 4`), so it is useful for comparison but is not an exact provider tokenizer count. Keep the original conversation as the authoritative archive.

The GitHub Copilot app design notes are in [docs/github-copilot.md](docs/github-copilot.md) (Japanese).
