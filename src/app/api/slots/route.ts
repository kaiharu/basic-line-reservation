import { handle, HttpError, json } from '@/lib/http';
import { bookingRange, getDaySlots } from '@/lib/slots';

export const dynamic = 'force-dynamic';

// 指定日の空き枠（お客様向け。誰が予約しているかは返さない）
export async function GET(req: Request) {
  return handle(async () => {
    const date = new URL(req.url).searchParams.get('date') ?? '';
    const { from, to } = bookingRange();
    if (date < from || date > to) throw new HttpError(400, '予約受付期間外の日付です');
    const day = await getDaySlots(date);
    return json({
      ...day,
      slots: day.slots.map((s) => ({ ...s, state: s.state === 'available' ? 'available' : 'unavailable' })),
    });
  });
}
