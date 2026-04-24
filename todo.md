
# Todo List

## 1. Current Focus: B2B Ops & Stability
**Priority: High** (B2B運用基盤の安定化を優先)
- [ ] **Assignment Ops**: 担当講師割当の履歴化を UI / 運用フローまで仕上げ、cohort 単位権限へ拡張する。
- [ ] **BtoB KPI**: 通知後再開率、割当率、学習プラン浸透率を継続計測できるようにし、監査性も強化する。
- [ ] **Cloudflare Data Sync**: Cloudflare を正史として session / storage の整合性確認を継続し、IndexedDB は demo / offline fallback に限定する。
- [ ] **Storage Hotspot Split**: `services/storage.ts` と `services/storage/organization-read-model.ts` を優先して薄くし、`types.ts` / `contracts/storage.ts` の shared contract 変更は最小に保つ。
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

### Personalization & Content
- [x] **Dynamic Learning Plan**: プラン作成後の編集機能実装済み。
- [x] **Personal Content OS UI**: My Phrasebook作成フローの改善。
- [x] **Multi-modal Input**: PDF/画像からの単語抽出。
- [x] **Adaptive Personalization**: 学年・英語レベル管理。
- [x] **Diagnostic Test**: 初回レベル診断機能（Basic + Advanced）。

## 4. Future Roadmap
- [ ] **Native App Wrapper**: PWA化またはCapacitor等でのアプリ化検討。
- [ ] **Advanced Ghost Teacher**: 生徒への自動メール/LINE通知連携。
