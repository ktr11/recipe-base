# レシピ共有アプリ 設計書（フェーズ1）

`initial.md` の要求に基づく設計案。実装は本ドキュメントの承認後に着手する。

---

## 0. `initial.md` からの変更点

議論の結果、当初仕様から意図的に変更した判断を先に明示する。

| # | 当初仕様 | 変更後 | 理由 |
|---|---|---|---|
| 1 | ゲストのデータを Cognito 未認証 Identity で **DynamoDB に保存** | ゲストのデータは **localStorage に保存**（AWS には保存しない） | Amplify Data の `allow.guest()` は所有者単位の分離ができない。素直に実装すると全ゲストが他の全ゲストのレシピを閲覧・編集・削除できる公開テーブルになり、件数制限のカウントも破綻する。詳細は §5 |
| 2 | 「個人のレシピ」と「チームのレシピ」が併存する読み取り | **全ユーザーが常に1つのチームに属する**。サインアップ時に「自分1人のチーム」を自動生成 | 認可ルールが1本に統一され、UI から個人/チームのモード切替が消える |
| 3 | 招待コードの有効/無効 | 招待コードは **発行から1時間で失効** | 常時有効な共有コードの漏洩リスクを時間で限定する |
| 4 | `tailwind.config.js` に daisyUI 設定 | **Tailwind CSS v4 + daisyUI 5**。設定は CSS 側（`@plugin "daisyui"`） | v4 では `tailwind.config.js` を使用しない |
| 5 | 材料・分量（自由文字列） | **`{ 材料名, 数量, 単位 }` に構造化** + レシピ詳細での **x人前スケーリング UI** | 追加要件 |
| 6 | （記載なし） | **レシピ画像は v1 では実装しない**。`imageKey` フィールドのみ予約 | localStorage 上限（約5MB）とゲスト画像が両立しない。§7 参照 |

### 確定した前提

- 利用規模は **家族単位**。不特定多数への一般公開は想定しない。この前提が DynamoDB 採用とクライアント側検索の根拠になっている
- **1ユーザーは同時に1チームのみ**に所属する
- チーム内に**ロール（管理者/一般）の概念を持たない**。全メンバーが同権限
- UI は**日本語のみ**。i18n の仕組みは入れない

---

## 1. データモデル設計（Amplify Data Schema）

### 1.1 モデル一覧

| モデル | 役割 | 認可の要旨 |
|---|---|---|
| `Team` | チーム（＝データの所属単位。個人も「1人のチーム」） | 同チームのメンバーのみ |
| `Recipe` | レシピ本体。材料とラベル参照を**埋め込み**で持つ | 同チームのメンバーのみ |
| `Label` | ラベル | 同チームのメンバーのみ |
| `UserProfile` | 表示名・テーマ・所属チーム。**Cognito 属性のチーム内向け投影** | 本人は全操作／同チームは読み取りのみ |

**ゲスト用のモデルは存在しない。** ゲストのデータは AWS 上に一切保存されない（§5）。

### 1.2 設計の中心にある1つの規則

> **すべてのデータは `teamId` を持ち、認可は「その `teamId` と同名の Cognito グループに所属しているか」の1問に還元される。**

`Recipe` / `Label` / `UserProfile` / `Team` のすべてが同じ `allow.groupDefinedIn("teamId")` を使う。所有者ベースの認可とグループ認可を分岐させない。

これを成立させるため、**Cognito グループ名は teamId の値そのもの**とする（例: グループ名 `01J8XQ...`）。`Team` モデルは `teamId` を主キーとして宣言し、自動採番の `id` を使わない。

### 1.3 スキーマ定義（`amplify/data/resource.ts`）

