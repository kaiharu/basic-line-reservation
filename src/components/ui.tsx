'use client';

import { useCallback, useRef, useState } from 'react';

export type Reservation = {
  id: string;
  customerName: string;
  lineName: string | null;
  phone: string | null;
  note: string | null;
  start: string;
  end: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  adminMessage: string | null;
  createdAt: string;
};

export const STATUS_LABEL: Record<Reservation['status'], string> = {
  pending: '承認待ち',
  approved: '予約確定',
  rejected: 'お断り',
  cancelled: 'キャンセル',
};

export function StatusPill({ status }: { status: Reservation['status'] }) {
  return <span className={`pill ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function useToast() {
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((text: string, err = false) => {
    setToast({ text, err });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), err ? 4500 : 2500);
  }, []);
  const node = toast ? <div className={`toast ${toast.err ? 'err' : ''}`} role="status">{toast.text}</div> : null;
  return { show, node };
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
