# GitHub Copilot版の検討

## 結論

最初の対象は独立版の **GitHub Copilot App** にする。構成は **Agent Skill + ローカルMCPサーバー** が最小で、Codex版・Hermes版の選別ロジックをそのまま再利用できる。

スキルだけでは外部APIの呼び出しや応答検証を決定的に実装できない。逆に、専用Custom AgentやHookは初版には不要である。

## Codex版との対応

| 役割 | Codex版 | Copilot版候補 |
| --- | --- | --- |
| 呼び出し手順 | `skills/.../SKILL.md` | `skills/.../SKILL.md` |
| 選別API呼び出し | ローカルMCP | 同じローカルMCP |
| 配布 | Codex marketplace | Agent Plugins 1.0 |
| APIキー | 選択中プロバイダーの環境変数 | プロセス環境、またはHermesと共用するローカル `.env` |
| 出力 | 新しいタスク用handoff | 新しいチャット／作業用handoff |

プロバイダー、エンドポイント、モデル名、APIキーを読む環境変数名、タイムアウトは共通の `config.json` から読む。`typesafe`（Jev直結）と `openrouter` を選択できるが、APIキーの値そのものはファイルへ保存しない。

Agent Plugins 1.0 はスキルとMCPサーバーを標準コンポーネントとして扱い、GitHub Copilot Appでも正式にサポートされているため、この用途に合う。Copilot固有のCustom AgentやHookは現時点では不要である。

## 現在のポータブルレイアウト

```text
codex-jev/
  .github/plugin/marketplace.json
  plugin.json
  skills/
    jev-context-handoff/
      SKILL.md
  mcp.json
  scripts/
    hermes-server.mjs
  plugins/
    codex-jev/
      dist/server.mjs
```

リポジトリ直下はAgent Plugins 1.0形式として実装済みで、Copilot AppとHermesがCodex版と同じ `dist/server.mjs` を使う。`.github/plugin/marketplace.json` により、Copilot Appのカスタムマーケットプレイスとして公開リポジトリを登録できる。Copilot固有の機能が必要になるまで `com.github.copilot/` は作らない。

## Copilot Appへの導入

Copilot Appの **Customize → Plugins** でカスタムマーケットプレイス `nomper/codex-jev` を追加し、その中の `codex-jev` をインストールする。アプリのディープリンクは入力欄を事前入力するだけで、最終的な追加・インストールはアプリ上の確認を必要とする。

Copilot AppとCopilot CLIはユーザー設定とインストール済みプラグインの保存領域を共有する。ただし、利用者向けの基本手順はアプリ内UIに統一し、CLIを必須にしない。

## 採用しない初期案

### Custom Agent

専用の「context curator」人格を選べる利点はあるが、選別そのものはスキルとMCPで完結する。ツール制限や別モデル指定が必要になった時点で追加する。

### Hook

Hookはツール実行前後などのライフサイクル処理向けであり、過去のチャット履歴を書き換える仕組みではない。自動発火は意図しない外部送信も招くため、この用途では使わない。

### GitHub.com上のCloud Agent

ローカルNodeプロセスとローカル環境変数に依存する現方式を、そのままCloud Agentへ持ち込むことはできない。クラウド対応が必要なら、認証されたリモートMCPサービスとして別設計する。初版の範囲外とする。

## 共通化方針

1. `src/curate.mjs` と `src/jev-client.mjs` を共通実装にする。
2. Codex版とCopilot版で変えるのは、マニフェストとMCP設定ファイルだけにする。
3. 同じ入力fixtureを両ホストで実行し、`retained` と `removed` の形が一致することを確認する。
4. どちらの版も「現在の会話を削除した」と表現しない。作るのは新しい会話用のhandoffである。

## 参考資料

- [About GitHub Copilot plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins)
- [Customizing the GitHub Copilot app](https://docs.github.com/en/copilot/how-tos/github-copilot-app/customize-github-copilot-app)
- [Using deep links to open the GitHub Copilot app](https://docs.github.com/en/copilot/how-tos/github-copilot-app/open-with-deep-links)
- [Creating a plugin marketplace](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace)
