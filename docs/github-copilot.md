# GitHub Copilot版の検討

## 結論

最初の対象は GitHub Copilot in VS Code と Copilot CLI にする。構成は **Agent Skill + ローカルMCPサーバー** が最小で、Codex版の選別ロジックをそのまま再利用できる。

スキルだけではTypeSafe APIの呼び出しや応答検証を決定的に実装できない。逆に、専用Custom AgentやHookは初版には不要である。

## Codex版との対応

| 役割 | Codex版 | Copilot版候補 |
| --- | --- | --- |
| 呼び出し手順 | `skills/.../SKILL.md` | `skills/.../SKILL.md` |
| Jev呼び出し | ローカルMCP | 同じローカルMCP |
| 配布 | Codex marketplace | Agent Plugins 1.0 |
| APIキー | 起動環境の `TYPESAFE_API_KEY` | VS Code / CLIを起動する環境の同名変数 |
| 出力 | 新しいタスク用handoff | 新しいチャット／作業用handoff |

エンドポイント、モデル名、APIキーを読む環境変数名、タイムアウトは共通の `config.json` から読む。APIキーの値そのものはファイルへ保存しない。

Agent Plugins 1.0 はスキルとMCPサーバーを標準コンポーネントとして扱うため、この用途に合う。VS Code公式文書も、繰り返し手順にはAgent Skills、外部APIにはMCPを使う構成を案内している。

## 想定レイアウト

```text
codex-jev-copilot/
  plugin.json
  skills/
    jev-context-handoff/
      SKILL.md
  mcp.json
  dist/
    server.mjs
```

`dist/server.mjs` はCodex版と同じビルド成果物を使う。Copilot固有の機能が必要になるまで `com.github.copilot/` は作らない。

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

- [Agent customization](https://code.visualstudio.com/docs/copilot/concepts/customization)
- [Agent plugins in VS Code](https://code.visualstudio.com/docs/agent-customization/agent-plugins)
- [Adding agent skills for GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills)
- [Add and manage MCP servers in VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [Agent hooks in Visual Studio Code](https://code.visualstudio.com/docs/agent-customization/hooks)