```ts
import { a, defineData, type ClientSchema } from '@aws-amplify/backend'
import { teamFunction } from '../functions/team/resource'

const schema = a.schema({
  // ---- 埋め込み型（テーブルではない） ----
  Ingredient: a.customType({
    name:     a.string().required(),
    quantity: a.float(),    // null 可。「適量」などスケール不能な材料は null
    unit:     a.string(),   // 「個」「g」「大さじ」「適量」など
  }),

  // ---- チーム ----
  Team: a
    .model({
      teamId:              a.id().required(),
      name:                a.string().required(),
      inviteCode:          a.string(),
      inviteCodeExpiresAt: a.datetime(),
      memberCount:         a.integer().required().default(1),
    })
    .identifier(['teamId'])
    .secondaryIndexes((index) => [index('inviteCode')])
    .authorization((allow) => [
      allow.groupDefinedIn('teamId').to(['read', 'update']),
      allow.resource(teamFunction), // 作成・削除・招待コード検証は Lambda のみ
    ]),

  // ---- レシピ ----
  Recipe: a
    .model({
      teamId:      a.id().required(),
      title:       a.string().required(),
      url:         a.string(),
      servings:    a.integer().required().default(2),
      ingredients: a.ref('Ingredient').array(),
      labelIds:    a.id().array(),
      memo:        a.string(),
      imageKey:    a.string(), // v1 未使用。将来の S3 連携用に予約
    })
    .secondaryIndexes((index) => [index('teamId')])
    .authorization((allow) => [
      allow.groupDefinedIn('teamId'),
      allow.resource(teamFunction), // チーム移動時の一括書き換え
    ]),

  // ---- ラベル ----
  Label: a
    .model({
      teamId: a.id().required(),
      name:   a.string().required(),
    })
    .secondaryIndexes((index) => [index('teamId')])
    .authorization((allow) => [
      allow.groupDefinedIn('teamId'),
      allow.resource(teamFunction),
    ]),

  // ---- ユーザープロフィール ----
  UserProfile: a
    .model({
      userId:      a.id().required(),   // Cognito sub
      teamId:      a.id().required(),
      displayName: a.string().required(),
      theme:       a.string().required().default('light'),
    })
    .identifier(['userId'])
    .secondaryIndexes((index) => [index('teamId')])
    .authorization((allow) => [
      allow.ownerDefinedIn('userId').to(['read', 'update']),
      allow.groupDefinedIn('teamId').to(['read']),
      allow.resource(teamFunction),
    ]),

  // ---- カスタムミューテーション（すべて Lambda 実装） ----
  joinTeam: a
    .mutation()
    .arguments({ inviteCode: a.string().required() })
    .returns(a.customType({ teamId: a.string(), teamName: a.string() }))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(teamFunction)),

  leaveTeam: a
    .mutation()
    .returns(a.customType({ teamId: a.string() }))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(teamFunction)),

  issueInviteCode: a
    .mutation()
    .returns(a.customType({ inviteCode: a.string(), expiresAt: a.string() }))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(teamFunction)),

  repairAccount: a
    .mutation()
    .returns(a.customType({ teamId: a.string() }))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(teamFunction)),
})

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
})
```

### 1.4 意図的に正規化しなかった箇所

**材料を別モデルにしない（`Recipe.ingredients` に埋め込む）**

- 材料名の**部分一致検索はどのみちクライアント側で行う**（§1.5）ため、別テーブルにして得られる検索上の利点がない
- 別モデルにすると、レシピ編集のたびに子レコードの差分（追加/更新/削除）計算が必要になり、しかも**アトミックに保存できない**。通信が途中で切れると材料だけ半分更新された状態が残る
- 材料は**並び順に意味がある**。別モデルでは order フィールドの手動管理が必要になる
- 埋め込みなら、レシピの保存は常に**1回の書き込み**で完結する

**ラベルを中間テーブルにしない（`Recipe.labelIds` に ID 配列を持つ）**

- Amplify Gen 2 は `manyToMany` を廃止しており、正攻法では `RecipeLabel` 中間モデルの自前定義が必要
- 中間モデルにすると一覧取得がネストクエリになり **N+1** を踏む。全件をクライアントに載せる方針と特に相性が悪い
- 代償として**参照整合性が保証されない**。対策は §1.6

### 1.5 検索をクライアント側で行う理由

仕様の「材料名の**部分一致**検索」は、**DynamoDB がサーバー側で効率的に実行できない操作**である。`contains` フィルタは存在するが実体は「全件読んでから捨てる」動作で、インデックスが効かない。加えて日本語の表記ゆれも DynamoDB 側では吸収できない。

したがって：

- **チームのレシピ全件をクライアントに読み込み、メモリ上で絞り込む**
- キー入力ごとの通信がゼロなので体感が即座
- 家族利用ではレシピは数十〜数百件で、1クエリで取得できる規模

**限界（設計書として明記する）**：数千件規模になると初回ロードが重くなる。その時点で OpenSearch 等の検索インデックスを追加する移行になるが、**スキーマは変更せずに済む**。

