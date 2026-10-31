import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle, HttpError, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin(req);
    const { id } = await ctx.params;
    if (!/^\d+$/.test(id)) throw new HttpError(400, 'IDが正しくありません');
    const rows = await db()`delete from blocked_periods where id = ${id} returning id`;
    if (rows.length === 0) throw new HttpError(404, '見つかりません');
    return json({ ok: true });
  });
}
