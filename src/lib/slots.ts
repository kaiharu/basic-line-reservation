import { db } from "./db";
import { config } from "./config";
import { addDays, isDateStr, jstToDate, todayJst, weekdayOf, fmtTime } from "./jst";
import { isJapaneseHoliday } from "./holiday-jp";
import { HttpError } from "./http";

export type SlotState = "available" | "booked" | "blocked" | "past";

export type Slot = { start: string; end: string; label: string; state: SlotState };

export type DaySlots = {
  date: string;
  closed: boolean;
  slots: Slot[];
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function bookingRange() {
  const from = todayJst();
  return { from, to: addDays(from, config.daysAhead) };
}

/** 指定日の予約枠と空き状況を計算する */
export async function getDaySlots(date: string): Promise<DaySlots> {
  if (!isDateStr(date)) throw new HttpError(400, "日付の形式が正しくありません");
  const sql = db();

  // 祝日は曜日にかかわらず日曜日と同じ営業時間を適用する
  const effectiveWeekday = isJapaneseHoliday(date) ? 0 : weekdayOf(date);
  const [hours] = await sql<{ open_time: string; close_time: string; is_closed: boolean }[]>`
    select open_time::text, close_time::text, is_closed from business_hours where weekday = ${effectiveWeekday}
  `;
  if (!hours || hours.is_closed) return { date, closed: true, slots: [] };

  const dayStart = jstToDate(date, "00:00");
  const dayEnd = jstToDate(addDays(date, 1), "00:00");

  const [blocks, reservations] = await Promise.all([
    sql<{ start_at: Date; end_at: Date }[]>`
      select start_at, end_at from blocked_periods
      where start_at < ${dayEnd} and end_at > ${dayStart}
    `,
    sql<{ start_at: Date; end_at: Date }[]>`
      select start_at, end_at from reservations
      where status in ('pending', 'approved') and start_at < ${dayEnd} and end_at > ${dayStart}
    `,
  ]);

  const slotMs = config.slotMinutes * 60 * 1000;
  const stepMs = config.slotStepMinutes * 60 * 1000;
  const open = jstToDate(date, hours.open_time).getTime();
  const close = jstToDate(date, hours.close_time).getTime();
  const earliest = Date.now() + config.minLeadHours * 60 * 60 * 1000;

  const slots: Slot[] = [];
  for (let t = open; t + slotMs <= close; t += stepMs) {
    const end = t + slotMs;
    let state: SlotState = "available";
    if (t < earliest) state = "past";
    else if (blocks.some((b) => overlaps(t, end, b.start_at.getTime(), b.end_at.getTime()))) state = "blocked";
    else if (reservations.some((r) => overlaps(t, end, r.start_at.getTime(), r.end_at.getTime()))) state = "booked";
    slots.push({
      start: new Date(t).toISOString(),
      end: new Date(end).toISOString(),
      label: fmtTime(new Date(t)),
      state,
    });
  }
  return { date, closed: false, slots };
}
