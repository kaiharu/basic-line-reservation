import { db } from "@/lib/db";
import { handle, HttpError, json } from "@/lib/http";

export const dynamic = "force-dynamic";

// Vercel Cron から定期的に呼び出し、Supabase Free プランが
// 7日間アクセスなしで一時停止されるのを防ぐためのエンドポイント。
// Authorization ヘッダーは Vercel が CRON_SECRET から自動で付与する。
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization");
    if (!secret || auth !== `Bearer ${secret}`) throw new HttpError(401, "認証に失敗しました");

    // 利用実績として数えられるよう、実テーブルへの軽いクエリを実行する
    await db()`select count(*)::int as count from business_hours`;

    return json({ ok: true, at: new Date().toISOString() });
  });
}
