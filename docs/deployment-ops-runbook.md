# GitHub x Cloudflare Deployment Runbook

## Topology

- GitHub Actions を唯一の deploy 経路として扱い、Cloudflare native Git auto-deploy は無効化したまま維持します。
- `production` environment は `medace-db` を、`preview` environment は `medace-db-preview` を使います。
- preview URL は公開のまま運用しますが、preview banner と `noindex` marker を必ず表示します。

## GitHub Settings

- `main` は PR 必須、required checks 必須、conversation resolution 必須の ruleset で保護します。
- deploy workflow は GitHub `production` / `preview` environment を参照し、Cloudflare credential と D1 名も environment-scoped config を優先します。
- `.github/CODEOWNERS`, `wrangler.jsonc`, `migrations/`, `scripts/cf-*.mjs` は owner review 前提で扱います。

## Release Flow

1. PR で `CI` と preview deployment を通す。
2. `Deploy Pages Preview` が preview DB migration と deployed smoke まで通ったことを確認する。
3. `main` へ merge すると `Deploy Pages` が production bookmark を採取し、remote migration と Pages deploy を実行する。
4. job summary に記録された production bookmark を DB rollback の起点として保存する。

## Rollback

### Code rollback

- Cloudflare Pages Dashboard の deployment history から直前の安定 deployment に戻します。
- preview deployment は rollback target ではなく、検証用 URL として扱います。

### DB rollback

- production deploy job summary の `Recovery Bookmark` を使います。
- 例:

```bash
npx wrangler d1 time-travel restore medace-db --bookmark=<bookmark>
```

- restore 実行後は undo 用 bookmark も返るので、その値も必ず控えてください。

## Secrets and Drift

- `npm run cf:doctor` は repo-level fallback に加えて GitHub environment secrets / variables と preview DB binding を検査します。
- `npm run cf:sync` は GitHub environment vars/secrets と preview DB の存在を揃えます。
- preview 用 `ADMIN_DEMO_PASSWORD` を本番と分ける場合は、local で `ADMIN_DEMO_PASSWORD_PREVIEW` をセットしてから `npm run cf:sync` を実行します。
