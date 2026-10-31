'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Gate, useLiff, type Me } from '@/components/LiffProvider';
import { StatusPill, errMsg, useToast, type Reservation } from '@/components/ui';
import { addDays, fmtDateLabel, fmtSlot, fmtTime, todayJst, WEEKDAYS } from '@/lib/jst';

type Toast = (t: string, err?: boolean) => void;
type Block = { id: string; start: string; end: string; reason: string | null };
type Tab = 'requests' | 'approved' | 'schedule' | 'blocks' | 'hours';

export default function AdminPage() {
  return <Gate>{(me) => (me.isAdmin ? <AdminApp me={me} /> : <NotAdmin me={me} />)}</Gate>;
}

function NotAdmin({ me }: { me: Me }) {
  return (
    <main className="container">
      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>管理者権限がありません</h2>
        <p>
          管理者として使うには、以下のユーザーIDを環境変数 <code>ADMIN_LINE_USER_IDS</code> に追加して再デプロイしてください。
        </p>
        <div className="mono">{me.userId}</div>
        <p style={{ marginTop: 16 }}>
          <Link href="/" className="btn small">
            お客様画面へ
          </Link>
        </p>
      </div>
    </main>
  );
}

function AdminApp({ me }: { me: Me }) {
  const [tab, setTab] = useState<Tab>('requests');
  const [pendingCount, setPendingCount] = useState(0);
  const toast = useToast();
  const tabs: [Tab, string][] = [
    ['requests', 'リクエスト'],
    ['approved', '確定予約'],
    ['schedule', 'スケジュール'],
    ['blocks', '予約不可設定'],
    ['hours', '営業時間'],
  ];

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <h1>
            {me.config.shopName}
            <span className="sub">管理</span>
          </h1>
          <nav className="tabs">
            {tabs.map(([key, label]) => (
              <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
                {label}
                {key === 'requests' && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="container">
        {tab === 'requests' && <ReservationsTab status="pending" toast={toast.show} onCount={setPendingCount} />}
        {tab === 'approved' && <ReservationsTab status="approved" toast={toast.show} />}
        {tab === 'schedule' && <ScheduleTab toast={toast.show} />}
        {tab === 'blocks' && <BlocksTab toast={toast.show} />}
        {tab === 'hours' && <HoursTab toast={toast.show} />}
        <PendingCounter onCount={setPendingCount} active={tab !== 'requests'} />
      </main>
      {toast.node}
    </>
  );
}

/** リクエストタブ以外を開いているときも承認待ち件数をバッジに出す */
function PendingCounter({ onCount, active }: { onCount: (n: number) => void; active: boolean }) {
  const { api } = useLiff();
  useEffect(() => {
    if (!active) return;
    api<{ reservations: Reservation[] }>('/api/admin/reservations?status=pending')
      .then((r) => onCount(r.reservations.length))
      .catch(() => {});
  }, [api, onCount, active]);
  return null;
}

/* ---------- 承認待ち / 確定予約 ---------- */

function ReservationsTab({ status, toast, onCount }: { status: 'pending' | 'approved'; toast: Toast; onCount?: (n: number) => void }) {
  const { api } = useLiff();
  const [list, setList] = useState<Reservation[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ reservations: Reservation[] }>(`/api/admin/reservations?status=${status}`);
      setList(r.reservations);
      onCount?.(r.reservations.length);
    } catch (e) {
      toast(errMsg(e), true);
    }
  }, [api, status, toast, onCount]);

  useEffect(() => {
    load();
  }, [load]);

  if (!list) return <Loading />;
  if (list.length === 0) {
    return <div className="card empty" style={{ marginTop: 20 }}>{status === 'pending' ? '承認待ちのリクエストはありません' : '今後の確定予約はありません'}</div>;
  }

  // 日付ごとにグループ化
  const groups = new Map<string, Reservation[]>();
  for (const r of list) {
    const key = fmtSlot(r.start, r.end).split(' ')[0];
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <>
      {[...groups.entries()].map(([day, items]) => (
        <section key={day}>
          <div className="section-title">{day}</div>
          {items.map((r) => (
            <AdminReservationCard key={r.id} r={r} toast={toast} onChanged={load} />
          ))}
        </section>
      ))}
    </>
  );
}

