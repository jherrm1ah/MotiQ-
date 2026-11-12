-- Motiq 1.4: things drivers use every day. Fuel prices reported by drivers, road alerts, trip
-- scores and work/personal trips, SOS contacts, ride-hailing earnings, fair-price checks and
-- invite-a-friend rewards. Run after 004.
do $$ begin if to_regclass('public.plans') is not null or to_regclass('public.crews') is not null then raise exception 'STOP: this is the Pleen project. Open the MotiQ project and paste this there.'; end if; end $$;
do $$ begin if to_regclass('public.quote_offers') is null then raise exception 'Run 004 first.'; end if; end $$;

-- ---- Profile: SOS contacts, ride-hailing driver mode, invite code
alter table public.profiles add column if not exists sos_contacts jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists driver_mode boolean not null default false;
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles drop constraint if exists profiles_sos_contacts_check;
alter table public.profiles add constraint profiles_sos_contacts_check check (jsonb_typeof(sos_contacts) = 'array' and jsonb_array_length(sos_contacts) <= 5 and pg_column_size(sos_contacts) < 4000);

-- Users can't set plan/admin themselves; trusted functions below can (they set motiq.trusted).
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'authenticated'
     and coalesce(current_setting('motiq.trusted', true), '') <> 'on' then
    new.is_admin := old.is_admin; new.plan := old.plan; new.pro_until := old.pro_until; new.referral_code := old.referral_code;
  end if;
  return new;
end $$;
revoke execute on function public.protect_profile_fields() from public, anon, authenticated;

-- ---- Trips: score, harsh braking, speeding, night, work or personal
alter table public.trips add column if not exists score int check (score between 0 and 100);
alter table public.trips add column if not exists hard_brakes int not null default 0 check (hard_brakes between 0 and 10000);
alter table public.trips add column if not exists speeding_sec int not null default 0 check (speeding_sec between 0 and 604800);
alter table public.trips add column if not exists night boolean not null default false;
alter table public.trips add column if not exists purpose text not null default 'personal' check (purpose in ('personal', 'work'));
alter table public.trips add column if not exists note text not null default '' check (char_length(note) <= 200);

-- ---- Fuel prices reported by drivers at a station
create table if not exists public.fuel_prices (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  station_key text not null check (char_length(station_key) between 1 and 60),
  station_name text not null default '' check (char_length(station_name) <= 120),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  country text not null default '' check (char_length(country) <= 2),
  fuel text not null default 'petrol' check (fuel in ('petrol', 'diesel', 'lpg', 'premium')),
  price numeric(12, 3) not null check (price > 0 and price < 1000000),
  currency text not null check (char_length(currency) = 3),
  created_at timestamptz not null default now()
);
create index if not exists fuel_prices_place_idx on public.fuel_prices (lat, lon, created_at desc);
alter table public.fuel_prices enable row level security;
drop policy if exists "fuel prices: read" on public.fuel_prices;
create policy "fuel prices: read" on public.fuel_prices for select to authenticated using (created_at > now() - interval '14 days');
drop policy if exists "fuel prices: add" on public.fuel_prices;
create policy "fuel prices: add" on public.fuel_prices for insert to authenticated with check (reporter_id = (select auth.uid()));
drop policy if exists "fuel prices: delete own" on public.fuel_prices;
create policy "fuel prices: delete own" on public.fuel_prices for delete to authenticated using (reporter_id = (select auth.uid()));

-- ---- Road alerts reported by drivers (pothole, flooding, crash, roadworks, broken-down car)
create table if not exists public.road_alerts (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('pothole', 'flood', 'accident', 'roadworks', 'breakdown', 'hazard')),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  note text not null default '' check (char_length(note) <= 140),
  still_there int not null default 0,
  gone int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 day'
);
create index if not exists road_alerts_place_idx on public.road_alerts (lat, lon) where gone < 2;
alter table public.road_alerts enable row level security;
drop policy if exists "road alerts: read" on public.road_alerts;
create policy "road alerts: read" on public.road_alerts for select to authenticated using (expires_at > now() and gone < 2 and not public.blocked_me(reporter_id));
drop policy if exists "road alerts: add" on public.road_alerts;
create policy "road alerts: add" on public.road_alerts for insert to authenticated with check (reporter_id = (select auth.uid()) and still_there = 0 and gone = 0);
drop policy if exists "road alerts: delete own" on public.road_alerts;
create policy "road alerts: delete own" on public.road_alerts for delete to authenticated using (reporter_id = (select auth.uid()));

