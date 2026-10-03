# 講師・学校管理者ナビの横はみ出し修正

日本語文言改善 `fb98d106caf14ebd6d519457d67fdcddb3b227b6` を基点に、残っていた講師ナビの横はみ出しを修正した。文言改善は保持し、この変更を別コミットとする。ソースは独立クローン `medace-japanese-ui-final`、ブランチ `codex/medace-japanese-ui-final-20261002`。撮影版22dc263、元リポジトリ、41812／41828／41838、本番は変更していない。

## 原因と変更

`components/Layout.tsx` のワークスペースナビは、内部を横にスクロールさせる構成になっている。モバイルではボタンの補足説明を `sr-only` で視覚的に隠すが、これは `position: absolute` の1px要素となる。ボタンが位置の基準になっていなかったため、説明の `offsetParent` は外側のDIVだった。ナビの右端を越える説明要素が文書全体のスクロール幅に含まれていた。

実ブラウザーの同じ状態で、ボタンだけを `position: relative` にすると `offsetParent` がそのボタンに変わり、文書幅が画面幅に収まった。ナビ自身の内部スクロール幅と項目・説明は変わらなかった。CSSの因果比較は `output/workspace-nav-fix/cause-probe.json` と比較画像に記録した。

| 役割 | 画面幅 | 修正前の文書幅 | relative適用後 | ナビの内部スクロール幅 |
| --- | ---: | ---: | ---: | ---: |
| 講師 | 320 | 393 | 320 | 463 |
| 講師 | 390 | 393 | 390 | 463 |
| 学校管理者 | 320 | 554 | 320 | 624 |
| 学校管理者 | 390 | 554 | 390 | 624 |

768／1366pxと844×390pxでも同じ比較を行い、文書幅は変わらず画面内に収まった。ナビ内部の横スクロールは維持した。body全体を `overflow-x: hidden` で隠す変更はしていない。

ブラウザー標準のフォーカス移動では、後半のボタンが一部だけ見える状態も確認した。ボタンの `onFocus` で、ボタンが収まる分だけ親ナビの `scrollLeft` を動かす。3pxのフォーカス枠と3pxの余白が切れないよう、ナビの端から8pxを確保する。本文やページ全体をスクロールさせる処理は加えていない。

ナビの項目・説明・意味・選択処理・`aria-current`・表示条件は保持した。文言、作文フォーム、保存、バックエンド、権限、承認、教材やプラン条件には変更がない。

## 最終検証

- Node 22.19.0。型検査、単体133ファイル・865件、Cloudflareモードのビルドが成功。
- Chrome回帰33件成功。専用41848、合成DemoとローカルD1を使用。
- 新しいナビ回帰は講師・学校管理者×320／390／768／1366px／844×390pxの10件。全項目の読み上げ名、Tab・Shift+Tab・Enter、選択中の表示、文書とbodyの幅、フォーカス枠、ナビの内部スクロールを確認。
- 既存のモバイルstaffヘッダーはstatic、tablet以上はsticky、短い横向き画面はstaticのまま。レイアウト規則を戻していない。
- 認証5画面幅・戻る／入力保持、作文入力／保存／再提出／返却、作文の読込失敗／再試行／ラベル／5画面幅、プリントのEscape／フォーカス復帰を含む。作文の一部は実コンポーネントを合成応答で検証する既存回帰で、実AI精度や本番を検証したものではない。
- `tests/smoke/ui-audit.smoke.spec.ts` に10件を追加。既に標準smoke runnerへ登録されているファイルを拡張し、新しい未登録suiteは作っていない。

最終ログは `output/workspace-nav-fix/typecheck-final.log`、`unit-final.log`、`build-final.log`、`browser-final.log`。ナビ10件の幅・フォーカス計測と画像は `output/workspace-nav-fix/browser-final/`。

前回は利用上限により、自動承認レビューを完了できず最終実行が停止した。保存済み修正を保全したまま、2026-10-03の再開指示後に型・単体・ビルド・33件の回帰を完了した。編集を重複させず、モデル・環境は維持した。

## 保存と動画への影響

SSDが取り外されているため、成果は内蔵ディスクのこのクローンとローカル成果物フォルダーに保存する。外したマウント先や欠損リンク先に代替ディレクトリは作成していない。Node依存、教材SQL、専用D1が内蔵ディスク上にあることを確認した。

最終日本語版の専用プレビューは `http://127.0.0.1:41848`。状態は `/tmp/medace-japanese-ui-final-d1`、ビルドは `output/japanese-ui-final/dist`。再起動する場合は次を使う。

```sh
cd /Users/Yodai/Documents/Codex/2026-10-02/task-4/medace-japanese-ui-final
VITE_STORAGE_MODE=cloudflare npm run meeting:preview -- --port 41848 --dist output/japanese-ui-final/dist --state /tmp/medace-japanese-ui-final-d1 --import /tmp/medace-ui-audit-originals.local-preview.sql
```

このコミットによる動画への影響は、講師・学校管理者ナビの横はみ出し解消と、フォーカス時のナビ内部の追従。文言と操作順序はfb98d106のまま。撮影済み22dc263の素材を上書きせず、差し替える場合は41848の別録画として扱う。日本語文言の変更一覧は前コミットの `2026-10-02-yomiyasu-ui-copy.md` を参照。

本番反映・公開・push・merge・本番DB変更は行っていない。
