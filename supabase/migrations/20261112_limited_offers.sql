-- Limited offers ("Онцлох"): a look sold for a while at its own price. Every week two painted looks
-- go on offer 20% off (run hourly by pg_cron; it only adds offers when none are running), and admins
-- can put any look on offer by hand. Looks with source 'limited' can only be bought this way.
-- Rank prizes are never on offer.

create table if not exists public.shop_offers (
  id uuid primary key default gen_random_uuid(),
  item_key text not null references public.shop_items (key) on delete cascade,
  price integer not null check (price >= 0),
  currency text not null check (currency in ('coin', 'diamond')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  auto boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint shop_offers_window check (ends_at > starts_at)
);
create index if not exists shop_offers_ends_at_idx on public.shop_offers (ends_at);
alter table public.shop_offers enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shop_offers' and policyname = 'Offers are public') then
    create policy "Offers are public" on public.shop_offers for select to anon, authenticated using (true);
  end if;
end $$;
revoke all on public.shop_offers from anon, authenticated;
grant select on public.shop_offers to anon, authenticated;

-- Buy the look on a running offer, at the offer's price. Admins pay nothing. Returns the balance left.
create or replace function public.buy_offer(p_offer uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  offer public.shop_offers;
  item public.shop_items;
  cost integer;
  balance integer;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  select * into offer from public.shop_offers where id = p_offer and now() >= starts_at and now() < ends_at;
  if not found then raise exception 'Энэ санал дууссан байна.' using errcode = 'P0002'; end if;
  select * into item from public.shop_items where key = offer.item_key and active and kind in ('frame', 'nameplate', 'border') and source <> 'rank';
  if not found then raise exception 'Бараа олдсонгүй.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.player_items where user_id = me and item_key = item.key) then
    raise exception 'Энэ бараа танд аль хэдийн байгаа.' using errcode = 'P0001';
  end if;
  cost := case when public.is_admin() then 0 else offer.price end;
  if offer.currency = 'diamond' then
    update public.profiles set diamonds = diamonds - cost where id = me and diamonds >= cost returning diamonds into balance;
    if not found then raise exception 'Алмаз хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  else
    update public.profiles set coins = coins - cost where id = me and coins >= cost returning coins into balance;
    if not found then raise exception 'Зоос хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  end if;
  insert into public.player_items (user_id, item_key) values (me, item.key);
  return balance;
end;
$$;
revoke all on function public.buy_offer(uuid) from public, anon;
grant execute on function public.buy_offer(uuid) to authenticated;

-- The weekly offer: two painted looks not featured last week, 20% off, until next Monday 00:00
-- (Ulaanbaatar). Does nothing while a weekly offer is running.
create or replace function public.rotate_shop_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_end timestamptz := (date_trunc('week', now() at time zone 'Asia/Ulaanbaatar') + interval '7 days') at time zone 'Asia/Ulaanbaatar';
  added integer;
begin
  if exists (select 1 from public.shop_offers where auto and ends_at > now()) then return 0; end if;
  if week_end - now() < interval '2 days' then week_end := week_end + interval '7 days'; end if;
  insert into public.shop_offers (item_key, price, currency, starts_at, ends_at, auto)
  select si.key, greatest(1, round(si.price * 0.8))::integer, si.currency, now(), week_end, true
  from public.shop_items si
  where si.active and si.currency = 'diamond' and si.source in ('shop', 'limited') and si.kind in ('frame', 'nameplate', 'border')
    and si.key not in (select o.item_key from public.shop_offers o where o.auto and o.ends_at > now() - interval '8 days')
  order by random()
  limit 2;
  get diagnostics added = row_count;
  return added;
end;
$$;
revoke all on function public.rotate_shop_offers() from public, anon, authenticated;

-- Admins put any look (not a rank prize) on offer for a number of hours, or end one early.
create or replace function public.admin_create_offer(p_item text, p_price integer, p_currency text, p_hours integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_admin();
  item public.shop_items;
  created uuid;
begin
  select * into item from public.shop_items where key = p_item and active and kind in ('frame', 'nameplate', 'border');
  if not found then raise exception 'Гоёл олдсонгүй.' using errcode = 'P0002'; end if;
  if item.source = 'rank' then raise exception 'Цолны шагналыг онцлох санал болгох боломжгүй.' using errcode = 'P0001'; end if;
  if p_currency not in ('coin', 'diamond') then raise exception 'Мөнгөн тэмдэгт буруу байна.' using errcode = '22023'; end if;
  if p_price is null or p_price < 0 or p_price > 1000000 then raise exception 'Үнэ 0-ээс 1,000,000 хүртэл байна.' using errcode = '22023'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 24 * 60 then raise exception 'Хугацаа 1 цагаас 60 хоног хүртэл байна.' using errcode = '22023'; end if;
  insert into public.shop_offers (item_key, price, currency, starts_at, ends_at, auto, created_by)
  values (item.key, p_price, p_currency, now(), now() + make_interval(hours => p_hours), false, me)
  returning id into created;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, 'offer', item.key, item.name || ' · ' || p_price || case when p_currency = 'diamond' then ' алмаз' else ' зоос' end || ' · ' || p_hours || ' цаг');
  return created;
end;
$$;
revoke all on function public.admin_create_offer(text, integer, text, integer) from public, anon;
grant execute on function public.admin_create_offer(text, integer, text, integer) to authenticated;

create or replace function public.admin_end_offer(p_offer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_admin();
  ended text;
begin
  update public.shop_offers set ends_at = greatest(starts_at + interval '1 second', now())
  where id = p_offer and ends_at > now()
  returning item_key into ended;
  if ended is null then raise exception 'Идэвхтэй санал олдсонгүй.' using errcode = 'P0002'; end if;
  insert into public.admin_actions (admin_id, action, target, detail) values (me, 'offer-end', ended, ended);
end;
$$;
revoke all on function public.admin_end_offer(uuid) from public, anon;
grant execute on function public.admin_end_offer(uuid) to authenticated;

-- Keep a weekly offer running: checked every hour, so a new one starts right after Monday 00:00.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'rotate-shop-offers') then
    perform cron.unschedule('rotate-shop-offers');
  end if;
  perform cron.schedule('rotate-shop-offers', '3 * * * *', 'select public.rotate_shop_offers()');
end $$;

select public.rotate_shop_offers();
