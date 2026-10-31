# LINE予約ミニアプリ

LINEから予約リクエストを受け付けて、管理者が承認・却下できる予約管理アプリです。
LINEミニアプリ（LIFF）として動作します。

- **お客様**: 空き枠を選んで予約リクエスト → 承認・却下の結果がLINEに届く → 予約状況の確認・取り消し
- **管理者**: リクエストの承認・却下（メッセージ付き）、確定予約のキャンセル、予約不可の時間設定（枠単位・時間指定・終日/連休）、曜日ごとの営業時間設定
- **通知**: 新しいリクエストやお客様による取り消しを管理者にLINEで通知し、承認・却下・お店都合のキャンセルをお客様に通知します

## 構成

| 役割         | 使うもの                                                  |
| ------------ | --------------------------------------------------------- |
| 画面とAPI    | Next.js 16（App Router）                                  |
| データベース | Supabase（PostgreSQL）                                    |
| ホスティング | Vercel                                                    |
| LINE連携     | LINEミニアプリ（LIFF SDK）、Messaging API（プッシュ通知） |

```
src/
  app/
    page.tsx              お客様画面（予約する / 予約状況）
    admin/page.tsx        管理画面（リクエスト / 確定予約 / スケジュール / 予約不可設定 / 営業時間）
    api/                  サーバーAPI（すべてIDトークンで本人確認）
  components/LiffProvider.tsx  LIFF初期化・ログイン・API呼び出し
  lib/
    auth.ts               IDトークン検証・管理者判定
    slots.ts              空き枠の計算
    line.ts               LINEプッシュ通知
db/schema.sql             テーブル定義（Supabaseでそのまま実行）
```

### 予約のルール

- 1枠1名の時間枠予約です。枠の長さは `SLOT_MINUTES`（初期値60分）で、営業開始時刻から区切ります。
- **承認待ちの時点で枠を押さえます**。同じ枠への別リクエストは受け付けません。却下・取り消しになると枠が空きます。
- 二重予約はDBの排他制約で防いでいます。同時に申し込みが来ても1件しか通りません。
- 予約不可の時間を追加しても、すでに入っている予約は自動ではキャンセルしません。件数をお知らせするので、必要な予約は個別にキャンセルしてください。
- 日時はすべて日本時間（Asia/Tokyo）で扱います。

---

## セットアップ手順

### 1. Supabase（データベース）

1. https://supabase.com でプロジェクトを作成します。リージョンは Tokyo（ap-northeast-1）がおすすめです。
2. **SQL Editor** を開き、`db/schema.sql` の中身を貼り付けて実行します。もう一度実行しても問題ありません。
3. **Project Settings → Database → Connection string** を開き、**Transaction pooler**（ポート6543）の接続文字列を控えます。これが `DATABASE_URL` です。`[YOUR-PASSWORD]` の部分はDBのパスワードに置き換えてください。

### 2. LINE Developers

同じ **プロバイダー** の中に、次の2つのチャネルを作ります。
プロバイダーが違うと同じ人でもユーザーIDが変わり、通知が届かなくなります。

#### 2-1. Messaging API チャネル（＝LINE公式アカウント。通知の送信元）

1. LINE公式アカウントを作り、Messaging API を有効にします。そのとき、上と同じプロバイダーを選んでください。
2. LINE Developers で **チャネルアクセストークン（長期）** を発行します。これが `LINE_CHANNEL_ACCESS_TOKEN` です。
3. お客様に通知を届けるには、お客様にこの公式アカウントを **友だち追加** してもらう必要があります（2-2 の「友だち追加オプション」で促せます）。

#### 2-2. LINEミニアプリ チャネル（アプリ本体）

1. 同じプロバイダーで **LINEミニアプリ** チャネルを作成します。作成直後は「未認証ミニアプリ」として利用できます。
2. **ウェブアプリ設定** タブで次の設定をします。
   - **エンドポイントURL**: 手順3で取得するVercelのURL（例 `https://xxxx.vercel.app`）。開発用・審査用・本番用のそれぞれに設定します。
   - **Scope**: `openid` と `profile` にチェックを入れます。
   - **友だち追加オプション**: 2-1 の公式アカウントを指定すると、初回起動時に友だち追加を促せます。
