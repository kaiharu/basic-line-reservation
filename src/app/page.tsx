"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Gate, useLiff, type Me } from "@/components/LiffProvider";
import { StatusPill, errMsg, useToast, type Reservation } from "@/components/ui";
import { addDays, fmtSlot, weekdayOf, WEEKDAYS } from "@/lib/jst";
import { isJapaneseHoliday } from "@/lib/holiday-jp";
import { PHONE_PATTERN, isValidPhone } from "@/lib/phone";

type Slot = { start: string; end: string; label: string; state: "available" | "unavailable" };
type DaySlots = { date: string; closed: boolean; slots: Slot[] };

export default function Page() {
  return <Gate>{(me) => <CustomerApp me={me} />}</Gate>;
}

function CustomerApp({ me }: { me: Me }) {
  const [tab, setTab] = useState<"book" | "mine">("book");
  const toast = useToast();

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <h1>{me.config.shopName}</h1>
          <nav className="tabs">
            <button className={`tab ${tab === "book" ? "active" : ""}`} onClick={() => setTab("book")}>
              予約する
            </button>
            <button className={`tab ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>
              予約状況
            </button>
          </nav>
        </div>
      </header>
      <main className="container">
        {tab === "book" ? (
          <BookTab me={me} toast={toast.show} onBooked={() => setTab("mine")} />
        ) : (
          <MineTab toast={toast.show} />
        )}
        {me.isAdmin && (
          <p style={{ textAlign: "center", marginTop: 32 }}>
            <Link href="/basic-admin" className="btn small">
              管理画面へ
            </Link>
          </p>
        )}
      </main>
      {toast.node}
    </>
  );
}

function BookTab({ me, toast, onBooked }: { me: Me; toast: (t: string, err?: boolean) => void; onBooked: () => void }) {
  const { api } = useLiff();
  const dates = useMemo(() => {
    const list: string[] = [];
    for (let d = me.config.from; d <= me.config.to; d = addDays(d, 1)) list.push(d);
    return list;
  }, [me.config.from, me.config.to]);

  const [date, setDate] = useState(dates[0]);
  const [day, setDay] = useState<DaySlots | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Slot | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await api<DaySlots>(`/api/slots?date=${date}`);
      if (requestIdRef.current !== requestId) return; // 古いリクエストの結果は無視する
      setDay(result);
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      toast(errMsg(e), true);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [api, date, toast]);

  useEffect(() => {
    setDay(null);
    load();
  }, [load]);

  const availableCount = day?.slots.filter((s) => s.state === "available").length ?? 0;

  return (
    <>
      <div className="dates" role="tablist" aria-label="日付">
        {dates.map((d) => {
          const wd = weekdayOf(d);
          const holiday = isJapaneseHoliday(d);
          const [, m, dd] = d.split("-").map(Number);
          return (
            <button
              key={d}
              className={`date-chip ${d === date ? "active" : ""} ${wd === 0 || holiday ? "sun" : wd === 6 ? "sat" : ""}`}
              onClick={() => setDate(d)}
              aria-selected={d === date}
            >
              <div className="md">{m}月</div>
              <div className="d">{dd}</div>
              <div className="w">{WEEKDAYS[wd]}</div>
            </button>
          );
        })}
      </div>

      <div className="section-title" style={{ marginBottom: 0 }}>
        時間を選んでください
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        ※ ご予約は1枠{me.config.slotMinutes}分制です。
      </p>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        ※ お申し込み後、お店が承認した時点で予約確定となります。結果はLINEでお知らせします。
      </p>
      <div className="card">
        {!day || loading ? (
          <div className="center" style={{ minHeight: 120 }}>
            <div className="spinner" />
          </div>
        ) : day.closed ? (
          <div className="empty">この日は定休日です</div>
        ) : day.slots.length === 0 || availableCount === 0 ? (
          <div className="empty">この日は空きがありません</div>
        ) : (
          <div className="slots">
            {day.slots.map((s) => (
              <button
                key={s.start}
                className="slot"
                disabled={s.state !== "available"}
                onClick={() => setSelected(s)}
                aria-label={`${s.label} ${s.state === "available" ? "空きあり" : "予約不可"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <BookingSheet
          me={me}
          slot={selected}
          onClose={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            toast("予約リクエストを送信しました");
            onBooked();
          }}
          onConflict={(msg) => {
            setSelected(null);
            toast(msg, true);
            load();
          }}
        />
      )}
    </>
  );
}