### 1.6 参照整合性の扱い（ラベル削除）

`labelIds` は外部キー制約を持たないため、以下の運用で担保する：

1. ラベル削除時、確認モーダルに「**N件のレシピからこのラベルが外れます**」と件数を表示（クライアントに全レシピがあるため即座に数えられる）
2. 削除実行時、該当レシピの `labelIds` から当該 ID を除去する更新をまとめて発行
3. 上記が途中で失敗しても壊れないよう、**読み込み時に存在しない labelId は無視する**（表示・絞り込みの対象外とする）

3 が最終防衛線であり、2 が失敗しても UI 上の不整合は発生しない。

### 1.7 既知の弱点

- `UserProfile.teamId` は本人が `update` 可能なため、理論上は任意の値に書き換えられる。ただし**対応する Cognito グループを持たないため、そのチームのレシピは読めない**。影響は「他チームのメンバー一覧に自分が表示される」ことに限定される。実装時は `teamId` にフィールドレベル認可を適用し、Lambda（IAM）以外からの書き込みを禁止して塞ぐ
- Cognito のグループ数上限（デフォルト 10,000／緩和申請可）が**チーム総数の上限**になる。家族利用の規模では問題にならないが、制約として認識しておく

---

## 2. 招待コードによるチーム参加の処理フロー

### 2.1 なぜ Lambda が必須か

> **招待コードを入力する人は、まだそのチームのメンバーではない。** したがってクライアントから `Team` レコードを読んでコードを照合することが原理的にできない（読めるなら誰でも全チームのコードを列挙できてしまう）。照合は必ずサーバー側で行う必要がある。

加えて、Cognito グループの作成・所属変更は Admin API であり、クライアントからは実行できない。

**この構成は標準的である。** Admin API の "Admin" は「人間の管理者が使う」ではなく「開発者側の信頼された資格情報が必要」の意味であり、サーバー側から呼ぶことが設計上の想定用途である。`post-confirmation` トリガーから `AdminAddUserToGroup` を呼ぶのは AWS 公式ドキュメントにも記載のある定型パターン。避けるべきは「ブラウザから Admin API を叩ける」構成であり、本設計ではクライアントは認証必須のミューテーションしか呼べない。

### 2.2 Lambda 構成

| 実体 | 種別 | 責務 |
|---|---|---|
| `postConfirmationFunction` | Cognito トリガー | サインアップ確定時に個人チームを生成 |
| `teamFunction` | AppSync リゾルバ | `joinTeam` / `leaveTeam` / `issueInviteCode` / `repairAccount` の4ミューテーションを処理 |

IAM 権限は**対象 User Pool の ARN に限定**し、以下のみを付与する。`cognito-idp:*` は付与しない。

```
cognito-idp:CreateGroup
cognito-idp:DeleteGroup
cognito-idp:AdminAddUserToGroup
cognito-idp:AdminRemoveUserFromGroup
```

### 2.3 招待コードの仕様

- **形式**: 大文字英数字8桁。紛らわしい文字（`0` `O` `1` `I` `L`）を除外した文字セットを使用し、`ABCD-2345` のようにハイフン区切りで表示する。UUID は口頭・手入力で伝達できないため使用しない
- **有効期限**: 発行から**1時間**
- **発行者**: メンバー全員が発行可能（ロールを持たないため）
- **再発行**: `Team.inviteCode` は1フィールドなので、再発行すると**旧コードは自動的に無効になる**
- **照合**: `Team` の `inviteCode` セカンダリインデックスで検索

> **⚠️ 有効期限の判定に DynamoDB の TTL を使用してはならない。** TTL 削除は best-effort であり、期限到達から**最大48時間**削除が遅れる。TTL に頼ると期限切れコードが2日間有効なままになる。Lambda 側で `inviteCodeExpiresAt > now` を明示的に比較することが唯一の正解。TTL は掃除用途としてのみ併用可

### 2.4 フロー: サインアップ（個人チーム生成）

```
ユーザーがメール確認コードを入力
  ↓
Cognito が post-confirmation トリガーを起動
  ↓
Lambda:
  1. teamId を生成（ULID）
  2. Cognito グループ `${teamId}` を作成
  3. ユーザーを当該グループに追加
  4. Team レコードを作成（name: "マイレシピ", memberCount: 1）
  5. UserProfile を作成（userId: sub, teamId, displayName: メールのローカル部, theme: 'light'）
  ↓
クライアント: fetchAuthSession({ forceRefresh: true }) で新グループのクレームを取得
```

