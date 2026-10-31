// 日本時間(Asia/Tokyo, UTC+9 / サマータイムなし)の日付ユーティリティ。
// サーバー・クライアント両方から使える純粋関数のみ。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export const pad = (n: number) => String(n).padStart(2, '0');

export function jstParts(d: Date | string) {
  const t = new Date(new Date(d).getTime() + JST_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    wd: t.getUTCDay(),
    hh: t.getUTCHours(),
    mm: t.getUTCMinutes(),
  };
}

/** Date → 'YYYY-MM-DD'（日本時間） */
export function toJstDateStr(d: Date | string): string {
  const p = jstParts(d);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function todayJst(): string {
  return toJstDateStr(new Date());
}

export function isDateStr(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isTimeStr(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:\d{2})?$/.test(s);
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 'YYYY-MM-DD' + 'HH:MM[:SS]'（日本時間）→ Date。'24:00' は翌日0時として扱う */
export function jstToDate(dateStr: string, hm: string): Date {
  const [h, mi] = hm.split(':').map(Number);
  const base = new Date(`${dateStr}T00:00:00+09:00`).getTime();
  return new Date(base + (h * 60 + mi) * 60 * 1000);
}

/** '10/27(火)' */
export function fmtDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}(${WEEKDAYS[weekdayOf(dateStr)]})`;
}

/** '10:00' */
export function fmtTime(d: Date | string): string {
  const p = jstParts(d);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

/** '10/27(火) 10:00〜11:00' */
export function fmtSlot(start: Date | string, end: Date | string): string {
  const p = jstParts(start);
  return `${p.m}/${p.d}(${WEEKDAYS[p.wd]}) ${fmtTime(start)}〜${fmtTime(end)}`;
}
