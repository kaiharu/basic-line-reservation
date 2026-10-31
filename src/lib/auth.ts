import { HttpError } from './http';

export type AuthUser = { userId: string; name: string; isAdmin: boolean };

const cache = new Map<string, { user: Omit<AuthUser, 'isAdmin'>; exp: number }>();

function adminIds(): string[] {
  return (process.env.ADMIN_LINE_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminId(userId: string) {
  return adminIds().includes(userId);
}

export function adminIdList() {
  return adminIds();
}

/** 開発用：LINEなしで動作確認するためのダミー認証（本番では無効） */
function devAuthEnabled() {
  return process.env.DEV_AUTH === '1' && process.env.NODE_ENV !== 'production';
}

/**
 * LIFF の ID トークンを LINE の検証エンドポイントで検証してユーザーを特定する。
 * クライアントは Authorization: Bearer <idToken> を送る。
 */
export async function getUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  if (token.startsWith('dev:')) {
    if (!devAuthEnabled()) return null;
    const [, userId, name] = token.split(':');
    if (!userId) return null;
    return { userId, name: decodeURIComponent(name || userId), isAdmin: isAdminId(userId) };
  }

  const now = Date.now();
  const hit = cache.get(token);
  if (hit && hit.exp > now) return { ...hit.user, isAdmin: isAdminId(hit.user.userId) };

  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!clientId) throw new HttpError(500, 'LINE_LOGIN_CHANNEL_ID が設定されていません');

  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token, client_id: clientId }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { sub?: string; name?: string; exp?: number };
  if (!data.sub) return null;

  const user = { userId: data.sub, name: data.name ?? '' };
  const exp = Math.min((data.exp ?? 0) * 1000, now + 10 * 60 * 1000);
  if (cache.size > 1000) cache.clear();
  cache.set(token, { user, exp });
  return { ...user, isAdmin: isAdminId(user.userId) };
}

export async function requireUser(req: Request): Promise<AuthUser> {
  const u = await getUser(req);
  if (!u) throw new HttpError(401, 'ログインが必要です');
  return u;
}

export async function requireAdmin(req: Request): Promise<AuthUser> {
  const u = await requireUser(req);
  if (!u.isAdmin) throw new HttpError(403, '管理者のみ操作できます');
  return u;
}