> **⚠️ このトリガーが失敗しても、ユーザーの確認自体は既に完了している。** 結果「確認済みだがチームが無い」ユーザーが生まれ、以後すべての画面が空になる。対策として §2.7 の自己修復パスを必ず実装する。

### 2.5 フロー: 招待コードによる参加

`joinTeam(inviteCode)` の処理順序。**この順序に意味がある。**

```
 1. 呼び出し元の sub を event.identity から取得
 2. inviteCode で Team を検索          → 見つからなければ「無効なコード」
 3. inviteCodeExpiresAt > now を検証   → 失効していれば「期限切れ」
 4. memberCount < 20 を検証            → 超過なら「満員」
 5. 参加先 == 現在の所属 を検証        → 同一なら「既に参加済み」
 6. 新チームの Cognito グループにユーザーを追加   ← 先に権限を付与
 7. 旧チームの Recipe / Label を全件取得し、teamId を新チームへ書き換え
 8. UserProfile.teamId を新チームへ更新
 9. 新チームの memberCount をインクリメント
10. 旧チームからユーザーを削除:
      旧チームが1人チームだった場合 → Team レコードと Cognito グループを削除
      （旧チームに他メンバーが居る状態は、1ユーザー1チーム制のため発生しない）
11. 旧 Cognito グループからユーザーを削除
  ↓
クライアント:
  fetchAuthSession({ forceRefresh: true })  ← 必須。旧トークンには新グループが無い
  → /recipes へ遷移
```

**手順6を7より前に置く理由**: Lambda は IAM 認可でデータを書き換えるため厳密には順序依存しないが、6→7→11 の順序により、処理が途中で失敗した場合でもユーザーは**新旧どちらかのグループには必ず所属している**状態が保たれ、データにアクセスできなくなる事態を避けられる。

**失敗時の扱い**: 7 の途中で失敗した場合、一部のレシピが旧 teamId のまま残る。この状態はユーザーからは「レシピが減った」ように見える。`repairAccount`（§2.7）が旧チームの残存データを検出して移送を完了させる。

### 2.6 フロー: チームからの離脱

`leaveTeam()`。**離脱者はレシピを一切持ち出さない**（確定事項）。

```
 1. 新しい個人チーム（teamId, Cognito グループ, Team レコード）を作成
 2. ユーザーを新グループに追加
 3. UserProfile.teamId を新個人チームへ更新
 4. 旧チームの memberCount をデクリメント
 5. デクリメント結果が 0 の場合:
      旧チームの Recipe / Label を全削除
      Team レコードを削除
      Cognito グループを削除
 6. 旧 Cognito グループからユーザーを削除
  ↓
クライアント: fetchAuthSession({ forceRefresh: true })
```

**UI 側の必須要件**: 離脱ボタンには「**レシピはチームに残り、あなたの手元には残りません**」と明示する確認モーダルを置く。これが無いと、誤操作で自分のレシピを失ったという事故が発生する。

### 2.7 自己修復（`repairAccount`）

**すべてのサインイン後に、クライアントは自分の `UserProfile` の存在を確認する。** 存在しなければ `repairAccount` を呼ぶ。

`repairAccount` の処理：

1. `UserProfile` が無ければ、§2.4 と同じ手順で個人チームを新規作成
2. `UserProfile` はあるが対応する Cognito グループに所属していなければ、グループへ追加
3. `UserProfile.teamId` 以外の teamId を持つ `Recipe` / `Label` が旧チームに残っていれば移送を完了（§2.5 手順7の中断からの復旧）

これにより、`post-confirmation` の失敗と `joinTeam` の中断の両方から回復できる。

---

## 3. 画面遷移・ルーティング設計

### 3.1 ルート一覧

| ルート | ゲスト | 内容 |
|---|---|---|
| `/` | ○ | ランディング。「ゲストとして利用」「サインイン / 新規登録」 |
| `/recipes` | ○ | レシピ一覧 + 検索・絞り込み |
| `/recipes/new` | ○ | レシピ新規作成（ゲストは3件で遮断） |
| `/recipes/[id]` | ○ | 詳細（x人前スケーリング）・編集・削除 |
| `/labels` | ○ | ラベル管理（ゲストは3件で遮断） |
| `/settings` | △ | **テーマ設定のみゲストも利用可**。表示名変更・パスワード変更は認証時のみ表示 |
| `/team` | ✕ | チーム作成・招待コード発行・メンバー一覧・離脱 |
| `/auth/sign-in` | ○ | サインイン |
| `/auth/sign-up` | ○ | 新規登録（メール確認コード入力を含む） |
| `/auth/reset-password` | ○ | パスワードリセット |

