-- ============================================
-- RCR Database Schema
-- ============================================

-- 1. Items (dropdown suggestions + last price)
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_unit text default 'কেজি',
  last_price numeric(12,2),
  created_at timestamptz not null default now()
);

-- 2. Purchases (daily entries)
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  quantity numeric(12,3) not null,
  unit text not null,
  unit_price numeric(12,2),
  total_price numeric(14,2),
  supplier text,
  note text,
  purchase_date date not null default current_date,
  status text not null default 'pending',  -- pending | approved | rejected
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists purchases_date_idx on public.purchases (purchase_date desc);
create index if not exists purchases_created_idx on public.purchases (created_at desc);

-- 3. Enable Row Level Security
alter table public.items enable row level security;
alter table public.purchases enable row level security;

-- 4. Temporary open policies (we'll lock down when auth is added)
drop policy if exists "items_all_anon" on public.items;
create policy "items_all_anon" on public.items
  for all using (true) with check (true);

drop policy if exists "purchases_all_anon" on public.purchases;
create policy "purchases_all_anon" on public.purchases
  for all using (true) with check (true);

-- 5. Seed common restaurant items
insert into public.items (name, default_unit) values
  ('আলু', 'কেজি'),
  ('পেঁয়াজ', 'কেজি'),
  ('রসুন', 'কেজি'),
  ('আদা', 'কেজি'),
  ('টমেটো', 'কেজি'),
  ('কাঁচা মরিচ', 'কেজি'),
  ('ধনেপাতা', 'কেজি'),
  ('মুরগি', 'কেজি'),
  ('গরুর মাংস', 'কেজি'),
  ('খাসির মাংস', 'কেজি'),
  ('মাছ', 'কেজি'),
  ('চাল', 'কেজি'),
  ('আটা', 'কেজি'),
  ('সয়াবিন তেল', 'লিটার'),
  ('চিনি', 'কেজি'),
  ('লবণ', 'কেজি'),
  ('হলুদ গুঁড়া', 'কেজি'),
  ('মরিচ গুঁড়া', 'কেজি'),
  ('জিরা', 'কেজি'),
  ('গ্যাস সিলিন্ডার', 'পিস'),
  ('প্যাকেজিং বক্স', 'পিস')
on conflict (name) do nothing;