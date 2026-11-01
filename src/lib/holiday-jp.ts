// 日本の祝日判定（内閣府の祝日計算ルールに基づく純粋関数）。
// 外部データ・通信・パッケージは使用せず、計算のみで求める。

import { addDays, weekdayOf } from "./jst";

type HolidayEntry = [month: number, day: number, name: string];

function key(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 指定月の第n月曜日の「日」を返す（ハッピーマンデー制度用） */
function nthMonday(year: number, month: number, nth: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=日
  const firstMonday = firstDow === 1 ? 1 : ((8 - firstDow) % 7) + 1;
  return firstMonday + (nth - 1) * 7;
}

/** 春分の日（1980〜2099年の近似計算式） */
function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}

/** 秋分の日（1980〜2099年の近似計算式） */
function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}

function fixedHolidays(year: number): HolidayEntry[] {
  const list: HolidayEntry[] = [
    [1, 1, "元日"],
    [2, 11, "建国記念の日"],
    [4, 29, "昭和の日"],
    [5, 3, "憲法記念日"],
    [5, 4, "みどりの日"],
    [5, 5, "こどもの日"],
    [11, 3, "文化の日"],
    [11, 23, "勤労感謝の日"],
  ];
  if (year >= 2020) list.push([2, 23, "天皇誕生日"]);
  if (year >= 2016) list.push([8, 11, "山の日"]);
  return list;
}

function movableHolidays(year: number): HolidayEntry[] {
  return [
    [1, nthMonday(year, 1, 2), "成人の日"],
    [7, year >= 2003 ? nthMonday(year, 7, 3) : 20, "海の日"],
    [10, year >= 2000 ? nthMonday(year, 10, 2) : 10, year >= 2020 ? "スポーツの日" : "体育の日"],
    ...(year >= 2003 ? ([[9, nthMonday(year, 9, 3), "敬老の日"]] as HolidayEntry[]) : []),
  ];
}

function baseHolidaysOfYear(year: number): Map<string, string> {
  const map = new Map<string, string>();
  for (const [m, d, name] of fixedHolidays(year)) map.set(key(year, m, d), name);
  for (const [m, d, name] of movableHolidays(year)) map.set(key(year, m, d), name);
  map.set(key(year, 3, vernalEquinoxDay(year)), "春分の日");
  map.set(key(year, 9, autumnalEquinoxDay(year)), "秋分の日");
  return map;
}

const yearCache = new Map<number, Map<string, string>>();

function holidaysOfYear(year: number): Map<string, string> {
  const cached = yearCache.get(year);
  if (cached) return cached;

  const base = baseHolidaysOfYear(year);
  const result = new Map(base);

  // 国民の休日：前日・翌日を祝日に挟まれた平日（日曜を除く）も祝日扱いになる
  for (const dateStr of base.keys()) {
    const between = addDays(dateStr, 1);
    const next = addDays(dateStr, 2);
    if (base.has(next) && !base.has(between) && weekdayOf(between) !== 0) {
      result.set(between, "国民の休日");
    }
  }

  // 振替休日：祝日が日曜の場合、直後の祝日でない日が休日になる
  for (const dateStr of [...base.keys()].sort()) {
    if (weekdayOf(dateStr) !== 0) continue;
    let next = addDays(dateStr, 1);
    while (result.has(next)) next = addDays(next, 1);
    result.set(next, "振替休日");
  }

  yearCache.set(year, result);
  return result;
}

/** 指定日（'YYYY-MM-DD'）が日本の祝日（振替休日・国民の休日を含む）かどうか */
export function isJapaneseHoliday(dateStr: string): boolean {
  const year = Number(dateStr.slice(0, 4));
  return holidaysOfYear(year).has(dateStr);
}

/** 指定日の祝日名（祝日でなければ undefined） */
export function japaneseHolidayName(dateStr: string): string | undefined {
  const year = Number(dateStr.slice(0, 4));
  return holidaysOfYear(year).get(dateStr);
}