`/settings` を部分開放するのは、**テーマ設定が localStorage 駆動でゲストでも完全に動作するため**。ここを閉じるとゲストがダークテーマを選べず不自然になる。

### 3.2 保護の実装

**`/team` のみ Next.js middleware で保護する。**

- 保護が必要なルートが実質 `/team` の1つしかないため、middleware は最小構成で足りる
- `/settings` はページ内で認証セクションを出し分けるだけでよく、middleware の対象外

### 3.3 ゲストと正規ユーザーで画面を共有する

**同一ルートを共有し、データ層のみ差し替える。**

```
RecipeRepository (interface)
  ├── LocalStorageRepository  … ゲスト。トライアル制限の強制もここ（§4）
  └── AmplifyRepository       … 正規ユーザー
```

画面コンポーネントは「データがどこに保存されるか」を一切知らない。`/trial/recipes` のような別ルートを設けると**レシピ UI 一式を2系統保守する**ことになり、片方だけ修正して挙動がズレる事故が確実に起きるため採用しない。

### 3.4 サーバーコンポーネントの利用範囲

**正規ユーザーの一覧初期表示にはサーバーコンポーネントを使う。** Amplify Gen 2 は Next.js サーバーコンポーネントからの認証付きデータ取得を公式にサポートしており（`createServerRunner`）、一覧の初回描画をサーバー側で済ませてローディングスピナーを排除できる。

**そのために必要な前提が2つある：**

1. **認証トークンの保存先を localStorage から Cookie に変更する。** サーバーコンポーネントは localStorage を読めないため、`cookieStorage` を明示設定しないと SSR 側が「未認証」と判定する。デフォルト設定のままでは動作しない
2. `/recipes` は取得元が分岐する。サーバーコンポーネントが「認証済みならチームのレシピを取得して `initialRecipes` として渡す／ゲストなら `undefined`」とし、クライアントコンポーネントは「`initialRecipes` があれば使用、無ければ localStorage から読む」で受ける

**ゲストの画面はサーバーレンダリングできない**（データが localStorage にあるため）。この非対称性は設計上受け入れる。

### 3.5 チームメンバーの変更反映

**SSR による初期データ + タブフォーカス復帰時の再取得**。リアルタイム購読（`observeQuery`）は採用しない。

- 画面を開いた時点で最新、タブに戻った時点で最新。自分の変更は楽観更新で即時反映
- 家族利用で「同時刻に別々の端末で編集し続ける」状況は実際には発生しないため、この鮮度で実用上足りる
- `observeQuery` は常時 WebSocket 接続を張り、かつ**自前で初回スナップショットを流すため SSR の初期データと二重取得になる**。その調停コストを最初から抱える価値はない
- 不足を感じた時点で `observeQuery` に移行でき、その際**スキーマは変更不要**

---

## 4. トライアル制限のバリデーション方針

### 4.1 制限内容

| 対象 | 上限 |
|---|---|
| レシピ | 3件 |
| ラベル | 3件 |
| 1レシピあたりの材料 | 10個 |

- 制限は「累計」ではなく**「同時保有数」**。1件削除すれば1件作成できる。累計制は「消したのに作れない」となり試用の妨げにしかならない
- **正規ユーザーには一切の上限を設けない**
- 既に材料10個を持つレシピの**編集は許可**する（保存時に個数が増えていなければ通す）

### 4.2 強制する場所と、表示する場所を分ける

**強制は Repository 層、表示はフック。**

```
LocalStorageRepository.createRecipe()
  └─ 内部で保有件数を検査し、超過していれば TrialLimitError を throw
       ← ここが唯一の関門

useTrialLimits()
  └─ 「残り何件か」を返すだけ。判定の責任は持たない（表示専用）
```

判定をコンポーネントやフックにのみ置くと、**新しい作成経路（複製機能、インポート等）を追加した人がチェックを書き忘れる**のが典型的な壊れ方になる。Repository 層に置けば、どの経路から作成しても必ずこの1点を通る。

