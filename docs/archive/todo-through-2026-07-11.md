> 過去時点の記録。現行の優先順位は [todo](../../todo.md)、実装結果は [再構築計画](../analysis/rebuild-plan-2026-09-07.md) を参照。


# Todo List

## 1. Current Focus: B2B Ops & Stability
**Priority: High** (B2B運用基盤の安定化を優先)
- [ ] **Activation Loop UX**: Business Admin の導入チェックを進捗モデル化し、cohort→担当→ミッション→通知→writing の次アクションを overview から直接実行できるようにする。
- [x] **Student Writing Awareness**: 生徒側 Writing 課題を focus / visibility / 60秒 polling / 手動更新で再取得し、PDF/画像の混在、件数、種類、サイズの事前バリデーションを UI と送信直前の両方に追加した。
- [ ] **Assignment Ops**: 担当講師割当の履歴化を UI / 運用フローまで仕上げ、cohort 単位権限へ拡張する。
- [ ] **BtoB KPI**: 通知後再開率、割当率、学習プラン浸透率を継続計測できるようにし、監査性も強化する。
- [ ] **Cloudflare Data Sync**: Cloudflare を正史として session / storage の整合性確認を継続し、IndexedDB は demo / offline fallback に限定する。
- [ ] **Storage Hotspot Split**: `services/storage.ts` と `services/storage/organization-read-model.ts` を優先して薄くし、`types.ts` / `contracts/storage.ts` の shared contract 変更は最小に保つ。
- [x] **Generated Hint Approval Boundary (P0)**: Cloudflare / IndexedDB の全 learner read を共通 projector に統一し、生成物は有効期限内の `APPROVED` だけ表示。pending / failed / review-required / unknown / stale は本文とURLを返さない。共有assetの `forceRefresh` はbook write権限を必須とし、生成競合はasset別CASで勝者を上書きしない。
- [ ] **Generated Hint Capacity / Cost Contract (P1)**: bulk生成を監査可能量に制限し、backlog・最終成功時刻・SLO alertを公開する。provider実行前のAI予算予約、初回共有生成のrole/費用主体、並行missの重複課金を契約と負荷testで固定する。
- [ ] **SRS Atomic Idempotency (P1)**: cloud save に attempt id と一意制約を導入し、local IndexedDB の transaction lifetime と local/cloud status 判定を揃える。
- [ ] **Auth Abuse Review (P1)**: signup / password reset の rate limit、token/session lifecycle、account enumeration 耐性を脅威レビューと negative test で固める。
- [ ] **Writing Finalize / Upload Residual Hardening (P1)**: OCR/AI 前に attempt を claim して二重費用を防ぎ、commit 後 analytics 失敗を response から分離する。upload reservation lease の crash 復旧、checksum 必須化、PDF/画像 magic-byte 検査も追加する。
- [ ] **IndexedDB Hint Audit Liveness (P1)**: local 生成を無効化するか cloud 監査/承認同期を追加し、安全に非表示化された `PENDING` を永久状態にしない。
- [x] **Workbook Import Guardrails**: 名詞 workbook import は generic XLSX import として広げず、mismatch 可視化・停止条件・fixture 回帰・server-side reject を固めた。

## 2. Next Up: Mobile App Experience
- [ ] **Touch Gestures**: Study Modeでのスワイプ操作（Tinder風UI）の導入検討。
- [ ] **Leaderboard Logic**: 個人向け週間ランキングのロジック（DBスキーマ変更含む）は B2B 安定化後に再開する。

## 3. Completed Features (Done)
### Visual Polish & Social Features
- [x] **Graph Improvement**: 週間学習記録に「目標ライン」と「目標達成カラー」を追加。
- [x] **Leaderboard Enhancement**: ユーザーレベルに応じた「リーグ（Bronze/Silver/Gold）」バッジの実装。
- [x] **Mobile App Basics**: PWA用メタタグ（theme-color, apple-touch-icon）と `public/manifest.webmanifest` の設定。

### UX / UI Polish
- [x] **UI Localization**: Dashboard, StudyModeの日本語化完了。
- [x] **Mobile Responsiveness**: Study Modeのカードサイズ調整。
- [x] **Streak Visuals**: ダッシュボードでのストリーク演出強化。

### Core Stability & Logic
- [x] **Noun Workbook Import Safety**: 4列シート/ヘッダーなし索引/監査シート除外/実 workbook の reviewed exception 台帳を追加し、未確認 mismatch だけを停止条件にした。
- [x] **Progress Logic Fix**: 学習開始直後から1%の進捗を表示するよう修正。
- [x] **Fix Learning Algorithm**: 学習コース進捗ロジック修正。
- [x] **AI Content Persistence**: 例文・訳のDB保存とキャッシュ。
- [x] **Error Handling**: Gemini API 429エラー対策。
- [x] **Writing Smoke Stabilization**: `demo login -> onboarding/profile save -> writing section` の session persistence を固定し、 browser smoke / API integration の回帰確認を追加。
- [x] **Writing Student Security Boundary**: 生徒 finalize / 返却 detail を最小 allowlist 化し、講師アクセスを assignment organization まで照合。印刷 HTML の stored injection と完了 API の状態迂回も server-side で遮断した。
- [x] **Writing State / Upload Concurrency Boundary**: 配布・講師返却・完了を conditional D1 write にし、最新提出だけを返却。upload token はbody読込前に予約し、実サイズ・合計20MB・checksum・二重使用を検証する。
- [x] **Shared Content / XP Immediate Containment**: 未使用の `updateWordCache` を契約から撤去し、XPはfinite safe integer・1回上限・closed-form・CASで即時封鎖。完全解決の attempt receipt / server award は P1 で継続する。
- [x] **Demo Retention FK Safety**: 期限切れdemo user削除前にreset tokenのcreator参照を同一D1 batchでNULL化し、migration 0041で`ON DELETE SET NULL`・既存token/index保持・実demo-login回帰を追加した。

### Personalization & Content
- [x] **Dynamic Learning Plan**: プラン作成後の編集機能実装済み。
- [x] **Personal Content OS UI**: My Phrasebook作成フローの改善。
- [x] **Multi-modal Input**: PDF/画像からの単語抽出。
- [x] **Adaptive Personalization**: 学年・英語レベル管理。
- [x] **Diagnostic Test**: 初回レベル診断機能（Basic + Advanced）。

## 4. Future Roadmap
- [ ] **Native App Wrapper**: PWA化またはCapacitor等でのアプリ化検討。
- [ ] **Advanced Ghost Teacher**: 生徒への自動メール/LINE通知連携。
