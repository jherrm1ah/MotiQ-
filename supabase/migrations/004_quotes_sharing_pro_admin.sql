-- Motiq: mechanic quotes, shared cars, language, Motiq Pro, the admin page and error tracking.
-- Safe to run more than once.

-- Stops if pasted into the Pleen project by mistake.
do $$ begin if to_regclass('public.plans') is not null or to_regclass('public.crews') is not null then raise exception 'STOP: this is the Pleen project. Open the MotiQ project and paste this there.'; end if; end $$;

-- Profile extras ---------------------------------------------------------------------------------
alter table public.profiles add column if not exists language text not null default 'en' check (language in ('en', 'fr', 'es', 'pt', 'ar', 'sw', 'ha', 'yo'));
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists plan text not null default 'free' check (plan in ('free', 'pro'));
alter table public.profiles add column if not exists pro_until timestamptz;

-- People can't make themselves admin or Pro by editing their own profile.
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'authenticated' then
    new.is_admin := old.is_admin; new.plan := old.plan; new.pro_until := old.pro_until;
  end if;
  return new;
end $$;
revoke execute on function public.protect_profile_fields() from public, anon, authenticated;
drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile_fields();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false);
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select plan = 'pro' and (pro_until is null or pro_until > now()) from public.profiles where id = uid), false);
$$;
revoke execute on function public.is_pro(uuid) from public, anon;
grant execute on function public.is_pro(uuid) to authenticated;

-- Shared cars: the owner shares a code; whoever redeems it can see the car and add services,
-- reminders and fill-ups. Only the owner can edit or delete the car itself.
create table if not exists public.vehicle_members (
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (vehicle_id, member_id)
);
alter table public.vehicle_members enable row level security;
create table if not exists public.vehicle_invites (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
alter table public.vehicle_invites enable row level security;

create or replace function public.owns_vehicle(vid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vehicles v where v.id = vid and v.owner_id = (select auth.uid()));
$$;
revoke execute on function public.owns_vehicle(uuid) from public, anon;
grant execute on function public.owns_vehicle(uuid) to authenticated;

create or replace function public.can_use_vehicle(vid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vehicles v where v.id = vid and v.owner_id = (select auth.uid()))
      or exists (select 1 from public.vehicle_members m where m.vehicle_id = vid and m.member_id = (select auth.uid()));
$$;
revoke execute on function public.can_use_vehicle(uuid) from public, anon;
grant execute on function public.can_use_vehicle(uuid) to authenticated;

drop policy if exists "members: see" on public.vehicle_members;
create policy "members: see" on public.vehicle_members for select to authenticated
  using (member_id = (select auth.uid()) or public.owns_vehicle(vehicle_id));
drop policy if exists "members: remove" on public.vehicle_members;
create policy "members: remove" on public.vehicle_members for delete to authenticated
  using (member_id = (select auth.uid()) or public.owns_vehicle(vehicle_id));
drop policy if exists "invites: owner" on public.vehicle_invites;
create policy "invites: owner" on public.vehicle_invites for all to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()) and public.owns_vehicle(vehicle_id));

create or replace function public.redeem_vehicle_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.vehicle_invites; me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into inv from public.vehicle_invites where code = upper(btrim(p_code));
  if inv.code is null or inv.expires_at < now() then raise exception 'That code is wrong or has expired. Ask for a new one.'; end if;
  if exists (select 1 from public.vehicles where id = inv.vehicle_id and owner_id = me) then raise exception 'That''s already your car.'; end if;
  insert into public.vehicle_members (vehicle_id, member_id) values (inv.vehicle_id, me) on conflict do nothing;
  return inv.vehicle_id;
end $$;
revoke execute on function public.redeem_vehicle_invite(text) from public, anon;
grant execute on function public.redeem_vehicle_invite(text) to authenticated;

-- Members can see the shared car and its history, and add to it.
drop policy if exists "vehicles: shared read" on public.vehicles;
create policy "vehicles: shared read" on public.vehicles for select to authenticated
  using (public.can_use_vehicle(vehicles.id));
do $$
declare t text;
begin
  foreach t in array array['service_records', 'reminders', 'scans', 'vehicle_documents', 'fuel_logs'] loop
    execute format('drop policy if exists "shared: read" on public.%I', t);
    execute format('create policy "shared: read" on public.%I for select to authenticated using (public.can_use_vehicle(vehicle_id))', t);
    execute format('drop policy if exists "shared: add" on public.%I', t);
    execute format('create policy "shared: add" on public.%I for insert to authenticated with check (owner_id = (select auth.uid()) and public.can_use_vehicle(vehicle_id))', t);
  end loop;
end $$;
-- Members can tick off reminders (mark done) on a shared car.
drop policy if exists "reminders: shared done" on public.reminders;
create policy "reminders: shared done" on public.reminders for update to authenticated
  using (public.can_use_vehicle(vehicle_id)) with check (public.can_use_vehicle(vehicle_id));

