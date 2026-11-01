import postgres from "postgres";

// Supabase の「Transaction pooler」接続文字列(ポート6543)を DATABASE_URL に設定してください。
// pooler ではプリペアドステートメントが使えないため prepare: false にしています。

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が設定されていません");
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes("host=/");
  return postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    ssl: isLocal ? false : "require",
  });
}

/** 遅延初期化したDBクライアント（ビルド時にDATABASE_URLが無くても落ちないように） */
export function db() {
  globalThis.__sql ??= createClient();
  return globalThis.__sql;
}

export type ReservationStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ReservationRow = {
  id: string;
  line_user_id: string;
  line_name: string | null;
  customer_name: string;
  phone: string | null;
  party_size: number;
  note: string | null;
  start_at: Date;
  end_at: Date;
  status: ReservationStatus;
  admin_message: string | null;
  created_at: Date;
  updated_at: Date;
};
