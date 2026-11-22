-- DEWA OTP | Supabase PostgreSQL schema
-- Jalankan melalui Supabase SQL Editor pada project baru.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  username text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$')
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('deposit','order','refund','adjustment')),
  amount bigint not null check (amount <> 0),
  reference_id uuid,
  idempotency_key text,
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'nokos',
  provider_activation_id text unique,
  service_code text not null,
  country_id integer not null default 6,
  operator text not null default 'any',
  provider_server text not null check (provider_server in ('s1','s2')),
  provider_price bigint not null check (provider_price >= 0),
  price bigint not null check (price >= 0),
  phone_number text,
  otp_code text,
  status text not null default 'creating' check (status in ('creating','pending','refunding','success','refunded','failed','cancelled','expired')),
  refund_amount bigint not null default 0 check (refund_amount >= 0),
  idempotency_key text not null,
  provider_expires_at timestamptz,
  last_otp_check_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_status_idx on public.orders(status, created_at);

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gateway text not null default 'doku',
  gateway_reference text unique,
  amount bigint not null check (amount >= 10000),
  status text not null default 'pending' check (status in ('pending','paid','expired','failed','cancelled')),
  idempotency_key text not null,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

-- RLS: akun hanya dapat membaca/memperbarui data miliknya sendiri.
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.orders enable row level security;
alter table public.deposits enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;

drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own" on public.wallets for select to authenticated using (auth.uid() = user_id);

drop policy if exists "wallet_transactions_select_own" on public.wallet_transactions;
create policy "wallet_transactions_select_own" on public.wallet_transactions for select to authenticated using (auth.uid() = user_id);

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders for select to authenticated using (auth.uid() = user_id);

drop policy if exists "deposits_select_own" on public.deposits;
create policy "deposits_select_own" on public.deposits for select to authenticated using (auth.uid() = user_id);

-- Username availability: hanya mengembalikan boolean, tanpa membuka profil pengguna lain.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where username = lower(trim(p_username))
  );
$$;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- Membuat profil + wallet saat user Auth Supabase dibuat.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_username text;
begin
  chosen_username := lower(coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)));
  insert into public.profiles (id, full_name, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), chosen_username);
  insert into public.wallets (user_id, balance) values (new.id, 0);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_dewa_otp on auth.users;
