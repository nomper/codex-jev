# codex-jev

[English](README.md) | **日本語**

次に扱う話題との関連性で過去の会話を選別し、新しいタスクへ渡す小さな handoff を作る、GitHub Copilot App・Codex・Hermes対応のポータブルAgent Pluginです。

これは `/compact` のような会話全体の要約ではありません。ユーザーが指定した `nextTopic` に必要な原文ブロックを残し、明確に不要なブロックだけを除外します。現在のチャット履歴自体は変更しません。

## 最小仕様

- MCPツールは `jev_context.curate_context` の1つだけ
- 入力は `nextTopic` と、順序付きの会話 `blocks`
- `system` / `developer`、`pin: true`、`status: open` は常に保持
- 秘密情報らしいブロックは外部へ送らず保持
- Jevの `drop` 確率が既定で0.9以上の場合だけ除外
- APIキー未設定、通信失敗、不正な応答では全件保持
- 残した本文は原文・元の順序を維持
- 選別前後の本文概算トークン数と概算削減率を返す

## Jev設定

Jevの接続設定は [`plugins/codex-jev/config.json`](plugins/codex-jev/config.json) に分離しています。

```json
{
  "endpoint": "https://api.typesafe.ai/v1/systemone",
  "model": "jev-latest",
  "apiKeyEnv": "TYPESAFE_API_KEY",
  "timeoutMs": 15000
}
```

`apiKeyEnv` はキーの値ではなく、キーを読む環境変数名です。実際のAPIキーは設定ファイルへ保存しません。Codexは `plugins/codex-jev/.mcp.json` を通じて環境変数をMCPプロセスへ渡し、ポータブル起動ラッパーはプロセス環境またはHermesの環境ファイルから、この設定で指定されたキーだけを読みます。変数名を変える場合はCodex側のMCP設定と `.env.example` も合わせてください。

## 開発

要件は Node.js 22 以降です。

```powershell
npm install
npm run check
```

ビルド成果物は `plugins/codex-jev/dist/server.mjs` に単一ファイルとして生成されます。両ホストが同じファイルを使い、インストール先で `npm install` は不要です。

## Hermesへ追加

Hermes Agent 0.21.3以降とNode.js 22以降が必要です。

```powershell
hermes plugins install nomper/codex-jev --no-enable
hermes plugins enable codex-jev
```

TypeSafeのAPIキーはHermesの環境ファイルへ追加します。`mcp.json`やGit管理対象のファイルには書かないでください。

```dotenv
# Windows: %LOCALAPPDATA%\hermes\.env
# Linux/macOS: ~/.hermes/.env
TYPESAFE_API_KEY=実際のキーに置き換える
```

プラグインを有効化した後、またはキーを変更した後は、新しいHermesセッションを開始してください。ポータブルスキルは、必要に応じてHermesのセッション検索から過去の原文を取得してから `curate_context` を呼び出せます。

## GitHub Copilot Appへ追加

ここで扱うのは独立版のGitHub Copilot Appであり、VS Code拡張ではありません。

1. **Customize**、**Plugins** の順に開きます。
2. マーケットプレイス選択欄の横から、マーケットプレイスの追加を選びます。
3. `nomper/codex-jev` を入力して確定します。
4. 追加したマーケットプレイス内の `codex-jev` を選び、**Install** を押します。

インストールまたは更新後は新しいCopilotセッションを開始してください。Windowsでは、起動ラッパーが上記と同じ `%LOCALAPPDATA%\hermes\.env` から `TYPESAFE_API_KEY` を読めるため、Copilot AppとHermesで1つのローカル秘密設定を共有できます。

## Codexへ追加

公開リポジトリをマーケットプレイスとして追加します。

```powershell
codex plugin marketplace add https://github.com/nomper/codex-jev
codex plugin add codex-jev@codex-jev
```

TypeSafeのAPIキーは、Codexを起動する環境にだけ設定します。ソースや設定ファイルへ書きません。

```powershell
$env:TYPESAFE_API_KEY = Read-Host 'TypeSafe API key' -MaskInput | ConvertFrom-SecureString -AsPlainText
codex
```

環境変数またはプラグインを変更した後は、新しいCodexタスクを開いてください。

## 入力例

```json
{
  "nextTopic": "GitHub Copilot版の構成を決める",
  "blocks": [
    {
      "id": "request-1",
      "role": "user",
      "content": "なるべくシンプルな実装でお願いしたいです",
      "pin": true
    },
    {
      "id": "old-1",
      "role": "assistant",
      "content": "完了済みの別件についての説明"
    },
    {
      "id": "todo-1",
      "role": "context",
      "content": "GitHub Copilot版の検討文書を作る",
      "status": "open"
    }
  ]
}
```

出力の `retained` が新しいタスクへ渡す原文です。`removed` は除外したID、理由、確率だけを返します。`stats` の `estimatedOriginalTokens` から `estimatedRetainedTokens` への変化と削減率で効果を確認できます。この値は本文のみを対象にしたモデル非依存の概算（UTF-8バイト数÷4）であり、各モデル固有tokenizerの厳密値ではありません。元の会話は正本として残してください。

GitHub Copilot App版の検討は [docs/github-copilot.md](docs/github-copilot.md) にまとめています。
