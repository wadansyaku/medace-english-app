# 教材 Source Ledger 最小運用仕様

## 目的

教材 source ledger は、公式教材・ライセンス教材を D1 に投入して学習者へ表示する前に、出典、権利、変換、レビューの根拠を最小限で残すための運用台帳です。D1 は実行時の配信データ、`content:qa` は教材内容の品質チェック、source ledger は「この教材を表示してよいか」を判断する運用証跡として分けて扱います。

## 台帳の最小フィールド

1つの行は「1つの教材ソース、1つの版、1つの変換単位」を表します。CSV、JSON、Markdown table のいずれでもよいですが、次の列名は変えません。

| Field | 必須 | 内容 |
| --- | --- | --- |
| `source_id` | 必須 | 再取り込みしても変えない安定ID。教材名だけでなく、出版社・提供元・版を含めた slug にする。版や権利根拠が変わる場合は新しい `source_id` を作る。 |
| `catalog_source` | 必須 | D1 の `books.catalog_source` と同じ分類。公式/ライセンス教材は `STEADY_STUDY_ORIGINAL` または `LICENSED_PARTNER`。個人教材の `USER_GENERATED` は source ledger の公式配信対象にしない。 |
| `book_title` | 必須 | 学習者または管理画面に出る教材名。D1 の `books.title` と照合できる表記にする。 |
| `edition` | 必須 | 版、改訂、年度、提供バージョン。未記載の教材でも `unknown` ではなく、確認した範囲を `notes` に残す。 |
| `rights_status` | 必須 | 表示可否の権利状態。表示可能値は `internal_original`、`licensed`、`public_domain` のみ。`pending`、`blocked`、`unknown` は学習者へ表示しない。 |
| `source_file` | 必須 | 変換元ファイルの正本パス、ストレージキー、または受領ファイル名。公開URLではなく、運用者が再確認できる正本を指す。 |
| `extracted_at` | 必須 | 抽出または変換を実行した日時。ISO 8601 形式で timezone 付きにする。 |
| `transform_log` | 必須 | 変換コマンド、スクリプト名、入力 hash、出力先、手修正の有無、`content:qa` report の場所を短く残す。 |
| `review_status` | 必須 | レビュー状態。学習者表示は `approved` のみ。`draft`、`qa_ready`、`needs_fix`、`rejected` は管理・検証用に止める。 |
| `notes` | 必須 | 例外、権利確認者、利用範囲、非表示判断、今後の確認事項。空欄にせず `none` と書く。 |

## 公式/ライセンス教材を表示する条件

公式教材またはライセンス教材は、次をすべて満たす場合だけ学習者向けの一覧、推奨コース、学習画面に出します。

- source ledger に `source_id`、`catalog_source`、`book_title`、`edition`、`rights_status`、`source_file`、`extracted_at`、`transform_log`、`review_status`、`notes` がすべて入っている。
- `catalog_source` が `STEADY_STUDY_ORIGINAL` または `LICENSED_PARTNER` で、D1 の `books.catalog_source` と一致している。
- `rights_status` が `internal_original`、`licensed`、`public_domain` のいずれかで、利用範囲が `notes` に明記されている。
- `review_status` が `approved` である。
- `transform_log` に再現可能な変換手順と `content:qa` report の参照がある。
- D1 の `books.access_scope` が配信方針と合っている。`ALL_PLANS` は全プラン向け、`BUSINESS_ONLY` はビジネス有料利用者向けに限定する。
- `content:qa` で必須語義の空欄、未抽出 marker、重複、出典 coverage に release-blocking な問題が残っていない。

現在の runtime は主に `catalog_source` / `access_scope` で表示範囲を制御するため、source ledger の確認は seed・D1 反映・release 前の運用ゲートとして必ず先に行います。`rights_status` が `pending` または `unknown` の教材を、D1 に入っているという理由だけで表示してはいけません。

## 個人 My単語帳との差分

個人 My単語帳は `catalog_source = USER_GENERATED`、`created_by` ありのユーザー生成教材として扱います。公式/ライセンス教材とは目的と責任境界が違うため、次のように分けます。

- source ledger は必須にしない。ユーザーが自分の学習用に作った素材であり、公式カタログや教材配信の根拠として使わない。
- 学習者向けの表示名は My単語帳 として扱い、`LICENSED_PARTNER` や公式教材のラベルを付けない。
- `access_scope` は通常 `ALL_PLANS` だが、表示先は作成者または所属 workspace の権限に従う。
- `content:qa` は取り込み品質の補助には使えるが、権利確認や公式表示の承認を意味しない。
- My単語帳から公式教材へ昇格する場合は、新しい source ledger 行を作り、権利確認、変換証跡、レビュー承認をやり直す。

## D1 と content:qa との関係

D1 は配信に使う正本で、source ledger は配信してよい根拠です。D1 の `material_source_ledger` は公式/ライセンス教材の `source_id`、`rights_status`、`review_status`、content QA 結果を保持します。`books` は配信データ、`material_source_ledger` は学習者の自動候補にしてよいかを判断する根拠として分けます。

- `books.title` は ledger の `book_title` と照合する。
- `books.catalog_source` は ledger の `catalog_source` と一致させる。
- `books.access_scope` は表示範囲の runtime gate として使う。
- `books.source_context` は運用者向け補助情報に留め、公開コピーや権利根拠の正本にしない。
- `words.source_sheet` と `words.source_entry_id` は source ledger の `source_file` / `transform_log` に戻れる粒度で残す。
- `material_source_ledger.rights_status = approved` かつ `review_status = approved` で、content QA の blocking metrics が 0 の教材だけを Today Focus や週次ミッションの自動候補にする。

`npm run content:qa -- --input <path> --output <report.json>` は、CSV、JSON、XLSX、または D1-shaped JSON から、空欄、未抽出 marker、重複、例文 coverage、カテゴリ coverage、出典 coverage を確認するために使います。本番またはローカルD1の配信データを直接確認する場合は、読み取り専用の `npm run content:qa:d1 -- --remote --database medace-db --output tmp/content-qa/production-content-qa.json --raw-output tmp/content-qa/production-books-words.json` を使います。既定では `USER_GENERATED` と `created_by` 付きの個人教材を除外し、公式/オリジナル配信教材だけを確認します。個人教材まで含める場合は `--include-user-books` を明示します。

`content:qa` が green でも権利確認は完了しません。逆に source ledger が `approved` でも、`content:qa` が blocking issue を示す場合は D1 反映や表示を止めます。

## 最小運用フロー

1. 変換前に source ledger 行を作り、`source_id`、`catalog_source`、`book_title`、`edition`、`rights_status`、`source_file` を埋める。
2. 抽出・整形を実行し、`extracted_at` と `transform_log` にコマンド、入力 hash、出力、手修正の有無を追記する。
3. `content:qa` を実行し、report の場所と blocking issue の判断を `transform_log` または `notes` に残す。
4. レビュー担当者が権利、タイトル、版、D1 mapping、QA report を確認し、問題なければ `review_status = approved` にする。
5. seed SQL または import 経由で D1 に反映し、`books.catalog_source`、`books.access_scope`、`words.source_sheet`、`words.source_entry_id` を spot check する。
6. release 前に source ledger 行、`content:qa` report、D1 spot check の3点が揃っていることを確認する。
