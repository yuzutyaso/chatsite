# Simple Chat App with Supabase and Next.js

このプロジェクトは、Supabaseをバックエンド、Next.jsをフロントエンド、Tailwind CSSをスタイリングに使用したシンプルなチャットアプリケーションです。リアルタイムメッセージング、ユーザー認証、プロフィール管理、友達機能、画像送信に対応しています。

## 機能

- **ユーザー認証**: メールアドレスとマジックリンクによるサインイン/サインアップ
- **リアルタイムチャット**: Supabaseのリアルタイム機能によるメッセージの即時反映
- **個人間チャット**: 友達との1対1のチャットルーム
- **プロフィール管理**: ユーザー名、アイコン（画像アップロード）、短縮ID
- **友達機能**: 短縮IDによるユーザー検索と友達追加
- **画像送信**: チャット内での画像共有
- **軽量化**: データベースでの古いメッセージ自動削除（設定が必要）

## 技術スタック

- **バックエンド**: Supabase (PostgreSQL, Supabase Auth, Supabase Realtime, Supabase Storage)
- **フロントエンド**: Next.js (React)
- **スタイリング**: Tailwind CSS
- **デプロイ**: Vercel
- **バージョン管理**: GitHub
- **その他**: `js-sha256` (ID生成用)

## セットアップ

### 1. Supabaseプロジェクトのセットアップ

1.  **Supabaseアカウントの作成**: [Supabase](https://supabase.com/) にアクセスしてサインアップします。
2.  **新しいプロジェクトの作成**: プロジェクト名、データベースパスワード、リージョンを設定してプロジェクトを作成します。
3.  **APIキーの取得**: プロジェクト設定の「API」セクションから、`Project URL` と `anon public` キーを控えておきます。
4.  **データベーススキーマの準備**: 以下のテーブルを作成し、RLSとRealtimeを有効にします。

    -   **`profiles` テーブル**:
        -   `id`: `uuid` (Primary Key, Default: `auth.uid()`, References `auth.users.id`)
        -   `created_at`: `timestampz` (Default: `now()`)
        -   `updated_at`: `timestampz` (Default: `now()`, Nullable)
        -   `username`: `text` (Unique, Nullable)
        -   `avatar_url`: `text` (Nullable)
        -   `short_id`: `text` (Unique, **Nullを許容しない**。アプリ側でSHA-256から生成して挿入)
    -   **`messages` テーブル**:
        -   `id`: `uuid` (Primary Key, Default: `gen_random_uuid()`)
        -   `created_at`: `timestampz` (Default: `now()`)
        -   `user_id`: `uuid` (References `auth.users.id`)
        -   `room_id`: `text` (チャットルームID, 例: `userA_userB`形式)
        -   `content`: `text` (Nullable)
        -   `image_url`: `text` (Nullable)
    -   **`friends` テーブル**:
        -   `id`: `uuid` (Primary Key, Default: `gen_random_uuid()`)
        -   `user_id`: `uuid` (References `auth.users.id`)
        -   `friend_id`: `uuid` (References `auth.users.id`)
        -   `status`: `text` (Default: `'accepted'`, 例: `pending`, `accepted`, `blocked`)
        -   `created_at`: `timestampz` (Default: `now()`)
        -   **複合ユニーク制約**: `(user_id, friend_id)` にUNIQUE制約を追加してください（SQLエディタで`ALTER TABLE friends ADD CONSTRAINT unique_friend_pair UNIQUE (user_id, friend_id);`）。

5.  **Supabase Storageのバケット作成**:
    -   `chat-images`: チャットで送信される画像を保存します。
    -   `profile-icons`: プロフィールアイコン画像を保存します。
    -   それぞれのバケットに適切なRLSポリシー（読み書き権限）を設定してください。

### 2. ローカル開発環境のセットアップ

1.  **リポジトリをクローン**:
    ```bash
    git clone YOUR_GITHUB_REPO_URL
    cd chat-app
    ```
2.  **依存関係のインストール**:
    ```bash
    npm install
    # または yarn install
    ```
3.  **環境変数の設定**:
    プロジェクトルートに `.env.local` ファイルを作成し、SupabaseのAPIキーを設定します。
    ```
    NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
    ```
4.  **開発サーバーの起動**:
    ```bash
    npm run dev
    # または yarn dev
    ```
    `http://localhost:3000` でアプリケーションにアクセスできます。

## デプロイ

Vercelを使用すると、簡単にデプロイできます。

1.  **Vercelアカウントの作成**: [Vercel](https://vercel.com/) にアクセスしてサインアップします（GitHubアカウントで連携できます）。
2.  **新規プロジェクトの追加**: Vercelダッシュボードで「Add New...」->「Project」を選択し、GitHubリポジトリをインポートします。
3.  **環境変数の設定**: プロジェクト設定の「Environment Variables」で、`.env.local`に設定したSupabaseの環境変数を追加します。
    -   `NEXT_PUBLIC_SUPABASE_URL`
    -   `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4.  **デプロイ**: 設定後、Vercelが自動的にプロジェクトをビルドし、デプロイします。デプロイが完了すると、公開URLが発行されます。

---

このコードベースは、あなたがチャットアプリケーションを構築するための出発点です。ご要望に合わせた機能（例えば、通知機能の具体的な実装や、より複雑な友達リクエストのフローなど）は、このコードをベースにさらに開発を進めていく必要があります。

開発中に何か不明な点があれば、いつでもご質問ください！
