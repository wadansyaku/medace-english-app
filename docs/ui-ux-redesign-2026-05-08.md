# UI/UX Redesign Brief 2026-05-08

## 目的

Steady Study の大規模 UI/UX 改善では、個人向け学習アプリらしい明るさを残しながら、主軸である塾・教室向け運用 SaaS として信頼できる画面密度に寄せる。今回の共通基盤では、既存の `className` を大きく壊さず、全画面に効く色・角丸・余白・レスポンシブの土台を整える。

## ビジュアル方針

- Primary は `medace-*` のオレンジ系を使い、生成画像1に近い温かい日本語 UI として統一する。
- Green / red / blue は成功、訂正、情報などの意味を持つ状態色に限定する。
- Slate は本文・罫線・情報密度の整理に使い、画面全体を dark slate 一色にしない。
- カードの角丸は控えめにする。`rounded-[28px]` / `rounded-[32px]` は CSS 側で `--radius-panel` に正規化し、pill は badge / chip / compact control に限定する。
- 背景は放射状の装飾グラデーションではなく、薄い面と罫線で学習・運用画面らしい安定感を出す。
- Hero は実プロダクトの操作導線を見せる。マーケティング風の大きな説明だけで first viewport を使い切らない。

## 共通トークン

実装の一次情報は次のファイルに置く。

- `config/brand.ts`: `BRAND_VISUAL_SYSTEM`
- `styles.css`: CSS custom properties と共通 utility
- `tailwind.config.js`: `medace`, `steady`, `signal`, radius, shadow の Tailwind token

主な追加 utility:

- `ui-shell`: 画面幅と左右余白の標準コンテナ
- `ui-section`: 通常セクション用の白背景 panel
- `ui-card` / `ui-card-muted`: 繰り返し項目・metric・list item 用
- `ui-hero-surface`: product hero / workspace hero 用
- `ui-chip`: badge / status pill 用
- `ui-button-primary` / `ui-button-secondary` / `ui-button-ghost`: icon + text button の共通形
- `ui-page-grid`: desktop で左右情報を分け、mobile で 1 column に戻す grid
- `ui-action-row`: mobile で縦積み、desktop で横並びに戻す action row
- `ui-scroll-rail`: mobile の横スクロール選択肢
- `content-safe`: 長い単語・教材名・メールアドレスのはみ出しを抑える
- `tap-target`: mobile で押しやすい最小 hit area

## レスポンシブ基準

- 最低幅 320px で横スクロールを出さない。
- 390px / 430px の mobile viewport では、主要 CTA を片手操作しやすい下部または画面中央下に置く。
- tablet ではカードの横並びを増やしすぎず、metric rail と detail panel の読み順を保つ。
- desktop では mobile を引き伸ばさず、workspace / dashboard は `ui-page-grid` で作業面と補助面を分ける。
- `tracking-tight` は CSS 側で letter-spacing 0 に正規化し、日本語見出しの詰まりを避ける。

## UI Mock 保存構成

画像生成そのものは内蔵 imagegen 側で行う。この repo では、採用候補またはレビュー対象の mock を次の場所に保存する。

```text
docs/assets/ui-mocks/
  README.md
  2026-05-08/
    student-home-mobile/
      prompt.md
      390x844-v1.png
      acceptance.md
    instructor-workspace-desktop/
      prompt.md
      1440x960-v1.png
      acceptance.md
    auth-business-desktop/
      prompt.md
      1440x960-v1.png
      acceptance.md
```

命名:

- `YYYY-MM-DD_surface_viewport_variant.png`
- 採用前の比較案は `v1`, `v2`, `rejected-*` を suffix に付ける。
- 元 prompt と acceptance は画像と同じ directory に置く。

## GPT image2 Mock Prompt

### Student Home Mobile

```text
Create a high-fidelity mobile app UI mock for "Steady Study", a Japanese English vocabulary learning app for students. Viewport 390x844. Show the actual student home screen, not a marketing landing page. Use an orange primary system, warm off-white canvas, white panels, restrained slate text, and small semantic green/red/blue accents only for state meaning. Avoid teal/purple dominance, beige-heavy layout, dark slate dominance, and oversized rounded cards. The first screen must show today's one learning task, progress metrics, recommended course, and a thumb-friendly primary action near the lower half. Japanese UI copy should be realistic and concise. No overlapping text, no decorative orbs, no stock hero illustration.
```

### Instructor Workspace Desktop

```text
Create a high-fidelity desktop SaaS dashboard UI mock for "Steady Study", a Japanese cram-school English vocabulary operations workspace. Viewport 1440x960. Show the actual instructor workspace: cohort status, assignment queue, student risk signals, writing review tasks, and next actions. Make it dense, calm, scannable, and work-focused. Use orange as the product anchor with white and warm neutral surfaces, thin slate borders, and amber/red/green only for semantic states. Cards should have restrained radius around 8-16px, not pill-like. Use tables, segmented controls, icon buttons, and compact metrics. Avoid marketing hero layout, decorative blobs, teal/purple dominance, and oversized display text.
```

### Auth / Business Entry Desktop

```text
Create a high-fidelity desktop entry screen mock for "Steady Study", a Japanese English vocabulary SaaS for schools and cram schools. Viewport 1440x960. First viewport must clearly show the product name, login/signup area, student demo action, and business guide entry. Use product UI previews rather than an abstract hero illustration. The visual system should be orange primary, white panels, warm canvas, slate text, and semantic status accents. Keep card radius modest, make form controls professional, and ensure all Japanese text fits. Avoid teal/purple dominance, dark slate, decorative orbs, and generic stock imagery.
```

## Mock Acceptance Criteria

- 320px / 390px / 430px mobile widthsで文字・ボタン・カードが重ならない。
- desktop では作業領域の情報密度があり、単なる mobile layout の拡大に見えない。
- Primary CTA は画面ごとに 1 つに見える。secondary action は視覚階層を落とす。
- 角丸は panel 16px 以下、card 12px 以下を基準にする。pill は badge / chip のみに使う。
- 背景装飾で視線を奪わず、実際の product state / dashboard data が主役になっている。
- 色面は orange / white / warm neutral / slate を基調にし、green / red / blue は状態表現に限定されている。
- 日本語 UI copy は説明文が長すぎず、1 行ボタン内で窮屈にならない。

## 実装メモ

- 既存画面の `rounded-[28px]` / `rounded-[32px]` は className を変えず CSS 側で控えめな radius に正規化した。
- `medace-*` は Tailwind config 上で CSS variable 参照にしたため、今後は `styles.css` の token 更新で全体 tone を調整できる。
- `BRAND_VISUAL_SYSTEM` は UI mock prompt とコード側 token の対応を残すための参照用 export。既存 runtime copy には影響しない。
