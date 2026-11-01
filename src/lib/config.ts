function intEnv(name: string, def: number, min: number, max: number) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min && v <= max ? Math.floor(v) : def;
}

export const config = {
  /** 1枠の長さ（分） */
  get slotMinutes() {
    return intEnv("SLOT_MINUTES", 60, 5, 480);
  },
  /** 予約開始時刻の刻み幅（分）。1枠の長さより短くすると枠が重なって選べる */
  get slotStepMinutes() {
    return intEnv("SLOT_STEP_MINUTES", 30, 5, 480);
  },
  /** 何日先まで予約を受け付けるか */
  get daysAhead() {
    return intEnv("BOOKING_DAYS_AHEAD", 30, 1, 365);
  },
  /** 予約開始時刻の何時間前まで受け付けるか */
  get minLeadHours() {
    return intEnv("MIN_LEAD_HOURS", 2, 0, 24 * 14);
  },
  /** 1人が同時に持てる（承認待ち＋確定済みの）将来予約の上限 */
  get maxActivePerUser() {
    return intEnv("MAX_ACTIVE_PER_USER", 3, 1, 100);
  },
  get shopName() {
    return process.env.NEXT_PUBLIC_SHOP_NAME || "【Basic】ご来店予約";
  },
};