正規ユーザー用の `AmplifyRepository` は制限判定を持たない。ゲストのデータは AWS に到達しないため、**サーバー側での強制は不要**であり、localStorage の内容が改竄されても被害はその端末のユーザー自身に閉じる。

### 4.3 UX: 入口で止め、保存時は最後の砦

フォームを全て埋めさせてから保存ボタンで弾くのは最悪の体験になる。**上限到達は入力を始める前に伝える。**

| 状態 | 挙動 |
|---|---|
| レシピ 3/3 | 一覧の「新規作成」ボタンを**無効化**し、その場に「トライアルは3件まで。無料登録で無制限に」と登録導線を表示 |
| ラベル 3/3 | 同上（ラベル管理画面） |
| 材料 10/10 | 「材料を追加」ボタンを**無効化**（フォーム内で完結するためモーダル不要） |
| 保存時に例外到達 | **本来到達しない経路**の保険。到達した場合は daisyUI モーダルで通知 + 登録導線 |

一覧・フォームには常時「2/3」形式の残数表示を出す。

**アラートは `window.alert()` を使わない。** テーマが適用されず、登録への導線ボタンも配置できないため、daisyUI の modal で実装する。

---

## 5. 補遺: ゲストデータの扱いと引き継ぎ

### 5.1 ゲストのデータを AWS に保存しない理由

Amplify Gen 2 の `allow.guest()` は**所有者ベースの分離ができない**。`owner` フィールドは Cognito User Pool のユーザーにしか紐づかず、Identity Pool の未認証 ID では機能しない。素直に実装すると：

- 世界中の全ゲストが、他の全ゲストのレシピを**閲覧・編集・削除できる**
- 「3件まで」の件数カウントが他人のデータを含むため**破綻する**

クライアント生成の `guestId` でフィルタする案は、**サーバー側で強制されない**ため DevTools から他人のデータを全て読める。Cognito Identity ID をサーバー側で強制するには Lambda オーソライザまたはカスタムリゾルバの自作が必要で、Gen 2 の標準スキーマ定義から外れ実装コストが数倍になる。

トライアル機能に求められる価値は「本登録前に触れること」であって「クラウド永続化」ではないため、**localStorage を採用する**。副次的な利点として、`amplify/data` が認証ユーザーのみを考えればよくなり認可ルールが大幅に単純化する。

### 5.2 localStorage のデータ形式

**サーバーの `Recipe` と同一の形**で保持する。形を揃えることで、引き継ぎ処理が単純なループで済む。

```ts
{
  id: string,              // クライアント生成
  title: string,
  url?: string,
  servings: number,
  ingredients: { name: string, quantity?: number, unit?: string }[],
  labelIds: string[],      // ローカル生成 ID
  memo?: string,
  migrated?: boolean,      // 引き継ぎ済みフラグ（§5.4）
}
```

### 5.3 引き継ぎの実行順序

引き継ぎは `post-confirmation` Lambda では実行できない（Lambda から localStorage は見えない）。**サインイン後のクライアント側**で実行する。

```
サインアップ → post-confirmation Lambda が個人チームを作成
  ↓
fetchAuthSession({ forceRefresh: true })   ← 新グループのクレームを取得
  ↓
UserProfile の存在を確認（無ければ repairAccount / §2.7）
  ↓
localStorage を読み、DynamoDB へ書き込み
  ↓
全件成功後に localStorage をクリア
```

> **⚠️ この順序を守らないと、まだ権限のないトークンで書き込むことになり全て Unauthorized になる。**

**ラベル ID の付け替え（見落としやすい点）**: ゲストのレシピは `labelIds` にローカル生成 ID を持つ。**先に `Label` を作成してローカル ID → サーバー ID の対応表を構築し、その後レシピの `labelIds` を置換して登録する。** 順序を逆にすると、ラベルが全て外れたレシピが出来上がる。

### 5.4 失敗時の扱い

3件中2件成功して通信が切れる事態は通常起こり得る。

- **全件成功するまで localStorage をクリアしない。** 各アイテムに `migrated` フラグを立て、再試行時はフラグの立っていないものだけを送る（二重登録の防止）
- 失敗時は「取り込みに失敗しました。再試行」を表示し、**黙って破棄しない**

### 5.5 新規登録とサインインで扱いを変える