-- How long an alert lasts depends on what it is (potholes stay, crashes clear).
create or replace function public.road_alert_defaults() returns trigger language plpgsql set search_path = public as $$
begin
  new.expires_at := now() + case new.kind when 'pothole' then interval '30 days' when 'roadworks' then interval '14 days' when 'flood' then interval '2 days' else interval '4 hours' end;
  if (select count(*) from public.road_alerts where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'You''ve reported a lot today. Thanks! Try again tomorrow.';
  end if;
  return new;
end $$;
drop trigger if exists road_alerts_defaults on public.road_alerts;
create trigger road_alerts_defaults before insert on public.road_alerts for each row execute function public.road_alert_defaults();

create table if not exists public.road_alert_votes (
  alert_id uuid not null references public.road_alerts(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  still boolean not null,
  created_at timestamptz not null default now(),
  primary key (alert_id, voter_id)
);
alter table public.road_alert_votes enable row level security;
-- Votes go through vote_road_alert only.

create or replace function public.vote_road_alert(p_alert uuid, p_still boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  insert into public.road_alert_votes (alert_id, voter_id, still) values (p_alert, me, p_still)
    on conflict (alert_id, voter_id) do update set still = excluded.still, created_at = now();
  update public.road_alerts a set
    still_there = (select count(*) from public.road_alert_votes v where v.alert_id = a.id and v.still),
    gone = (select count(*) from public.road_alert_votes v where v.alert_id = a.id and not v.still),
    expires_at = case when p_still then greatest(a.expires_at, now() + interval '4 hours') else a.expires_at end
  where a.id = p_alert;
end $$;
revoke execute on function public.vote_road_alert(uuid, boolean) from public, anon;
grant execute on function public.vote_road_alert(uuid, boolean) to authenticated;

create or replace function public.fuel_price_limit() returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.fuel_prices where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 40 then
    raise exception 'You''ve reported a lot of prices today. Thanks! Try again tomorrow.';
  end if;
  return new;
end $$;
drop trigger if exists fuel_prices_limit on public.fuel_prices;
create trigger fuel_prices_limit before insert on public.fuel_prices for each row execute function public.fuel_price_limit();

-- ---- Ride-hailing earnings (Uber, Bolt, inDrive…): your own rows only
create table if not exists public.driver_earnings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  earned_on date not null default current_date,
  platform text not null default '' check (char_length(platform) <= 30),
  amount numeric(14, 2) not null check (amount >= 0 and amount < 100000000),
  currency text not null check (char_length(currency) = 3),
  rides int check (rides between 0 and 500),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists driver_earnings_owner_idx on public.driver_earnings (owner_id, earned_on desc);
alter table public.driver_earnings enable row level security;
drop policy if exists "earnings: own" on public.driver_earnings;
create policy "earnings: own" on public.driver_earnings for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ---- Is this price fair? What mechanics quoted for similar jobs in your country (only shown
-- when at least 3 quotes match, so nobody's single quote is exposed).
create or replace function public.job_price_stats(p_words text[], p_country text, p_currency text) returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (
    select o.price from public.quote_offers o join public.quote_requests r on r.id = o.request_id
    where o.price is not null and o.currency = p_currency and r.country = p_country and r.created_at > now() - interval '18 months'
      and (select bool_and(r.description ilike '%' || w || '%') from unnest(p_words[1:4]) w where char_length(w) >= 3)
  )
  select case when count(*) >= 3 then jsonb_build_object('count', count(*), 'low', percentile_cont(0.25) within group (order by price),
    'median', percentile_cont(0.5) within group (order by price), 'high', percentile_cont(0.75) within group (order by price))
    else jsonb_build_object('count', count(*)) end from m;
$$;
revoke execute on function public.job_price_stats(text[], text, text) from public, anon;
grant execute on function public.job_price_stats(text[], text, text) to authenticated;

-- ---- Invite friends: every driver gets a code; a new driver who enters it within 14 days of
-- joining gives the inviter a free month of Pro (up to 12 months in total).
create table if not exists public.referrals (
  referred_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
alter table public.referrals enable row level security;
drop policy if exists "referrals: mine" on public.referrals;
create policy "referrals: mine" on public.referrals for select to authenticated using (referrer_id = (select auth.uid()) or referred_id = (select auth.uid()));

create or replace function public.my_referral_code() returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select referral_code into c from public.profiles where id = me;
  if c is not null then return c; end if;
  loop
    c := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    begin
      perform set_config('motiq.trusted', 'on', true);
      update public.profiles set referral_code = c where id = me;
      perform set_config('motiq.trusted', 'off', true);
      return c;
    exception when unique_violation then null; end;
  end loop;
end $$;
revoke execute on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

create or replace function public.redeem_referral(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inviter uuid; joined timestamptz; earned int; base timestamptz;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select id into inviter from public.profiles where referral_code = upper(trim(p_code));
  if inviter is null then raise exception 'That invite code doesn''t exist.'; end if;
  if inviter = me then raise exception 'That''s your own code.'; end if;
  if exists (select 1 from public.referrals where referred_id = me) then raise exception 'You''ve already used an invite code.'; end if;
  select created_at into joined from public.profiles where id = me;
  if joined < now() - interval '14 days' then raise exception 'Invite codes work in your first 14 days on Motiq.'; end if;
  insert into public.referrals (referred_id, referrer_id) values (me, inviter);
  select count(*) into earned from public.referrals where referrer_id = inviter;
  if earned <= 12 then
    select case when plan = 'pro' and pro_until > now() then pro_until else now() end into base from public.profiles where id = inviter;
    perform set_config('motiq.trusted', 'on', true);
    update public.profiles set plan = 'pro', pro_until = base + interval '1 month' where id = inviter;
    perform set_config('motiq.trusted', 'off', true);
  end if;
  return (select coalesce(nullif(name, ''), 'your friend') from public.profiles where id = inviter);
end $$;
revoke execute on function public.redeem_referral(text) from public, anon;
grant execute on function public.redeem_referral(text) to authenticated;
