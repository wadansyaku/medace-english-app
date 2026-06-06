# Phase 0: Brand, PWA, Copy Direction

Date: 2026-06-05

## 決定事項

- 画面上の正式名称は `Steady Study` に統一する。`MedAce` はリポジトリ名や過去文脈として扱い、学習者向け UI / PWA 表示名には戻さない。
- 事業の主軸は教室・塾向けの B2B SaaS。個人利用のスマホ PWA は、生徒が自分の教材で学習を続ける入口として位置づける。
- 学習者ホームは「今日やることは1つだけ」を守る。初回教材作成では Hero の主CTAを唯一の第一導線にし、右レールやプラン欄は状況確認に寄せる。
- 公式コースは教室契約の教材配信で使う前提にする。個人利用では My単語帳 を主導線にする。

## Copy Rules

- ボタン文言は短く、操作をそのまま表す: `教材を作る`, `プランを作る`, `学習を始める`。
- 状態説明は1文で止める。長い価値訴求やマーケティング文は学習ホームに置かない。
- `今日の入口` のような抽象語は避け、`今日やること` のように生徒が次の行動を判断できる語にする。
- B2B と個人利用の権限差は、責める表現ではなく「どこで使えるか」を明示する。

## Visual Boundaries

- 実装の一次情報は `config/brand.ts`, `styles.css`, `tailwind.config.js` に置く。
- 強い orange gradient、purple dominance、dark slate dominance、過度な丸みは避ける。
- Orange は product anchor と主CTAに限定し、green / red / blue は状態色として使う。
- 学習ホームは landing page ではなく、実際の学習状態と次の行動を first viewport に出す。

## PWA Promise

- `public/manifest.webmanifest`, `index.html`, app icon は `Steady Study` 表記を維持する。
- `theme_color` と `background_color` は穏やかな学習キャンバスとして扱い、主CTA色とは分ける。
- スマホ幅 320px / 390px / 430px で横 overflow とCTAの重複を出さない。

## Mock Asset Policy

- UI mock は `docs/assets/ui-mocks/` に prompt と acceptance を添えて保存する。
- GPT image2 を使う場合も、採用理由と却下理由を同じディレクトリに残す。
- Mock は実プロダクト画面を描く。抽象 hero、装飾 blob、読めない日本語 microcopy は不採用にする。

## Verification

- Brand/PWA 契約は `tests/brand-pwa-tokens.test.ts` で守る。
- 初回教材作成の導線は Hero CTA と smoke test で守る。
- Dashboard の回帰確認では 320px / 390px / 1024px / 1366px を優先する。
