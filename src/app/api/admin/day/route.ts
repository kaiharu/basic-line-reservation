import { requireAdmin } from '@/lib/auth';
import { db, type ReservationRow } from '@/lib/db';
import { handle, HttpError, json, serializeReservation } from '@/lib/http';
import { addDays, isDateStr, jstToDate } from '@/lib/jst';
import { getDaySlots } from '@/lib/slots';

export const dynamic = 'force-dynamic';

// 管理者用：1日分の枠・予約・予約不可設定をまとめて返す
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const date = new URL(req.url).searchParams.get('date') ?? '';
    if (!isDateStr(date)) throw new HttpError(400, '日付の形式が正しくありません');
    const dayStart = jstToDate(date, '00:00');
    const dayEnd = jstToDate(addDays(date, 1), '00:00');
    const sql = db();
    const [day, reservations, blocks] = await Promise.all([
      getDaySlots(date),
      sql<ReservationRow[]>`
        select * from reservations
        where status in ('pending', 'approved') and start_at < ${dayEnd} and end_at > ${dayStart}
        order by start_at`,
      sql<{ id: string; start_at: Date; end_at: Date; reason: string | null }[]>`
        select id, start_at, end_at, reason from blocked_periods
        where start_at < ${dayEnd} and end_at > ${dayStart} order by start_at`,
    ]);
    return json({
      ...day,
      reservations: reservations.map(serializeReservation),
      blocks: blocks.map((b) => ({
        id: String(b.id),
        start: b.start_at.toISOString(),
        end: b.end_at.toISOString(),
        reason: b.reason,
      })),
    });
  });
}