function BookingSheet({
  me,
  slot,
  onClose,
  onDone,
  onConflict,
}: {
  me: Me;
  slot: Slot;
  onClose: () => void;
  onDone: () => void;
  onConflict: (msg: string) => void;
}) {
  const { api } = useLiff();
  const [name, setName] = useState(me.name);
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [partySize, setPartySize] = useState(1);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const phoneValid = isValidPhone(phone.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneValid) {
      setPhoneTouched(true);
      setError(phone.trim() === "" ? "電話番号を入力してください" : "電話番号の形式が正しくありません");
      return;
    }
    setSending(true);
    setError("");
    try {
      await api("/api/reservations", {
        method: "POST",
        body: { start: slot.start, customerName: name, phone: phone.trim(), partySize, note },
      });
      onDone();
    } catch (err) {
      const msg = errMsg(err);
      if (msg.includes("埋まって") || msg.includes("タッチの差")) onConflict(msg);
      else setError(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>予約リクエスト</h2>
        <div className="when">{fmtSlot(slot.start, slot.end)}</div>
        <div className="field">
          <label htmlFor="name">お名前</label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={50}
            autoComplete="name"
          />
        </div>
        <div className="field">
          <label htmlFor="partySize">ご来店人数</label>
          <select
            id="partySize"
            className="input"
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
          >
            {Array.from({ length: 4 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}名
              </option>
            ))}
          </select>
          <span className="opt" style={{ fontSize: 12 }}>
            ※ ブリードルームのサイズの都合上、最大4名までとなります。
          </span>
        </div>
        <div className="field">
          <label htmlFor="phone">電話番号</label>
          <input
            id="phone"
            className="input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setPhoneTouched(true)}
            required
            maxLength={20}
            autoComplete="tel"
            placeholder="09012345678"
            pattern={PHONE_PATTERN}
            aria-invalid={phoneTouched && !phoneValid}
          />
          {phoneTouched && !phoneValid && (
            <div className="notice">
              {phone.trim() === "" ? "電話番号を入力してください" : "電話番号の形式が正しくありません"}
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="note">
            ご要望・ご質問など<span className="opt">任意</span>
          </label>
          <textarea
            id="note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </div>
        {error && <div className="notice">{error}</div>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            戻る
          </button>
          <button type="submit" className="btn primary" disabled={sending || !name.trim() || !phoneValid}>
            {sending ? "送信中…" : "リクエストを送る"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MineTab({ toast }: { toast: (t: string, err?: boolean) => void }) {
  const { api } = useLiff();
  const [list, setList] = useState<Reservation[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ reservations: Reservation[] }>("/api/reservations");
      setList(r.reservations);
    } catch (e) {
      toast(errMsg(e), true);
    }
  }, [api, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (r: Reservation) => {
    if (!window.confirm(`${fmtSlot(r.start, r.end)} の予約を取り消しますか？`)) return;
    try {
      await api(`/api/reservations/${r.id}/cancel`, { method: "POST" });
      toast("予約を取り消しました");
      load();
    } catch (e) {
      toast(errMsg(e), true);
    }
  };

  if (!list) {
    return (
      <div className="center" style={{ minHeight: 200 }}>
        <div className="spinner" />
      </div>
    );
  }
  const now = Date.now();
  const upcoming = list.filter((r) => new Date(r.end).getTime() > now).reverse();
  const past = list.filter((r) => new Date(r.end).getTime() <= now);

  return (
    <>
      <div className="section-title">これからの予約</div>
      {upcoming.length === 0 && <div className="card empty">予約はありません</div>}
      {upcoming.map((r) => (
        <div className="card" key={r.id}>
          <div className="res-head">
            <div className="res-when">{fmtSlot(r.start, r.end)}</div>
            <StatusPill status={r.status} />
          </div>
          <div className="res-meta">
            {r.customerName} 様（{r.partySize}名）{r.note ? `\n${r.note}` : ""}
          </div>
          {r.adminMessage && <div className="res-msg">お店より：{r.adminMessage}</div>}
          {(r.status === "pending" || r.status === "approved") && new Date(r.start).getTime() > now && (
            <div className="actions">
              <button className="btn danger small" onClick={() => cancel(r)}>
                {r.status === "pending" ? "リクエストを取り消す" : "予約をキャンセル"}
              </button>
            </div>
          )}
        </div>
      ))}
      {past.length > 0 && (
        <>
          <div className="section-title">過去の予約</div>
          {past.map((r) => (
            <div className="card" key={r.id} style={{ opacity: 0.7 }}>
              <div className="res-head">
                <div>{fmtSlot(r.start, r.end)}</div>
                <StatusPill status={r.status} />
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
