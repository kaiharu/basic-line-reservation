import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle, HttpError, json, readJson } from '@/lib/http';
import { addDays, isDateStr, isTimeStr, jstToDate } from '@/lib/jst';

export const dynamic = 'force-dynamic';

type BlockRow = { id: string; start_at: Date; end_at: Date; reason: string | null };
const serialize = (b: BlockRow) => ({
  id: String(b.id),
  start: b.start_at.toISOString(),
  end: b.end_at.toISOString(),
  reason: b.reason,
});

// 今後の予約不可設定一覧
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const rows = await db()<BlockRow[]>`
      select id, start_at, end_at, reason from blocked_periods
      where end_at > now() order by start_at asc limit 300`;
    return json({ blocks: rows.map(serialize) });
  });
}

/**
 * 予約不可の時間帯を追加
 * body: { date: 'YYYY-MM-DD', endDate?: 'YYYY-MM-DD', allDay?: boolean, startTime?: 'HH:MM', endTime?: 'HH:MM', reason?: string }
 * allDay の場合は date〜endDate の終日をブロック。
 */
export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const b = await readJson<{
      date?: string; endDate?: string; allDay?: boolean; startTime?: string; endTime?: string; reason?: string;
    }>(req);
    if (!isDateStr(b.date)) throw new HttpError(400, '日付を指定してください');
    const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 100) : '';

    let start: Date;
    let end: Date;
    if (b.allDay) {
      const endDate = isDateStr(b.endDate) ? b.endDate : b.date;
      if (endDate < b.date) throw new HttpError(400, '終了日は開始日以降にしてください');
      start = jstToDate(b.date, '00:00');
      end = jstToDate(addDays(endDate, 1), '00:00');
    } else {
      if (!isTimeStr(b.startTime) || !isTimeStr(b.endTime)) throw new HttpError(400, '開始・終了時刻を指定してください');
      start = jstToDate(b.date, b.startTime);
      end = jstToDate(b.date, b.endTime);
      if (end <= start) throw new HttpError(400, '終了時刻は開始時刻より後にしてください');
    }

    const sql = db();
    const [row] = await sql<BlockRow[]>`
      insert into blocked_periods (start_at, end_at, reason)
      values (${start}, ${end}, ${reason || null})
      returning id, start_at, end_at, reason`;

    // すでに入っている予約は自動では消さない。管理者に知らせるため件数を返す
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from reservations
      where status in ('pending', 'approved') and start_at < ${end} and end_at > ${start}`;
    return json({ block: serialize(row), conflicts: count }, 201);
  });
}
