@AGENTS.md

# recipe-base

レシピ保存・家族共有アプリ。Next.js（App Router）+ AWS Amplify Gen 2。

## 最優先事項

**作業を始める前に `docs/design.md` を読むこと。** 全体の設計判断とその根拠が
記録されている。このリポジトリの設計には、AWS 側の制約を踏まえて意図的に
「素直でない」形を選んでいる箇所がいくつかあり、設計書を読まずに手を入れると
善意で壊すことになる。

特に、以下は**間違いに見えるが正しい**:

- **ゲストのデータを AWS に保存せず localStorage に置いている**（§5.1）
  Amplify Data の `allow.guest()` は所有者単位の分離ができないため。
  未認証 Identity は `backend.ts` で明示的に無効化してある
- **材料とラベル参照を正規化せず `Recipe` に埋め込んでいる**（§1.4）
- **検索をサーバー側でなくクライアント側で行う**（§1.5）
  DynamoDB は部分一致検索を効率的に実行できないため
- **Cognito のカスタム属性を一切使わない**（§6.2）
  User Pool のスキーマは作成時に凍結され、後から追加するとプールの
  作り直し＝全ユーザー消滅になるため。ユーザー単位の情報は
  DynamoDB の `UserProfile` モデルで扱う

設計を変更する場合は、コードだけでなく `docs/design.md` も併せて更新すること。

## 設計の中心にある規則

> すべてのデータは `teamId` を持ち、認可は「その `teamId` と同名の Cognito
> グループに所属しているか」の1問に還元される。

`Team` / `Recipe` / `Label` / `UserProfile` の4モデルすべてが同じ
`allow.groupDefinedIn('teamId')` を使う。**認可ルールを分岐させないこと。**
所有者ベースの認可とグループ認可を混在させた時点で、この設計は壊れる。

## 作業の進め方

### コミット

**粒度を細かく分ける。** 意味のある単位ごとにコミットし、混ぜない。例:

```
create-next-app を実行        → commit
npm create amplify を実行     → commit
auth/resource.ts を設計に合わせて修正 → commit
```

- ツールが生成した雛形は**未修正のままコミットする**。次のコミットの差分が
  「自分たちの設計判断」だけになり、レビューで生成物と判断が混ざらない
- コミットメッセージは日本語

### 検証

- バックエンドを変更したら `pnpm exec tsc --noEmit -p amplify/tsconfig.json`
- フロントエンドを変更したら `pnpm build`（型検査を含む）
- **バックエンドを変更した場合も `pnpm build` を通すこと。** `amplify/` は
  ルートの tsconfig から除外してあるが、`src/` が `amplify/data/resource` の
  型を参照するため、スキーマの変更はフロントエンドのビルドを壊し得る
- 認可を変更したら `pnpm test:integration`（デプロイ済み sandbox が必要）
- `pnpm exec ampx sandbox` は実際に AWS リソースを作成する。**実行前に確認を取ること**

### スコープ外（v1 では実装しない）

聞かれない限り、以下を実装したり提案したりしない。すべて意図的な除外:

- レシピ画像（`Recipe.imageKey` はフィールドのみ予約）
- チーム内のロール（管理者/一般）とメンバーの追放
- 複数チームへの同時所属
- リアルタイム同期（`observeQuery`）
- i18n（UI は日本語のみ）
- ソフトデリート / ゴミ箱

## 規約

- パッケージマネージャーは **pnpm**（`package.json` の `packageManager` で固定）。
  npm / yarn のコマンドを使わないこと。ネイティブバイナリを持つ依存を追加した
  場合は、`pnpm.onlyBuiltDependencies` への追加が必要になることがある
- `src/` ディレクトリ構成。パスエイリアスは `@/*` → `./src/*`
- Tailwind CSS は **v4**。`tailwind.config.js` は使わず CSS 側で設定する
- daisyUI のテーマは組み込みの `light` / `cupcake` / `night` / `black` を
  そのまま使い、独自テーマを定義しない
