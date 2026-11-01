// 電話番号の形式チェック（クライアント・サーバー共通）。
// ハイフン・スペース・括弧・先頭の+を許可し、6〜20文字の数字を含む形式のみ許可する。
// カッコはHTMLのpattern属性（vフラグ）で文字クラス内の特殊文字として扱われるためエスケープする。
export const PHONE_PATTERN = "^[0-9+\\-\\(\\) ]{6,20}$";
const PHONE_RE = new RegExp(PHONE_PATTERN);

/** 電話番号は必須項目。未入力は不正とする */
export function isValidPhone(phone: string): boolean {
  return phone !== "" && PHONE_RE.test(phone);
}
