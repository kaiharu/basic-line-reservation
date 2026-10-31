import { requireUser } from '@/lib/auth';
import { db, type ReservationRow } from '@/lib/db';
import { handle, HttpError, json, serializeReservation } from '@/lib/http';
import { fmtSlot } from '@/lib/jst';
import { notifyAdmins, pushText } from '@/lib/line';

export const dynamic = 'force-dynamic';

// お客様による取り消し（承認待ち・確定済みで、開始前のもの）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    if (!/^\d+$/.test(id)) throw new HttpError(400, 'IDが正しくありません');

    const [row] = await db()<ReservationRow[]>`
      update reservations set status = 'cancelled', updated_at = now()
      where id = ${id} and line_user_id = ${user.userId}
        and status in ('pending', 'approved') and start_at > now()
      returning *
    `;
    if (!row) throw new HttpError(409, 'この予約は取り消しできません');

    const when = fmtSlot(row.start_at, row.end_at);
    await Promise.all([
      pushText(user.userId, `予約を取り消しました。\n\n日時：${when}`),
      notifyAdmins(`【お客様が予約を取り消しました】\n日時：${when}\nお名前：${row.customer_name}`),
    ]);
    return json({ reservation: serializeReservation(row) });
  });
}
