import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** ルートハンドラ共通のエラーハンドリング */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'サーバーエラーが発生しました' }, 500);
  }
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'リクエストの形式が正しくありません');
  }
}

/** 予約情報をクライアント向けに整形 */
export function serializeReservation(r: {
  id: string | number;
  customer_name: string;
  phone: string | null;
  note: string | null;
  start_at: Date;
  end_at: Date;
  status: string;
  admin_message: string | null;
  created_at: Date;
  line_name?: string | null;
}) {
  return {
    id: String(r.id),
    customerName: r.customer_name,
    lineName: r.line_name ?? null,
    phone: r.phone,
    note: r.note,
    start: r.start_at.toISOString(),
    end: r.end_at.toISOString(),
    status: r.status,
    adminMessage: r.admin_message,
    createdAt: r.created_at.toISOString(),
  };
}
