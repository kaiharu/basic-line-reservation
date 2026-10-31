import { requireUser } from '@/lib/auth';
import { config } from '@/lib/config';
import { handle, json } from '@/lib/http';
import { bookingRange } from '@/lib/slots';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    return json({
      ...user,
      config: {
        slotMinutes: config.slotMinutes,
        minLeadHours: config.minLeadHours,
        shopName: config.shopName,
        ...bookingRange(),
      },
    });
  });
}
