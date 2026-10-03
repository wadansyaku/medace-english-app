# 横向き学習の操作バーと単語の重なり

「Naruシスト」名称変更版 `1c0cc5637d392db2c39ce1f429818a59a60745ec` の画像確認から、横向き学習画面の既存不具合を追加発見した。名称変更版と41858を保持し、独立clone・ブランチ `codex/medace-study-landscape-20261003` と専用41868で確認・修正した。

844×390で原本名詞の学習を開くと、単語の矩形はy=354.89〜405.89、sticky操作バーはy=308.95〜390にあり、35.11pxが重なっていた。フルページ画像だけで判断せず、実viewportで矩形・computed style・viewport画像を取得して再現を確認した。

`components/StudyMode.tsx` の操作バーに、高さ500px以下のとき `position: static` とする指定を追加した。短い画面では操作バーをカードの下に配置して、ページの縦スクロールで単語と回答操作へ到達できる。縦向きのsticky操作、カード・回答保存処理、教材名・教材IDは維持する。同じ844×390の原本名詞で、操作バーはy=543.28〜624.33となり、単語との重なりは0pxになった。

既存の標準runner登録済み `tests/smoke/ui-audit.smoke.spec.ts` に667×375と844×390の2ケースを追加した。単語と操作バーが重ならず、単語と回答操作を全体表示までスクロールできること、390×844へ回転するとstickyに戻ること、回答後に次の単語へ進み、保存済み進捗が1語になることを検証する。スクロールは中央表示を指定し、ブラウザーのnearest配置で生じる0.4pxの端数クリップを避けて、全体表示を検証した。

`verify:fast`（migration replay、到達性、依存境界、型、unit 871件）とbuild成功。同じ追加修正版でChromeの既存28ケースが成功し、追加2ケースも成功した。原本名詞の実画面でも0pxを再確認した。バックエンド・教材名更新処理は名称変更コミットから変更していないため、そのコミットで完了したAPI統合回帰の範囲を維持する。

専用D1は `/tmp/medace-study-landscape-d1`。原本4教材は名称変更版が生成したローカル専用SQLから取り込んだ。他担当の41812/41828/41838/41848、名称変更のみの41858、原本repo、本番DB、実生徒データへ変更を加えていない。動画撮影用の担当生徒fixtureは移していない。

```sh
VITE_STORAGE_MODE=cloudflare npm run meeting:preview -- --port 41868 --dist output/study-landscape/preview/dist --state /tmp/medace-study-landscape-d1 --import /Users/Yodai/Documents/Codex/2026-10-02/task-4/medace-naru-series/output/naru-series/import/original-workbooks.local-preview.sql
```

取り込みSQLを再生成する場合は `scripts/audit-original-workbooks.mjs` を使う。名称変更の説明と原本対応表は [Naruシストの検証記録](2026-10-03-naru-series-titles.md) を参照。
