-- LINE予約ミニアプリ用スキーマ（Supabase の SQL Editor でそのまま実行できます）
-- タイムゾーンは Asia/Tokyo 前提。日時は timestamptz で保存します。

-- 曜日ごとの営業時間（0=日曜 ... 6=土曜）
create table if not exists business_hours (
  weekday    smallint primary key check (weekday between 0 and 6),
  open_time  time not null default '10:00',
  close_time time not null default '19:00',
  is_closed  boolean not null default false,
  check (close_time > open_time)
);

insert into business_hours (weekday, open_time, close_time, is_closed) values
  (0, '10:00', '19:00', true),   -- 日曜 定休
  (1, '10:00', '19:00', false),
  (2, '10:00', '19:00', false),
  (3, '10:00', '19:00', false),
  (4, '10:00', '19:00', false),
  (5, '10:00', '19:00', false),
  (6, '10:00', '19:00', false)
on conflict (weekday) do nothing;

-- 予約不可の時間帯（臨時休業・休憩・私用など）
create table if not exists blocked_periods (
  id         bigserial primary key,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index if not exists blocked_periods_range_idx on blocked_periods (start_at, end_at);

-- 予約（リクエスト）
create table if not exists reservations (
  id            bigserial primary key,
  line_user_id  text not null,
  line_name     text,
  customer_name text not null,
  phone         text,
  party_size    smallint not null default 1 check (party_size between 1 and 20),
  note          text,
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  admin_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_at > start_at)
);
create index if not exists reservations_user_idx   on reservations (line_user_id, start_at desc);
create index if not exists reservations_status_idx on reservations (status, start_at);

-- 既存環境向け：来店人数カラムを追加（新規作成時は上のcreate tableで既に入っている）
alter table reservations add column if not exists party_size smallint not null default 1 check (party_size between 1 and 20);

-- 二重予約防止：承認待ち・確定済みの予約同士は時間が重ならない（同時送信でもDBが弾く）
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_no_overlap') then
    alter table reservations
      add constraint reservations_no_overlap
      exclude using gist (tstzrange(start_at, end_at, '[)') with &&)
      where (status in ('pending', 'approved'));
  end if;
end $$;

-- Supabase: サーバー（Vercel）から直接接続するため、ブラウザ用APIからは触れないようRLSを有効化しておく
alter table business_hours  enable row level security;
alter table blocked_periods enable row level security;
alter table reservations    enable row level security;