3. LIFF URL（`https://miniapp.line.me/xxxxxxxx-xxxxxxxx`）の末尾の部分が `NEXT_PUBLIC_LIFF_ID` です。
4. **チャネル基本設定** の **チャネルID** が `LINE_LOGIN_CHANNEL_ID` です。
5. 開発用URLで試すときは、**権限管理** タブで自分のLINEアカウントをテスターに追加します。

> 既存の「LINEログインチャネル＋LIFFアプリ」で作ることもできます。その場合はLIFFタブのLIFF IDとLINEログインチャネルのチャネルIDを使い、`LIFF_URL_BASE=https://liff.line.me` を設定してください。

### 3. Vercel にデプロイ

1. このフォルダをGitHubにpushし、Vercelで **New Project** からインポートします。
2. **Environment Variables** に `.env.example` の項目を設定します。`ADMIN_LINE_USER_IDS` は最初は空のままで構いません。
3. デプロイが終わったら、発行されたURLを 2-2 のエンドポイントURLに設定します。

> `NEXT_PUBLIC_` で始まる変数はビルド時に埋め込まれます。変更したら **Redeploy** してください。

### 4. 管理者を登録する

1. LINEで `https://miniapp.line.me/<LIFF ID>/admin` を開きます。
2. 「管理者権限がありません」という画面に自分のユーザーIDが表示されます。
3. そのIDを Vercel の `ADMIN_LINE_USER_IDS` に設定して Redeploy します。複数人いる場合はカンマ区切りで並べます。
4. 管理者も公式アカウントを友だち追加しておくと、新しいリクエストの通知が届きます。

### 5. お客様への案内

- 公式アカウントの **リッチメニュー** に `https://miniapp.line.me/<LIFF ID>` へのリンクを置くのがおすすめです。
- QRコードやWebサイトから同じURLにリンクしても使えます。

---

## ローカルで動かす（LINEなしで確認する）

```bash
npm install
cp .env.example .env.local
```

`.env.local` を次のように設定します（PostgreSQLはローカルでもSupabaseでも構いません）。

```
DATABASE_URL=postgresql://postgres@localhost:5432/reserve
NEXT_PUBLIC_DEV_MODE=1
DEV_AUTH=1
ADMIN_LINE_USER_IDS=dev-admin
```

```bash
psql "$DATABASE_URL" -f db/schema.sql
npm run dev
```

- お客様画面: http://localhost:3000/?as=dev-user
- 管理画面: http://localhost:3000/admin?as=dev-admin

`?as=` の値を変えると別ユーザーとして操作できます。このダミーログインは `npm run dev` のときだけ有効で、本番ビルドでは常に無効です。開発ユーザーにはLINE通知を送らず、送信内容をコンソールに表示します。

---

## 運用メモ

- **メッセージ通数**: プッシュ通知は公式アカウントの月間メッセージ数を消費します。1件の予約につき、お客様への通知が2通（受付・結果）と管理者への通知が管理者の人数分です。料金プランの無料メッセージ通数を確認してください。
- **承認されないまま開始時刻を過ぎたリクエスト** は管理画面に「期限切れ」と表示されます。却下すると一覧から消えます。
- **営業時間・枠の長さを途中で変える場合**: 既存の予約はそのまま残ります。新しい枠と重なる時間は予約不可として扱われます。
- **セキュリティ**: DBへのアクセスはすべてサーバー経由です。テーブルにはRLSを有効にしてあり、Supabaseの公開APIからは読み書きできません。
- **Supabase の自動停止対策**: Supabase Free プランは7日間アクセスがないとプロジェクトが一時停止されます。これを防ぐため、Vercel Cron が毎日午前3時（日本時間）に `/api/cron/keepalive` を呼び、DBに軽いアクセスをしています。利用には Vercel の環境変数に `CRON_SECRET` を設定して **Redeploy** する必要があります。動作確認は、Vercel ダッシュボードの **Settings → Cron Jobs** から「Run」を押すか、実行ログで確認できます。Supabase を Pro プランにした場合は不要になりますが、残しておいても害はありません。

## 今後の拡張の例

- メニューごとに所要時間を変える、担当スタッフを選べるようにする
- 前日のリマインド通知（Vercel Cron で毎日実行）
- 管理画面からお客様へ個別にメッセージを送る
- Googleカレンダーとの同期
