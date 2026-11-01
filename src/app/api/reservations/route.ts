import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { db, type ReservationRow } from "@/lib/db";
import { handle, HttpError, json, readJson, serializeReservation } from "@/lib/http";
import { fmtSlot, toJstDateStr } from "@/lib/jst";
import { adminUrl, notifyAdmins, pushText } from "@/lib/line";
import { isValidPhone } from "@/lib/phone";
import { bookingRange, getDaySlots } from "@/lib/slots";

export const dynamic = "force-dynamic";

// 自分の予約一覧
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const rows = await db()<ReservationRow[]>`
      select * from reservations
      where line_user_id = ${user.userId} and start_at > now() - interval '60 days'
      order by start_at desc
      limit 50
    `;
    return json({ reservations: rows.map(serializeReservation) });
  });
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function partySize(v: unknown): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 20);
}

// 予約リクエストの作成
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = await readJson(req);
    const start = str(body.start, 40);
    const customerName = str(body.customerName, 50);
    const phone = str(body.phone, 20);
    const note = str(body.note, 500);
    const guests = partySize(body.partySize);

    if (!customerName) throw new HttpError(400, "お名前を入力してください");
    if (!phone) throw new HttpError(400, "電話番号を入力してください");
    if (!isValidPhone(phone)) throw new HttpError(400, "電話番号の形式が正しくありません");
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) throw new HttpError(400, "日時が正しくありません");

    const date = toJstDateStr(startDate);
    const { from, to } = bookingRange();
    if (date < from || date > to) throw new HttpError(400, "予約受付期間外です");

    // サーバー側で枠の正当性・空きを再確認
    const day = await getDaySlots(date);
    const slot = day.slots.find((s) => s.start === startDate.toISOString());
    if (!slot) throw new HttpError(400, "選択された時間は予約枠ではありません");
    if (slot.state !== "available") throw new HttpError(409, "この時間はすでに埋まっているか、予約できません");

    const sql = db();
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from reservations
      where line_user_id = ${user.userId} and status in ('pending', 'approved') and start_at > now()
    `;
    if (count >= config.maxActivePerUser) {
      throw new HttpError(429, `同時に申し込める予約は${config.maxActivePerUser}件までです`);
    }

    let row: ReservationRow;
    try {
      [row] = await sql<ReservationRow[]>`
        insert into reservations (line_user_id, line_name, customer_name, phone, party_size, note, start_at, end_at)
        values (${user.userId}, ${user.name || null}, ${customerName}, ${phone || null}, ${guests}, ${note || null},
                ${new Date(slot.start)}, ${new Date(slot.end)})
        returning *
      `;
    } catch (e) {
      // 排他制約（同時刻の二重予約）違反
      if ((e as { code?: string }).code === "23P01") {
        throw new HttpError(409, "タッチの差で他の方の予約が入りました。別の時間をお選びください");
      }
      throw e;
    }

    const when = fmtSlot(row.start_at, row.end_at);
    await Promise.all([
      pushText(
        user.userId,
        `予約リクエストを受け付けました。\n\n日時：${when}\nお名前：${customerName}\n\nお店からの承認をお待ちください。確定するとこちらでお知らせします。`,
      ),
      notifyAdmins(
        `【新しい予約リクエスト】\n日時：${when}\nお名前：${customerName}\n人数：${guests}名` +
          (phone ? `\n電話：${phone}` : "") +
          (note ? `\nご要望：${note}` : "") +
          `\n\n承認・却下はこちら\n${adminUrl()}`,
      ),
    ]);

    return json({ reservation: serializeReservation(row) }, 201);
  });
}
