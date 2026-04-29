# Development Journal

## Current State
- Cloudflare Pages Functions + D1 を正本とする運用に寄せています。
- IndexedDB は demo / offline fallback とし、business workspace と writing workflow は Cloudflare 側を正史にしています。
- `/api/storage` は共有 `StorageActionMap` 契約を使う構成へ寄せつつ、巨大 facade の分割を継続しています。
- 教材 import は Cloudflare path で server 側 validator により正規化・検証済みです。
- B2B 向けには、担当変更履歴 `student_instructor_assignment_events` と組織ダッシュボード KPI の監査性を優先しています。
- browser smoke は core / writing / idb mode まで green に戻し、直近の writing 導線 blocker は解消しました。
- `名詞 workbook import` は B2B/storage refactor と混ぜず、server-side guardrail と reviewed exception 台帳で閉じる段階です。
- 実際の hotspot は `services/storage.ts`、`services/storage/organization-read-model.ts`、`types.ts`、storage/writing actions 群で、`BusinessAdminDashboardSections` は最優先の分割対象ではなくなっています。
- 2026-04-26 時点の次 batch は、schema-heavy な商用CRM化や import atomic 化ではなく、既存の B2B activation loop を実操作としてつなげる UI/read-model 改善を優先します。

## Implemented
- `student_instructor_assignment_events` migration を追加。
- `assignStudentInstructor` で担当更新と履歴記録を同時実行。
- 組織ダッシュボードへ `reactivatedStudents7d` / `reactivationRate7d` / `assignmentEvents` を追加。
- `StudentSummary.assignmentUpdatedAt` を追加し、講師・管理者 UI へ表示。
- `services/cloudflare.ts` で demo login / email auth 後の `/api/session` 復元待機と、profile update 前の session 確認を追加し、client state と server session のズレを抑制した。
- API integration tests に、business student の `demo login -> onboarding/profile save -> /api/session -> writing assignments load` 回帰確認を追加した。
- API client に HTML / non-JSON response guard を追加し、`wrangler pages dev dist` 前提を明示。
- `storage-actions` を dispatcher 化し、books / learning / organization / dashboard の module へ分割。
- `Dashboard` は data hook と hero / plan / library / settings / account / progress section を分離、`AdminPanel` は dashboard view と content import view を分離。
- Playwright smoke を local Pages Functions + D1 migration 前提で安定化し、GitHub Actions に browser smoke workflow を追加。
- deploy workflow に `cf:doctor` を組み込み、GitHub / Cloudflare 設定差分を deploy 前に検知できるようにした。
- API integration tests に、phrasebook の owner-only 可視性、duplicate row skip、cross-org assignment 拒否、worksheet access 権限制御を追加した。
- ログイン前ホームと公開説明ページに live Motivation Board を追加し、`/api/public/motivation` からリアルタイム更新の公開 snapshot を取得できるようにした。
- `public/manifest.webmanifest` を追加し、PWA icon / theme-color / standalone metadata を `index.html` と同期した。
- noun workbook import の CSV/XLSX UI、D1/IndexedDB provenance 保存、server-side profile validation、4列シート/ヘッダーなし索引対応、監査済み mismatch/duplicate 台帳を追加した。
- `output/spreadsheet/noun_workbook_analysis_revised.txt` を更新し、実 workbook は 932 words / categories 10 / unreviewed mismatch 0 / unreviewed duplicate 0 の状態で確認した。

## In Progress
- Cloudflare / GitHub 運用手順の継続整理。
- `services/storage.ts` と `services/storage/organization-read-model.ts` の分割計画。
- Thread A の PR / preview deployment / main 統合。
- Business Admin の導入進捗モデル化と、生徒 Writing の reload 不要な再取得・提出バリデーション。

## Next Focus
- `todo.md` の High priority に合わせ、割当運用の履歴化、cohort 単位運用、B2B KPI の継続検証を先に固める。
- workbook import と B2B/storage refactor は別 branch で進め、shared contract の衝突を避ける。
- `services/storage.ts` と `services/storage/organization-read-model.ts` の分割を優先し、B2B 導線の変更コストを下げる。
- オフライン同期や touch gesture / native wrapper は B2B 運用基盤の安定化後に進める。
