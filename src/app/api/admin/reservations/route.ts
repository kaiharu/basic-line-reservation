import { requireAdmin } from '@/lib/auth';
import { db, type ReservationRow } from '@/lib/db';
import { handle, HttpError, json, serializeReservation } from '@/lib/http';

export const dynamic = 'force-dynamic';

// status=pending: 承認待ち全件 / approved: 今後の確定予約 / history: 直近の履歴
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const status = new URL(req.url).searchParams.get('status') ?? 'pending';
    const sql = db();
    let rows: ReservationRow[];
    if (status === 'pending') {
      rows = await sql<ReservationRow[]>`
        select * from reservations where status = 'pending' order by start_at asc limit 200`;
    } else if (status === 'approved') {
      rows = await sql<ReservationRow[]>`
        select * from reservations where status = 'approved' and end_at > now() order by start_at asc limit 200`;
    } else if (status === 'history') {
      rows = await sql<ReservationRow[]>`
        select * from reservations order by updated_at desc limit 100`;
    } else {
      throw new HttpError(400, 'status が正しくありません');
    }
    return json({ reservations: rows.map(serializeReservation) });
  });
}