create trigger on_auth_user_created_dewa_otp
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Atomic debit + order reservation. Dipanggil oleh API dengan cookie user yang valid.
create or replace function public.reserve_order_and_debit(
  p_user_id uuid,
  p_service_code text,
  p_country_id integer,
  p_operator text,
  p_provider_server text,
  p_sale_price bigint,
  p_provider_price bigint,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance bigint;
  new_order_id uuid;
  existing_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'UNAUTHORIZED'; end if;
  if p_sale_price <= 0 or p_provider_price < 0 then raise exception 'INVALID_PRICE'; end if;
  if p_provider_server not in ('s1','s2') then raise exception 'INVALID_SERVER'; end if;

  select id into existing_id from public.orders
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if existing_id is not null then return existing_id; end if;

  select balance into current_balance from public.wallets where user_id = p_user_id for update;
  if current_balance is null then raise exception 'WALLET_NOT_FOUND'; end if;
  if exists (
    select 1 from public.orders
    where user_id = p_user_id and created_at > now() - interval '3 seconds'
  ) then raise exception 'ORDER_COOLDOWN'; end if;
  if current_balance < p_sale_price then raise exception 'INSUFFICIENT_BALANCE'; end if;

  insert into public.orders (
    user_id, service_code, country_id, operator, provider_server,
    provider_price, price, status, idempotency_key
  ) values (
    p_user_id, p_service_code, p_country_id, p_operator, p_provider_server,
    p_provider_price, p_sale_price, 'creating', p_idempotency_key
  ) returning id into new_order_id;

  update public.wallets set balance = balance - p_sale_price, updated_at = now() where user_id = p_user_id;
  insert into public.wallet_transactions (
    user_id, transaction_type, amount, reference_id, idempotency_key, description
  ) values (
    p_user_id, 'order', -p_sale_price, new_order_id, 'order:' || new_order_id::text, 'Pembelian nomor OTP'
  );
  return new_order_id;
end;
$$;


-- Jika provider mengembalikan error penolakan eksplisit saat getNumber, lepas reservasi saldo.
-- Fungsi ini hanya menerima order berstatus creating (belum ada activation ID).
create or replace function public.refund_failed_order(p_user_id uuid, p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare target public.orders%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'UNAUTHORIZED'; end if;
  select * into target from public.orders where id = p_order_id and user_id = p_user_id for update;
  if not found or target.status <> 'creating' or target.provider_activation_id is not null or target.refund_amount <> 0 then return false; end if;
  update public.wallets set balance = balance + target.price, updated_at = now() where user_id = p_user_id;
  update public.orders set status = 'refunded', refund_amount = target.price, updated_at = now() where id = p_order_id;
  insert into public.wallet_transactions (user_id, transaction_type, amount, reference_id, idempotency_key, description)
  values (p_user_id, 'refund', target.price, p_order_id, 'refund:' || p_order_id::text, 'Pengembalian saldo karena provider menolak order')
  on conflict (user_id, idempotency_key) do nothing;
  return true;
end;
$$;

-- Mengunci order sebelum menghubungi cancelActivation di provider.
create or replace function public.begin_order_refund(p_user_id uuid, p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'UNAUTHORIZED'; end if;
  update public.orders set status = 'refunding', updated_at = now()
    where id = p_order_id and user_id = p_user_id and status = 'pending' and refund_amount = 0;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- Saldo dikreditkan hanya setelah provider membatalkan aktivasi dan fungsi ini sukses.
create or replace function public.finalize_order_refund(p_user_id uuid, p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare target public.orders%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'UNAUTHORIZED'; end if;
  select * into target from public.orders where id = p_order_id and user_id = p_user_id for update;
  if not found or target.status <> 'refunding' or target.refund_amount <> 0 then return false; end if;

  update public.wallets set balance = balance + target.price, updated_at = now() where user_id = p_user_id;
  update public.orders set status = 'refunded', refund_amount = target.price, updated_at = now() where id = p_order_id;
  insert into public.wallet_transactions (
    user_id, transaction_type, amount, reference_id, idempotency_key, description
  ) values (
    p_user_id, 'refund', target.price, p_order_id, 'refund:' || p_order_id::text, 'Refund 100% pembelian nomor'
  ) on conflict (user_id, idempotency_key) do nothing;
  return true;
end;
$$;

create or replace function public.restore_order_after_refund_error(p_user_id uuid, p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'UNAUTHORIZED'; end if;
  update public.orders set status = 'pending', updated_at = now()
    where id = p_order_id and user_id = p_user_id and status = 'refunding' and refund_amount = 0;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;


-- API-only profile update: user tidak mendapat izin UPDATE tabel profiles secara langsung.
create or replace function public.update_profile_name(p_user_id uuid, p_full_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'UNAUTHORIZED'; end if;
  if length(trim(p_full_name)) < 1 or length(trim(p_full_name)) > 80 then raise exception 'INVALID_NAME'; end if;
  update public.profiles set full_name = trim(p_full_name), updated_at = now() where id = p_user_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- Menautkan ID aktivasi dan nomor dari provider setelah reservasi wallet sukses.
create or replace function public.attach_provider_activation(
  p_user_id uuid,
  p_order_id uuid,
  p_activation_id text,
  p_phone_number text,
  p_expires_at text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'UNAUTHORIZED'; end if;
  update public.orders
  set provider_activation_id = p_activation_id,
      phone_number = p_phone_number,
      provider_expires_at = nullif(p_expires_at, '')::timestamptz,
      status = 'pending', updated_at = now()
  where id = p_order_id and user_id = p_user_id and status = 'creating';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- Cooldown cek OTP dijaga atomik di database agar beberapa tab tidak melewati batas.
create or replace function public.touch_order_otp_check(p_user_id uuid, p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'UNAUTHORIZED'; end if;
  update public.orders
  set last_otp_check_at = now(), updated_at = now()
  where id = p_order_id and user_id = p_user_id
    and status in ('pending','refunding')
    and (last_otp_check_at is null or last_otp_check_at < now() - interval '3 seconds');
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- OTP yang diterima mengunci status Success. Tidak ada refund setelah state ini.
create or replace function public.complete_order_with_otp(p_user_id uuid, p_order_id uuid, p_otp_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'UNAUTHORIZED'; end if;
  update public.orders
  set status = 'success', otp_code = p_otp_code, completed_at = now(), updated_at = now()
  where id = p_order_id and user_id = p_user_id and status in ('pending','refunding');
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.reserve_order_and_debit(uuid,text,integer,text,text,bigint,bigint,text) from public;
revoke all on function public.begin_order_refund(uuid,uuid) from public;
revoke all on function public.finalize_order_refund(uuid,uuid) from public;
revoke all on function public.restore_order_after_refund_error(uuid,uuid) from public;
grant execute on function public.reserve_order_and_debit(uuid,text,integer,text,text,bigint,bigint,text) to service_role;
grant execute on function public.begin_order_refund(uuid,uuid) to service_role;
grant execute on function public.finalize_order_refund(uuid,uuid) to service_role;
grant execute on function public.restore_order_after_refund_error(uuid,uuid) to service_role;

-- Catatan: hanya service backend/DOKU webhook tervalidasi yang boleh mengkredit deposit.
-- Jangan berikan policy INSERT/UPDATE wallet atau wallet_transactions kepada role anon/authenticated.

revoke all on function public.update_profile_name(uuid,text) from public;
revoke all on function public.attach_provider_activation(uuid,uuid,text,text,text) from public;
revoke all on function public.touch_order_otp_check(uuid,uuid) from public;
revoke all on function public.complete_order_with_otp(uuid,uuid,text) from public;
grant execute on function public.update_profile_name(uuid,text) to authenticated;
grant execute on function public.attach_provider_activation(uuid,uuid,text,text,text) to service_role;
grant execute on function public.touch_order_otp_check(uuid,uuid) to service_role;
grant execute on function public.complete_order_with_otp(uuid,uuid,text) to service_role;

revoke all on function public.refund_failed_order(uuid,uuid) from public;
grant execute on function public.refund_failed_order(uuid,uuid) to service_role;
