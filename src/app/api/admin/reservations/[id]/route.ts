import { requireAdmin } from "@/lib/auth";
import { db, type ReservationRow, type ReservationStatus } from "@/lib/db";
import { handle, HttpError, json, readJson, serializeReservation } from "@/lib/http";
import { fmtSlot } from "@/lib/jst";
import { customerUrl, pushText } from "@/lib/line";

export const dynamic = "force-dynamic";

const transitions: Record<string, { from: ReservationStatus; to: ReservationStatus }> = {
  approve: { from: "pending", to: "approved" },
  reject: { from: "pending", to: "rejected" },
  cancel: { from: "approved", to: "cancelled" },
};

// 承認 / 却下 / 確定済み予約のキャンセル
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin(req);
    const { id } = await ctx.params;
    if (!/^\d+$/.test(id)) throw new HttpError(400, "IDが正しくありません");
    const body = await readJson<{ action?: string; message?: string }>(req);
    const t = transitions[body.action ?? ""];
    if (!t) throw new HttpError(400, "action が正しくありません");
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";

    const [row] = await db()<ReservationRow[]>`
      update reservations
      set status = ${t.to}, admin_message = ${message || null}, updated_at = now()
      where id = ${id} and status = ${t.from}
      returning *
    `;
    if (!row) throw new HttpError(409, "すでに処理済みか、この操作はできない状態です。画面を更新してください");

    const when = fmtSlot(row.start_at, row.end_at);
    const extra = message ? `\n\nお店からのメッセージ：\n${message}` : "";
    const texts: Record<string, string> = {
      approve: `ご予約が確定しました。\n\n日時：${when}\nお名前：${row.customer_name} 様${extra}\n\nご予約時間から15分以上遅れる場合は事前にご連絡ください。\nご連絡がない場合15分を過ぎた時点でキャンセルとさせていただきます。\n到着しましたらインターフォンは押さず、公式LINEにてご連絡頂きますよう、よろしくお願いいたします。\n\nご来店をお待ちしております。\n\nブリードルームへのアクセス：\nhttps://basic-bp.com/access/`,
      reject: `申し訳ございません。ご希望の日時ではご予約をお受けできませんでした。\n\n日時：${when}${extra}\n\nお手数ですが、別の日時で再度お申し込みください。\n${customerUrl()}`,
      cancel: `誠に申し訳ございません。お店の都合により、以下のご予約をキャンセルさせていただきました。\n\n日時：${when}${extra}\n\n別の日時でのご予約はこちら\n${customerUrl()}`,
    };
    await pushText(row.line_user_id, texts[body.action!]);
    return json({ reservation: serializeReservation(row) });
  });
}