| 状況 | 挙動 |
|---|---|
| **新規サインアップ** | 確認なしで自動取り込み。完了後に「ゲストで作成した3件を取り込みました」とトーストで通知 |
| **既存アカウントへのサインイン** | 確認モーダル「ゲストで作成した3件を、あなたのチームに追加しますか？」。「追加しない」を選択した場合は localStorage を破棄 |

登録直後は連続性への期待が最も高くダイアログは邪魔にしかならない一方、既に多数のレシピを持つ家族チームに試し打ちのダミーレシピが黙って混入するのは防ぐ必要がある。**一貫性より実際の期待値を優先した非対称な扱い**である。

---

## 6. 補遺: UI / UX 仕様

### 6.1 カラーテーマ

| 仕様上の名称 | daisyUI テーマ |
|---|---|
| ライト ブルー | `light` |
| ライト イエロー | `cupcake` |
| ダーク ブルーブラック | `night` |
| ダーク ブラック | `black` |

**独自テーマを定義せず、daisyUI の組み込みテーマをそのまま使用する。** 色定義を書く必要がゼロで、4テーマ全ての配色バランスが検証済みであるため。

### 6.2 テーマの保存先と、初回描画のちらつき対策

> **⚠️ サーバーに保存したテーマは初回描画に間に合わない。** Next.js が HTML を返す時点でユーザーのテーマは不明なため、素直に実装すると「デフォルトテーマで一瞬描画 → 取得後に切り替わる」フラッシュが必ず発生する。ダークテーマ利用者には真っ白な画面が一瞬光る形になる。

**対策（唯一の方法）:**

- `<head>` 内の**ブロッキングなインラインスクリプト**で localStorage を読み、描画前に `<html data-theme>` を書き込む
- `<html suppressHydrationWarning>` を付与する（スクリプトが DOM を書き換えるため、無いと hydration 警告が出る）
- したがって**描画上の真実は常に localStorage**。サーバー保存は「別端末への同期用の控え」という位置づけ

**保存先は `UserProfile.theme`**（DynamoDB）。読み込みは1クエリ増えるが、描画は既に localStorage で完了しているため非同期でよく、体感コストはゼロ。

> Cognito のカスタム属性（`custom:theme`）は採用しない。**User Pool のスキーマは作成時に凍結され、カスタム属性を後から追加するにはプールの作り直し＝全ユーザー消滅が必要**になる。「テーマ以外の設定が今後一切増えない」という賭けに負けたときの代償が大きすぎる。

### 6.3 レシピのフィールド仕様

| 項目 | 必須 | 備考 |
|---|---|---|
| 料理名 | ✔︎ | |
| レシピサイト URL | | `http(s)://` で始まるかのみ検証。到達確認はしない |
| 基準人前（`servings`） | ✔︎ | デフォルト 2 |
| 材料 | | `{ 材料名, 数量, 単位 }` |
| ラベル | | 複数付与可 |
| メモ | | フリーテキスト |

料理名以外を全て任意にするのは、「後で埋める」を許さないと使われなくなるため。

### 6.4 材料の構造と x人前スケーリング

**数値にならない分量を許容する設計にする。** 日本のレシピでは `適量` `少々` `ひとつまみ` が頻出し、これらは数値化もスケーリングもできない。

`quantity` を **null 可**とし、**null の材料はスケーリング対象外としてそのまま表示する。**

| 入力 | 保存 | 2人前 → 3人前 |
|---|---|---|
| 玉ねぎ 1個 | `{ name:"玉ねぎ", quantity:1, unit:"個" }` | 1.5個 |
| 塩 適量 | `{ name:"塩", quantity:null, unit:"適量" }` | **適量**（変化しない） |
| 卵 2 | `{ name:"卵", quantity:2, unit:null }` | 3 |

**単位の入力方式**: 候補付きの自由入力（コンボボックス）。頻出単位（`g` `ml` `個` `本` `枚` `片` `束` `大さじ` `小さじ` `カップ` `適量` `少々`）をサジェストしつつ、一覧にない単位も入力可能とする。完全な固定ドロップダウンにすると `パック` `缶` `房` などの裾野が広すぎて必ず不足する。

**端数の表示**: 小数第1位で四捨五入し、末尾の 0 を落とす（`1.5個`、`2個`、`0.7g`）。**分数変換（`大さじ1/2` 等）は v1 では実装しない** — 単位ごとの丸め規則が必要になり複雑さが跳ね上がるため、料理する人間の判断に委ねる。