function AdminReservationCard({ r, toast, onChanged }: { r: Reservation; toast: Toast; onChanged: () => void }) {
  const { api } = useLiff();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const expired = new Date(r.start).getTime() < Date.now();

  const act = async (action: 'approve' | 'reject' | 'cancel') => {
    const label = { approve: '承認', reject: '却下', cancel: 'キャンセル' }[action];
    if (action !== 'approve' && !window.confirm(`この予約を${label}しますか？お客様にLINEで通知されます。`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/reservations/${r.id}`, { method: 'PATCH', body: { action, message } });
      toast(`${label}しました`);
      onChanged();
    } catch (e) {
      toast(errMsg(e), true);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="res-head">
        <div className="res-when">
          {fmtTime(r.start)}〜{fmtTime(r.end)}
        </div>
        {expired && r.status === 'pending' ? <span className="pill cancelled">期限切れ</span> : <StatusPill status={r.status} />}
      </div>
      <div className="res-meta">
        {r.customerName} 様{r.lineName && r.lineName !== r.customerName ? `（LINE: ${r.lineName}）` : ''}
        {r.phone ? `\nTEL: ${r.phone}` : ''}
        {r.note ? `\n${r.note}` : ''}
        {`\n申込: ${fmtSlot(r.createdAt, r.createdAt).split(' ')[0]} ${fmtTime(r.createdAt)}`}
      </div>
      <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
        <input
          className="input"
          placeholder="お客様へのメッセージ（任意）"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
        />
      </div>
      <div className="actions">
        {r.status === 'pending' ? (
          <>
            <button className="btn danger" disabled={busy} onClick={() => act('reject')}>
              却下
            </button>
            <button className="btn primary" disabled={busy || expired} onClick={() => act('approve')}>
              承認する
            </button>
          </>
        ) : (
          <button className="btn danger" disabled={busy} onClick={() => act('cancel')}>
            お店都合でキャンセル
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- スケジュール（1日の枠を見ながら受付停止/解除） ---------- */

type AdminDay = {
  date: string;
  closed: boolean;
  slots: { start: string; end: string; label: string; state: 'available' | 'booked' | 'blocked' | 'past' }[];
  reservations: Reservation[];
  blocks: Block[];
};

function ScheduleTab({ toast }: { toast: Toast }) {
  const { api } = useLiff();
  const [date, setDate] = useState(todayJst());
  const [day, setDay] = useState<AdminDay | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDay(await api<AdminDay>(`/api/admin/day?date=${date}`));
    } catch (e) {
      toast(errMsg(e), true);
    }
  }, [api, date, toast]);

  useEffect(() => {
    setDay(null);
    load();
  }, [load]);

  const addBlock = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      const r = await api<{ conflicts: number }>('/api/admin/blocks', { method: 'POST', body });
      toast(r.conflicts > 0 ? `${msg}（既存の予約が${r.conflicts}件あります。必要なら個別にキャンセルしてください）` : msg, r.conflicts > 0);
      load();
    } catch (e) {
      toast(errMsg(e), true);
    } finally {
      setBusy(false);
    }
  };

  const removeBlock = async (b: Block) => {
    setBusy(true);
    try {
      await api(`/api/admin/blocks/${b.id}`, { method: 'DELETE' });
      toast('予約不可を解除しました');
      load();
    } catch (e) {
      toast(errMsg(e), true);
    } finally {
      setBusy(false);
    }
  };

  const overlap = (aS: string, aE: string, bS: string, bE: string) => aS < bE && bS < aE;

  return (
    <>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn small" style={{ flex: '0 0 auto' }} onClick={() => setDate(addDays(date, -1))} aria-label="前日">
          ◀
        </button>
        <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn small" style={{ flex: '0 0 auto' }} onClick={() => setDate(addDays(date, 1))} aria-label="翌日">
          ▶
        </button>
      </div>
      <div className="section-title">{fmtDateLabel(date)}</div>

      {!day ? (
        <Loading />
      ) : (
        <>
          {day.blocks.length > 0 && (
            <div className="card">
              {day.blocks.map((b) => (
                <div className="sched-item" key={b.id}>
                  <span className="pill blocked">予約不可</span>
                  <div className="sched-body">
                    {blockLabel(b)}
                    {b.reason && <div className="muted">{b.reason}</div>}
                  </div>
                  <button className="btn small" disabled={busy} onClick={() => removeBlock(b)}>
                    解除
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            {day.closed ? (
              <div className="empty">定休日です（「営業時間」タブで変更できます）</div>
            ) : day.slots.length === 0 ? (
              <div className="empty">枠がありません</div>
            ) : (
              day.slots.map((s) => {
                const rs = day.reservations.filter((r) => overlap(r.start, r.end, s.start, s.end));
                const bs = day.blocks.filter((b) => overlap(b.start, b.end, s.start, s.end));
                const exact = bs.find((b) => b.start === s.start && b.end === s.end);
                return (
                  <div className="sched-item" key={s.start}>
                    <div className="sched-time">{s.label}</div>
                    <div className="sched-body">
                      {rs.map((r) => (
                        <div key={r.id}>
                          <StatusPill status={r.status} /> {r.customerName} 様
                        </div>
                      ))}
                      {rs.length === 0 && bs.length > 0 && <span className="pill blocked">予約不可</span>}
                      {rs.length === 0 && bs.length === 0 && (
                        <span className="muted">{s.state === 'past' ? '受付終了' : '空き'}</span>
                      )}
                    </div>
                    {exact ? (
                      <button className="btn small" disabled={busy} onClick={() => removeBlock(exact)}>
                        解除
                      </button>
                    ) : bs.length === 0 && rs.length === 0 && s.state !== 'past' ? (
                      <button
                        className="btn small"
                        disabled={busy}
                        onClick={() =>
                          addBlock(
                            { date, startTime: fmtTime(s.start), endTime: fmtTime(s.end) === '00:00' ? '23:59' : fmtTime(s.end) },
                            `${s.label} を予約不可にしました`,
                          )
                        }
                      >
                        受付停止
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {!day.closed && (
            <button
              className="btn danger block"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`${fmtDateLabel(date)} を終日予約不可にしますか？`))
                  addBlock({ date, allDay: true, reason: '臨時休業' }, `${fmtDateLabel(date)} を終日予約不可にしました`);
              }}
            >
              この日を終日 予約不可にする
            </button>
          )}
        </>
      )}
    </>
  );
}

function blockLabel(b: Block) {
  const s = new Date(b.start);
  const e = new Date(b.end);
  const sd = fmtSlot(s, s).split(' ')[0];
  const ed = fmtSlot(new Date(e.getTime() - 1), e).split(' ')[0];
  if (fmtTime(s) === '00:00' && fmtTime(e) === '00:00') return sd === ed ? `${sd} 終日` : `${sd}〜${ed} 終日`;
  return `${sd} ${fmtTime(s)}〜${fmtTime(e)}`;
}

/* ---------- 予約不可設定 ---------- */

function BlocksTab({ toast }: { toast: Toast }) {
  const { api } = useLiff();
  const [list, setList] = useState<Block[] | null>(null);
  const [date, setDate] = useState(todayJst());
  const [endDate, setEndDate] = useState(todayJst());
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('13:00');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList((await api<{ blocks: Block[] }>('/api/admin/blocks')).blocks);
    } catch (e) {
      toast(errMsg(e), true);
    }
  }, [api, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ conflicts: number }>('/api/admin/blocks', {
        method: 'POST',
        body: { date, endDate: allDay ? endDate : undefined, allDay, startTime, endTime, reason },
      });
      toast(
        r.conflicts > 0
          ? `追加しました。この時間帯に既存の予約が${r.conflicts}件あります（自動ではキャンセルされません）`
          : '予約不可の時間を追加しました',
        r.conflicts > 0,
      );
      setReason('');
      load();
    } catch (err) {
      toast(errMsg(err), true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b: Block) => {
    if (!window.confirm(`${blockLabel(b)} の予約不可設定を削除しますか？`)) return;
    try {
      await api(`/api/admin/blocks/${b.id}`, { method: 'DELETE' });
      toast('削除しました');
      load();
    } catch (e) {
      toast(errMsg(e), true);
    }
  };

  return (
    <>
      <div className="section-title">予約不可の時間を追加</div>
      <form className="card" onSubmit={submit}>
        <div className="field">
          <label className="check">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            終日（臨時休業・連休など）
          </label>
        </div>
        <div className="field">
          <label>{allDay ? '期間' : '日付'}</label>
          <div className="row">
            <input
              className="input"
              type="date"
              value={date}
              required
              onChange={(e) => {
                setDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
            />
            {allDay && (
              <>
                <span style={{ flex: '0 0 auto' }}>〜</span>
                <input className="input" type="date" value={endDate} min={date} required onChange={(e) => setEndDate(e.target.value)} />
              </>
            )}
          </div>
        </div>
        {!allDay && (
          <div className="field">
            <label>時間</label>
            <div className="row">
              <input className="input" type="time" value={startTime} required onChange={(e) => setStartTime(e.target.value)} />
              <span style={{ flex: '0 0 auto' }}>〜</span>
              <input className="input" type="time" value={endTime} required onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        )}
        <div className="field">
          <label>
            理由<span className="opt">任意・お客様には表示されません</span>
          </label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={100} placeholder="例：休憩、研修、私用" />
        </div>
        <button className="btn primary block" disabled={busy}>
          追加する
        </button>
      </form>

      <div className="section-title">設定中の予約不可（今後）</div>
      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <div className="card empty">ありません</div>
      ) : (
        <div className="card">
          {list.map((b) => (
            <div className="sched-item" key={b.id}>
              <div className="sched-body">
                <div style={{ fontWeight: 700 }}>{blockLabel(b)}</div>
                {b.reason && <div className="muted">{b.reason}</div>}
              </div>
              <button className="btn small danger" onClick={() => remove(b)}>
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- 営業時間 ---------- */

type Hour = { weekday: number; open: string; close: string; closed: boolean };

function HoursTab({ toast }: { toast: Toast }) {
  const { api, me } = useLiff();
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ hours: Hour[] }>('/api/admin/hours')
      .then((r) => setHours(r.hours))
      .catch((e) => toast(errMsg(e), true));
  }, [api, toast]);

  const update = (wd: number, patch: Partial<Hour>) =>
    setHours((h) => h!.map((x) => (x.weekday === wd ? { ...x, ...patch } : x)));

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ hours: Hour[] }>('/api/admin/hours', { method: 'PUT', body: { hours } });
      setHours(r.hours);
      toast('営業時間を保存しました');
    } catch (e) {
      toast(errMsg(e), true);
    } finally {
      setBusy(false);
    }
  };

  if (!hours) return <Loading />;
  // 月曜始まりで表示
  const ordered = [...hours].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));

  return (
    <>
      <div className="section-title">曜日ごとの受付時間</div>
      <div className="card">
        {ordered.map((h) => (
          <div className={`hours-row ${h.closed ? 'off' : ''}`} key={h.weekday}>
            <span className="wd" style={{ color: h.weekday === 0 ? 'var(--red)' : h.weekday === 6 ? '#2b6cd4' : undefined }}>
              {WEEKDAYS[h.weekday]}
            </span>
            <label className="check" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={h.closed} onChange={(e) => update(h.weekday, { closed: e.target.checked })} />
              定休
            </label>
            <input className="input" type="time" value={h.open} disabled={h.closed} onChange={(e) => update(h.weekday, { open: e.target.value })} />
            <span>〜</span>
            <input className="input" type="time" value={h.close} disabled={h.closed} onChange={(e) => update(h.weekday, { close: e.target.value })} />
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        1枠 {me?.config.slotMinutes}分 / 予約は開始 {me?.config.minLeadHours}時間前まで・{me && Math.round((Date.parse(me.config.to) - Date.parse(me.config.from)) / 86400000)}日先まで受付
        （環境変数で変更できます）
      </p>
      <button className="btn primary block" disabled={busy} onClick={save}>
        保存する
      </button>
    </>
  );
}

function Loading() {
  return (
    <div className="center" style={{ minHeight: 160 }}>
      <div className="spinner" />
    </div>
  );
}
