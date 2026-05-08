# UI Mock Assets

この directory は Steady Study の UI mock 保存場所です。画像生成自体は別担当の imagegen で行い、この repo では採用候補の画像、生成 prompt、acceptance criteria、レビュー結果だけを管理します。

## Directory

```text
docs/assets/ui-mocks/
  YYYY-MM-DD/
    surface-name/
      prompt.md
      acceptance.md
      390x844-v1.png
      1440x960-v1.png
```

## Naming

- `surface-name`: `student-home-mobile`, `instructor-workspace-desktop`, `auth-business-desktop` など。
- 画像: `viewport-variant.png`。例: `390x844-v1.png`, `1440x960-v2.png`, `390x844-rejected-too-rounded.png`。
- prompt と acceptance は画像と同じ directory に置く。

## Review Rules

- mock は実プロダクト画面の改善案として扱い、landing page 風の抽象画像だけで採用しない。
- one-note orange / purple-blue gradient / beige-heavy / dark slate dominant な案は採用しない。
- mobile 320px 相当で text overflow、button overflow、カード重なりがないことを確認する。
- 角丸は panel 16px 以下、card 12px 以下を基準にし、pill は badge / chip に限定する。
- 採用した mock の意図は `docs/ui-ux-redesign-2026-05-08.md` に反映する。