**スケーリング UI**:
- レシピ詳細画面に `-` / `+` ボタンと人数表示
- 範囲は **1〜12人前、1刻み**。1人前で `-` を無効化
- **選択した人数は保存しない**（ローカル状態のみ。画面を離れるとリセット）。保存すると「基準が何人前だったか」が曖昧になる

### 6.5 検索仕様

- **複数条件は AND**（料理名 AND 材料 AND ラベル）
- **ラベルを複数選択した場合も AND**（「主菜」＋「野菜」= 両方を持つレシピ）
- **正規化**: 全角/半角、ひらがな/カタカナ、大文字/小文字を吸収する

> **限界（明記事項）**: **漢字とかなの揺れ（「玉ねぎ」と「たまねぎ」）は吸収できない。** 形態素解析辞書が必要になるため v1 の対象外とする。

### 6.6 一覧・削除

- **デフォルト並び順は更新日時の新しい順**（直近に触ったレシピが最も探されるため）。全件がクライアント上にあるためソートはクライアント側で行う
- **レシピ削除は確認モーダル + 物理削除**（ゴミ箱機能なし）
- **ラベル削除は §1.6 の手順**

### 6.7 ラベル

- **名前のみ**（色を持たせない）。v1 では daisyUI の badge で統一表示

---

## 7. 補遺: v1 のスコープ外

### 7.1 レシピ画像

**v1 では実装しない。** ただし `Recipe.imageKey` フィールドのみ予約し、後から S3 を追加する際にデータ移行が不要になるようにしておく。

見送る理由：

- **Amplify Storage（S3）の追加**が必要になり、チーム単位のアクセス制御（`teamId` をパスに含めた path-based auth）の設計が増える
- **ゲスト（localStorage）と致命的に相性が悪い。** localStorage の容量上限は概ね 5MB で、画像を Base64 で保持すると**写真2〜3枚で枯渇する**
- ゲストに画像を許すなら S3 への未認証書き込みが必要になり、§5.1 で回避した問題がストレージ側で再燃する
- 引き継ぎ処理（§5.3）に画像アップロードのステップが増える

**将来実装する場合の方針**: 正規ユーザーのみ画像可、ゲストは不可とする。

### 7.2 その他のスコープ外

- チーム内のロール（管理者/一般）およびメンバーの追放
- 複数チームへの同時所属
- リアルタイム同期（`observeQuery`）
- i18n
- ソフトデリート / ゴミ箱

---

## 8. 認証仕様

- **サインインは常にメールアドレス**
- **サインアップ時のメール確認コードは必須**（Cognito 標準）
- **パスワードポリシー: 8文字以上、英字と数字を含む。記号は必須にしない**（家族利用で記号必須は離脱要因にしかならない）
- **パスワードリセット（忘れた場合）のフローを含める**
- **「ユーザー名変更」が変更するのは `UserProfile.displayName` のみ。** Cognito 側の属性は変更しない
  - 表示名はログインに一切使わないため**重複チェックは不要**（家族に「パパ」が2人いても破綻しない）
  - Cognito の `preferred_username` は使用しない。一意制約が付いて回り、変更時の衝突処理が必要になるだけで利点がない

---

## 9. 実装順序（フェーズ2の提案）

1. Amplify プロジェクト初期化、`amplify/auth/resource.ts`（Cognito、パスワードポリシー）
2. `amplify/data/resource.ts`（§1.3 のスキーマ）
3. `postConfirmationFunction`（個人チーム生成）+ `repairAccount`
4. Next.js 側の認証基盤（Cookie ベースのトークン保存、`createServerRunner`）
5. Tailwind v4 + daisyUI 5、テーマ切り替えとちらつき対策（§6.2）
6. `RecipeRepository` インターフェースと `LocalStorageRepository`（トライアル制限を含む）
7. レシピ CRUD 画面 + 検索 + x人前スケーリング（ゲストで完結する状態まで）
8. `AmplifyRepository` を追加し、正規ユーザーで同一画面を動作させる
9. ゲストデータの引き継ぎ（§5.3）
10. `teamFunction`（`joinTeam` / `leaveTeam` / `issueInviteCode`）と `/team` 画面

**7 の時点でゲストとして一通り動作する**ため、早い段階で実物を触って仕様を検証できる。
