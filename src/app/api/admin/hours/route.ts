import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle, HttpError, json, readJson } from '@/lib/http';
import { isTimeStr } from '@/lib/jst';

export const dynamic = 'force-dynamic';

type HourRow = { weekday: number; open_time: string; close_time: string; is_closed: boolean };
const serialize = (h: HourRow) => ({
  weekday: h.weekday,
  open: h.open_time.slice(0, 5),
  close: h.close_time.slice(0, 5),
  closed: h.is_closed,
});

async function load() {
  const rows = await db()<HourRow[]>`
    select weekday, open_time::text, close_time::text, is_closed from business_hours order by weekday`;
  return rows.map(serialize);
}

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    return json({ hours: await load() });
  });
}

// body: { hours: [{ weekday, open, close, closed }, ...] }
export async function PUT(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const { hours } = await readJson<{ hours?: { weekday: number; open: string; close: string; closed: boolean }[] }>(req);
    if (!Array.isArray(hours) || hours.length === 0) throw new HttpError(400, '営業時間を指定してください');
    for (const h of hours) {
      if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6) throw new HttpError(400, '曜日が正しくありません');
      if (!isTimeStr(h.open) || !isTimeStr(h.close)) throw new HttpError(400, '時刻の形式が正しくありません');
      if (h.close <= h.open) throw new HttpError(400, '閉店時刻は開店時刻より後にしてください');
    }
    await db().begin(async (tx) => {
      for (const h of hours) {
        await tx`
          insert into business_hours (weekday, open_time, close_time, is_closed)
          values (${h.weekday}, ${h.open}, ${h.close}, ${!!h.closed})
          on conflict (weekday) do update
          set open_time = excluded.open_time, close_time = excluded.close_time, is_closed = excluded.is_closed`;
      }
    });
    return json({ hours: await load() });
  });
}
