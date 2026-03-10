# Development Journal

## Current State
- Cloudflare Pages Functions + D1 を正本とする運用に寄せています。
- `/api/storage` は共有 `StorageActionMap` 契約を使う構成へ移行中です。
- 教材 import は UI 手書き解析から切り離し、server 側 validator で正規化・検証する方針です。
- B2B 向けには、担当変更履歴 `student_instructor_assignment_events` と組織ダッシュボード KPI の監査性を優先しています。

## Implemented
- `student_instructor_assignment_events` migration を追加。
- `assignStudentInstructor` で担当更新と履歴記録を同時実行。
- 組織ダッシュボードへ `reactivatedStudents7d` / `reactivationRate7d` / `assignmentEvents` を追加。
- `StudentSummary.assignmentUpdatedAt` を追加し、講師・管理者 UI へ表示。
- API client に HTML / non-JSON response guard を追加し、`wrangler pages dev dist` 前提を明示。
- `storage-actions` を dispatcher 化し、books / learning / organization / dashboard の module へ分割。
- `Dashboard` は data hook と hero / plan / library / settings / account / progress section を分離、`AdminPanel` は dashboard view と content import view を分離。
- Playwright smoke を local Pages Functions + D1 migration 前提で安定化し、GitHub Actions に browser smoke workflow を追加。
- deploy workflow に `cf:doctor` を組み込み、GitHub / Cloudflare 設定差分を deploy 前に検知できるようにした。
- API integration tests に、phrasebook の owner-only 可視性、duplicate row skip、cross-org assignment 拒否、worksheet access 権限制御を追加した。

## In Progress
- Cloudflare / GitHub 運用手順の継続整理。

## Next Focus
- `todo.md` の High priority に合わせ、割当運用の履歴化と B2B KPI の継続検証を先に固める。
- オフライン同期や PWA 強化は B2B 運用基盤の安定化後に進める。
