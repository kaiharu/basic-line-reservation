'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type Me = {
  userId: string;
  name: string;
  isAdmin: boolean;
  config: { slotMinutes: number; minLeadHours: number; shopName: string; from: string; to: string };
};

type Ctx = {
  me: Me | null;
  error: string | null;
  api: <T = unknown>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
  closeWindow: () => void;
};

const LiffContext = createContext<Ctx | null>(null);

export function useLiff() {
  const c = useContext(LiffContext);
  if (!c) throw new Error('LiffProvider が必要です');
  return c;
}

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === '1';

export function LiffProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string>('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liffRef = useRef<any>(null);

  const relogin = useCallback(() => {
    const liff = liffRef.current;
    if (!liff) return;
    // 設定ミスなどで常に401になる場合の無限ループ防止（5分に1回まで）
    try {
      const last = Number(sessionStorage.getItem('relogin_at') || 0);
      if (Date.now() - last < 5 * 60 * 1000) return;
      sessionStorage.setItem('relogin_at', String(Date.now()));
    } catch {
      /* storage不可の環境では続行 */
    }
    {
      if (liff.isLoggedIn()) liff.logout();
      liff.login({ redirectUri: window.location.href });
    }
  }, []);

  const api = useCallback(
    async <T,>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
      const res = await fetch(path, {
        method: init?.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
          ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && !DEV_MODE) {
        // IDトークンの期限切れ → 再ログイン
        relogin();
      }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `エラー (${res.status})`);
      return data as T;
    },
    [relogin],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (DEV_MODE) {
          // 開発モード：?as=ユーザーID でユーザーを切り替え（例: ?as=dev-admin）
          const as = new URLSearchParams(window.location.search).get('as') || 'dev-user';
          tokenRef.current = `dev:${as}:${encodeURIComponent(as === 'dev-user' ? 'テスト太郎' : as)}`;
        } else {
          const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
          if (!liffId) throw new Error('NEXT_PUBLIC_LIFF_ID が設定されていません');
          const liff = (await import('@line/liff')).default;
          await liff.init({ liffId });
          liffRef.current = liff;
          if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
          }
          const token = liff.getIDToken();
          if (!token) throw new Error('IDトークンを取得できませんでした（LIFFのscopeに openid を含めてください）');
          tokenRef.current = token;
        }
        const m = await api<Me>('/api/me');
        if (!cancelled) setMe(m);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const closeWindow = useCallback(() => {
    const liff = liffRef.current;
    if (liff?.isInClient?.()) liff.closeWindow();
  }, []);

  return <LiffContext.Provider value={{ me, error, api, closeWindow }}>{children}</LiffContext.Provider>;
}

export function Gate({ children }: { children: (me: Me) => ReactNode }) {
  const { me, error } = useLiff();
  if (error) {
    return (
      <main className="container">
        <div className="card error-card">
          <p>読み込みに失敗しました</p>
          <small>{error}</small>
          <button className="btn" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      </main>
    );
  }
  if (!me) {
    return (
      <main className="container center">
        <div className="spinner" aria-label="読み込み中" />
      </main>
    );
  }
  return <>{children(me)}</>;
}