-- Mechanic quotes: a driver describes a job; people offering services in that country reply with
-- a price. Only the driver and the people quoting see the offers.
create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  car text not null default '' check (char_length(car) <= 120),
  description text not null check (char_length(btrim(description)) between 10 and 1500),
  country text not null default '' check (char_length(country) <= 2),
  city text not null default '' check (char_length(city) <= 60),
  status text not null default 'open' check (status in ('open', 'accepted', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists quote_requests_country_idx on public.quote_requests (country, created_at desc) where status = 'open';
alter table public.quote_requests enable row level security;

create or replace function public.offers_services(p_country text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.listings l where l.seller_id = (select auth.uid()) and l.kind = 'service' and l.status = 'active' and l.country = p_country);
$$;
revoke execute on function public.offers_services(text) from public, anon;
grant execute on function public.offers_services(text) to authenticated;

drop policy if exists "quotes: own" on public.quote_requests;
create policy "quotes: own" on public.quote_requests for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "quotes: providers see open" on public.quote_requests;
create policy "quotes: providers see open" on public.quote_requests for select to authenticated
  using (status = 'open' and owner_id <> (select auth.uid()) and public.offers_services(country));

create table if not exists public.quote_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  price numeric(14, 2) check (price is null or price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'sent' check (status in ('sent', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (request_id, provider_id)
);
alter table public.quote_offers enable row level security;
drop policy if exists "offers: provider" on public.quote_offers;
create policy "offers: provider" on public.quote_offers for all to authenticated
  using (provider_id = (select auth.uid()))
  with check (provider_id = (select auth.uid()) and exists (select 1 from public.quote_requests r where r.id = request_id and r.status = 'open' and public.offers_services(r.country))
    and (listing_id is null or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid()))));
drop policy if exists "offers: driver reads" on public.quote_offers;
create policy "offers: driver reads" on public.quote_offers for select to authenticated
  using (exists (select 1 from public.quote_requests r where r.id = request_id and r.owner_id = (select auth.uid())));
drop policy if exists "offers: driver answers" on public.quote_offers;
create policy "offers: driver answers" on public.quote_offers for update to authenticated
  using (exists (select 1 from public.quote_requests r where r.id = request_id and r.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.quote_requests r where r.id = request_id and r.owner_id = (select auth.uid())));

-- Motiq Pro: payments recorded by the Paystack webhook (service role only).
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  reference text not null unique,
  amount numeric(14, 2) not null,
  currency text not null,
  months int not null default 1,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.payments enable row level security;
drop policy if exists "payments: own read" on public.payments;
create policy "payments: own read" on public.payments for select to authenticated using (owner_id = (select auth.uid()));

-- Free plan limits: 2 cars (shared cars don't count).
create or replace function public.vehicle_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_pro(new.owner_id) and (select count(*) from public.vehicles where owner_id = new.owner_id) >= 2 then
    raise exception 'The free plan has room for 2 cars. Upgrade to Motiq Pro for more.';
  end if;
  return new;
end $$;
revoke execute on function public.vehicle_limit() from public, anon, authenticated;
drop trigger if exists vehicles_limit on public.vehicles;
create trigger vehicles_limit before insert on public.vehicles for each row execute function public.vehicle_limit();

-- Error tracking: the app reports crashes and failures here (no personal data beyond who it was).
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid(),
  message text not null check (char_length(message) <= 500),
  stack text not null default '' check (char_length(stack) <= 4000),
  screen text not null default '' check (char_length(screen) <= 40),
  app_version text not null default '' check (char_length(app_version) <= 20),
  platform text not null default '' check (char_length(platform) <= 20),
  created_at timestamptz not null default now()
);
create index if not exists client_errors_time_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
drop policy if exists "errors: report" on public.client_errors;
create policy "errors: report" on public.client_errors for insert to authenticated, anon with check (user_id is null or user_id = (select auth.uid()));
drop policy if exists "errors: admin" on public.client_errors;
create policy "errors: admin" on public.client_errors for select to authenticated using (public.is_admin());
grant insert on public.client_errors to anon;

-- Admin: see and act on reports and listings; read counts.
drop policy if exists "reports: admin" on public.listing_reports;
create policy "reports: admin" on public.listing_reports for select to authenticated using (public.is_admin());
drop policy if exists "listings: admin read" on public.listings;
create policy "listings: admin read" on public.listings for select to authenticated using (public.is_admin());
drop policy if exists "listings: admin moderate" on public.listings;
create policy "listings: admin moderate" on public.listings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'pro', (select count(*) from public.profiles where plan = 'pro' and (pro_until is null or pro_until > now())),
    'cars', (select count(*) from public.vehicles),
    'scans_7d', (select count(*) from public.scans where created_at > now() - interval '7 days'),
    'ai_today', (select count(*) from public.ai_messages where role = 'user' and created_at > now() - interval '1 day'),
    'listings_active', (select count(*) from public.listings where status = 'active'),
    'listings_hidden', (select count(*) from public.listings where status = 'hidden'),
    'reports_7d', (select count(*) from public.listing_reports where created_at > now() - interval '7 days'),
    'quotes_open', (select count(*) from public.quote_requests where status = 'open'),
    'errors_24h', (select count(*) from public.client_errors where created_at > now() - interval '1 day')
  );
end $$;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
