# recipe-base

レシピを保存し、家族間で共有するための Web アプリケーション。

- レシピ（料理名・材料・分量・ラベル・メモ・参考 URL）の登録と検索
- 招待コードによる「チーム」への参加と、チーム内でのレシピ・ラベルの共有
- ログイン不要で試せるゲストモード（データは端末内にのみ保存）
- レシピ詳細での x人前スケーリング表示
- 4種類のカラーテーマ切り替え

## 技術スタック

| 領域 | 使用技術 |
|---|---|
| フロントエンド | Next.js 16（App Router）/ React 19 / TypeScript |
| スタイリング | Tailwind CSS v4 + daisyUI 5 |
| バックエンド | AWS Amplify Gen 2 |
| 認証 | Amazon Cognito |
| データベース | Amazon DynamoDB（Amplify Data 経由） |

インフラは Amplify Gen 2 の標準に従い、すべて `amplify/` 配下の TypeScript から
プロビジョニングする。CloudFormation テンプレートの直接編集や、AWS コンソールでの
手動構築は行わない。

## セットアップ

前提: Node.js 20 以上、pnpm、AWS 認証情報が設定済みであること
（`aws sts get-caller-identity` で確認できる）。

```bash
pnpm install
```

パッケージマネージャーは **pnpm** に固定している（`package.json` の `packageManager`）。
npm や yarn は使わないこと。

### バックエンド（開発用サンドボックス）

```bash
pnpm exec ampx sandbox
```

自分専用の AWS 環境にバックエンドをデプロイし、接続情報を `amplify_outputs.json` に
出力する。このファイルは Git 管理外で、フロントエンドの起動に必要になる。
実行したまま常駐させると、`amplify/` の変更を検知して自動で再デプロイする。

### フロントエンド

別のターミナルで:

```bash
pnpm dev
```

http://localhost:3000 で起動する。

## コマンド

| コマンド | 内容 |
|---|---|
| `pnpm dev` | 開発サーバーを起動 |
| `pnpm build` | 本番ビルド（TypeScript の型検査を含む） |
| `pnpm lint` | ESLint |
| `pnpm exec ampx sandbox` | バックエンドをサンドボックス環境へデプロイ |
| `pnpm exec ampx sandbox delete` | サンドボックス環境を削除 |

## ディレクトリ構成

```
amplify/          バックエンド定義（IaC）
  auth/           Cognito の設定
  data/           DynamoDB のスキーマと認可ルール
  backend.ts      バックエンド全体の組み立てと CDK による細部設定
src/app/          Next.js の App Router
docs/
  design.md       設計書（実装の判断根拠はすべてここにある）
  initial.md      当初の要件定義
```

## 設計について

**実装前に `docs/design.md` を読むこと。** 一見不自然に見える設計判断の多くは、
AWS 側の制約を踏まえた意図的なものであり、理由が設計書に記録されている。例:

- ゲストのデータを AWS に保存せず localStorage に置く理由（§5.1）
- 材料とラベル参照を正規化せず Recipe に埋め込む理由（§1.4）
- 検索をサーバー側ではなくクライアント側で行う理由（§1.5）
- Cognito のカスタム属性を使わない理由（§6.2）
