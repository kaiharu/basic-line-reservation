import { adminIdList } from './auth';

// Messaging API でプッシュメッセージを送る。
// 送信に失敗しても予約処理自体は成功させたいので、例外は投げずにログだけ残す。

export async function pushText(to: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.log(`[LINE通知スキップ: トークン未設定] to=${to}\n${text}`);
    return;
  }
  if (to.startsWith('dev')) {
    console.log(`[LINE通知スキップ: 開発ユーザー] to=${to}\n${text}`);
    return;
  }
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
      cache: 'no-store',
    });
    if (!res.ok) console.error('LINE push failed', res.status, await res.text());
  } catch (e) {
    console.error('LINE push error', e);
  }
}

export async function notifyAdmins(text: string): Promise<void> {
  await Promise.all(adminIdList().map((id) => pushText(id, text)));
}

// LINEミニアプリは https://miniapp.line.me/{LIFF ID}、従来のLIFFアプリは https://liff.line.me/{LIFF ID}
const appBase = () => (process.env.LIFF_URL_BASE || 'https://miniapp.line.me').replace(/\/$/, '');

/** 管理画面へのリンク（LINE 内で開ける形にする） */
export function adminUrl(): string {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (liffId) return `${appBase()}/${liffId}/admin`;
  return `${process.env.APP_URL ?? ''}/admin`;
}

export function customerUrl(): string {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (liffId) return `${appBase()}/${liffId}`;
  return process.env.APP_URL ?? '';
}
