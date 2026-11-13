-- Motiq 1.5: notifications (in the app and pushed to the phone), mechanic reviews and verified
-- badges, booking a time, paying a mechanic through Motiq (held until the job is done), the
-- fleet plan, and usage stats for the admin page. Run after 005.
do $$ begin if to_regclass('public.plans') is not null or to_regclass('public.crews') is not null then raise exception 'STOP: this is the Pleen project. Open the MotiQ project and paste this there.'; end if; end $$;
do $$ begin if to_regclass('public.referrals') is null then raise exception 'Run 005 first.'; end if; end $$;
do $$ begin create extension if not exists pg_net with schema extensions; exception when others then raise notice 'pg_net not available: push notifications will be off (in-app notifications still work).'; end $$;

-- ---- Notifications: one row per thing to tell someone. The app shows them in the bell; a
-- trigger also asks the motiq-push function to send them to the person's phone.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('quote_offer', 'quote_accepted', 'message', 'booking', 'payment', 'review', 'road', 'system')),
  title text not null check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 300),
  link text not null default '' check (char_length(link) <= 80),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications: mine" on public.notifications;
create policy "notifications: mine" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notifications: mark read" on public.notifications;
create policy "notifications: mark read" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "notifications: delete" on public.notifications;
create policy "notifications: delete" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
exception when undefined_object then null; end $$;

-- Phones that can receive push notifications (Firebase Cloud Messaging tokens).
create table if not exists public.push_tokens (
  token text primary key check (char_length(token) between 20 and 400),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  platform text not null default 'android' check (platform in ('android', 'ios', 'web')),
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
drop policy if exists "push tokens: mine" on public.push_tokens;
create policy "push tokens: mine" on public.push_tokens for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Where the push function lives and the shared secret it checks. Only the database reads this.
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare n_id uuid; url text; secret text;
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, link) values (p_user, p_kind, left(p_title, 120), left(coalesce(p_body, ''), 300), left(coalesce(p_link, ''), 80)) returning id into n_id;
  select value into url from public.app_secrets where key = 'push_url';
  select value into secret from public.app_secrets where key = 'push_secret';
  if url is not null and secret is not null and exists (select 1 from public.push_tokens where user_id = p_user) then
    begin
      perform net.http_post(url := url, body := jsonb_build_object('notification_id', n_id), headers := jsonb_build_object('Content-Type', 'application/json', 'x-motiq-secret', secret));
    exception when others then null; -- a push that fails never blocks the action
    end;
  end if;
end $$;
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

-- New quote → the driver. Quote accepted → the mechanic.
create or replace function public.trg_offer_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare r public.quote_requests; who text;
begin
  select * into r from public.quote_requests where id = new.request_id;
  select coalesce(nullif(name, ''), 'A mechanic') into who from public.profiles where id = new.provider_id;
  if tg_op = 'INSERT' then
    perform public.notify(r.owner_id, 'quote_offer', who || ' sent you a quote', coalesce(new.currency || ' ' || to_char(new.price, 'FM999,999,999.##') || ' — ', '') || left(r.description, 120), 'quotes');
  elsif new.status = 'accepted' and old.status <> 'accepted' then
    perform public.notify(new.provider_id, 'quote_accepted', 'Your quote was accepted', left(r.description, 160), 'quotes');
  end if;
  return new;
end $$;
drop trigger if exists quote_offers_notify on public.quote_offers;
create trigger quote_offers_notify after insert or update of status on public.quote_offers for each row execute function public.trg_offer_notify();

-- New chat message → the other person.
create or replace function public.trg_message_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare c public.conversations; who text; other uuid;
begin
  select * into c from public.conversations where id = new.conversation_id;
  other := case when new.sender_id = c.buyer_id then c.seller_id else c.buyer_id end;
  if exists (select 1 from public.user_blocks where blocker_id = other and blocked_id = new.sender_id) then return new; end if;
  select coalesce(nullif(name, ''), 'Someone') into who from public.profiles where id = new.sender_id;
  perform public.notify(other, 'message', 'Message from ' || who, left(new.body, 200), 'inbox');
  return new;
end $$;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages for each row execute function public.trg_message_notify();

-- ---- Mechanic reviews (one per accepted quote, by the driver) and verified badges
alter table public.listings add column if not exists verified boolean not null default false;
create or replace function public.protect_listing_verified() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'authenticated' and not public.is_admin() then
    new.verified := case when tg_op = 'INSERT' then false else old.verified end;
  end if;
  return new;
end $$;
drop trigger if exists listings_protect_verified on public.listings;
create trigger listings_protect_verified before insert or update on public.listings for each row execute function public.protect_listing_verified();

create table if not exists public.mechanic_reviews (
  offer_id uuid primary key references public.quote_offers(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists mechanic_reviews_provider_idx on public.mechanic_reviews (provider_id);
alter table public.mechanic_reviews enable row level security;
drop policy if exists "reviews: read" on public.mechanic_reviews;
create policy "reviews: read" on public.mechanic_reviews for select to authenticated using (true);
drop policy if exists "reviews: write after accepted quote" on public.mechanic_reviews;
create policy "reviews: write after accepted quote" on public.mechanic_reviews for insert to authenticated
  with check (reviewer_id = (select auth.uid()) and exists (
    select 1 from public.quote_offers o join public.quote_requests r on r.id = o.request_id
    where o.id = offer_id and o.status = 'accepted' and o.provider_id = mechanic_reviews.provider_id and r.owner_id = (select auth.uid())));
drop policy if exists "reviews: edit own" on public.mechanic_reviews;
create policy "reviews: edit own" on public.mechanic_reviews for update to authenticated using (reviewer_id = (select auth.uid())) with check (reviewer_id = (select auth.uid()));

create or replace function public.trg_review_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.provider_id, 'review', 'New review: ' || repeat('★', new.rating), left(new.comment, 200), 'quotes');
  return new;
end $$;
drop trigger if exists mechanic_reviews_notify on public.mechanic_reviews;
create trigger mechanic_reviews_notify after insert on public.mechanic_reviews for each row execute function public.trg_review_notify();

-- Rating summary per mechanic (no reviewer names).
create or replace function public.mechanic_rating(p_provider uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('count', count(*), 'avg', round(avg(rating)::numeric, 1)) from public.mechanic_reviews where provider_id = p_provider;
$$;
revoke execute on function public.mechanic_rating(uuid) from public, anon;
grant execute on function public.mechanic_rating(uuid) to authenticated;

-- ---- Booking a time with the mechanic, after a quote is accepted
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.quote_offers(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'cancelled', 'done')),
  created_at timestamptz not null default now()
);
alter table public.bookings enable row level security;
drop policy if exists "bookings: both sides read" on public.bookings;
create policy "bookings: both sides read" on public.bookings for select to authenticated using ((select auth.uid()) in (driver_id, provider_id));
drop policy if exists "bookings: driver requests" on public.bookings;
create policy "bookings: driver requests" on public.bookings for insert to authenticated
  with check (driver_id = (select auth.uid()) and status = 'requested' and starts_at > now() and exists (
    select 1 from public.quote_offers o join public.quote_requests r on r.id = o.request_id
    where o.id = offer_id and o.status = 'accepted' and o.provider_id = bookings.provider_id and r.owner_id = (select auth.uid())));
drop policy if exists "bookings: both sides update" on public.bookings;
create policy "bookings: both sides update" on public.bookings for update to authenticated
  using ((select auth.uid()) in (driver_id, provider_id)) with check ((select auth.uid()) in (driver_id, provider_id));
-- Only the status, time and note can change, and only the mechanic can confirm.
create or replace function public.trg_booking_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    if new.offer_id <> old.offer_id or new.driver_id <> old.driver_id or new.provider_id <> old.provider_id then raise exception 'Can''t change that.'; end if;
    if new.status = 'confirmed' and old.status <> 'confirmed' and me is not null and me <> old.provider_id then raise exception 'Only the mechanic can confirm.'; end if;
    if new.starts_at <> old.starts_at then new.status := 'requested'; end if;
    perform public.notify(case when me = old.provider_id then old.driver_id else old.provider_id end, 'booking',
      case new.status when 'confirmed' then 'Booking confirmed' when 'cancelled' then 'Booking cancelled' when 'done' then 'Job marked done' else 'Booking time changed' end,
      to_char(new.starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI') || ' UTC', 'quotes');
  else
    perform public.notify(new.provider_id, 'booking', 'New booking request', to_char(new.starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI') || ' UTC' || case when new.note <> '' then ' — ' || left(new.note, 100) else '' end, 'quotes');
  end if;
  return new;
end $$;
drop trigger if exists bookings_guard on public.bookings;
create trigger bookings_guard before insert or update on public.bookings for each row execute function public.trg_booking_guard();

-- ---- Paying a mechanic through Motiq. The driver pays by Paystack; the money is held until
-- the driver marks the job done; then the admin pays the mechanic (price minus commission).
create table if not exists public.job_payments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.quote_offers(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  reference text not null unique,
  amount numeric(14, 2) not null check (amount > 0),
  commission numeric(14, 2) not null default 0,
  currency text not null,
  status text not null default 'pending' check (status in ('pending', 'held', 'released', 'paid_out', 'refunded', 'failed')),
  paid_at timestamptz, released_at timestamptz, paid_out_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists job_payments_offer_idx on public.job_payments (offer_id);
alter table public.job_payments enable row level security;
drop policy if exists "job payments: both sides read" on public.job_payments;
create policy "job payments: both sides read" on public.job_payments for select to authenticated using ((select auth.uid()) in (driver_id, provider_id) or public.is_admin());
-- ---- Private profile fields. Profiles are readable by every signed-in user (names in the
-- market and chats), so SOS contacts and payout details live here, readable only by their owner
-- (and payout details by the admin, to send mechanics their money).
create table if not exists public.profile_private (
  id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  sos_contacts jsonb not null default '[]'::jsonb check (jsonb_typeof(sos_contacts) = 'array' and jsonb_array_length(sos_contacts) <= 5 and pg_column_size(sos_contacts) < 4000),
  payout_details text not null default '' check (char_length(payout_details) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.profile_private enable row level security;
drop policy if exists "private: own" on public.profile_private;
create policy "private: own" on public.profile_private for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists "private: admin reads" on public.profile_private;
create policy "private: admin reads" on public.profile_private for select to authenticated using (public.is_admin());
-- Move SOS contacts saved by 1.4 out of the public profile.
insert into public.profile_private (id, sos_contacts)
  select id, sos_contacts from public.profiles where sos_contacts is not null and sos_contacts <> '[]'::jsonb
  on conflict (id) do update set sos_contacts = excluded.sos_contacts;
update public.profiles set sos_contacts = '[]'::jsonb where sos_contacts <> '[]'::jsonb;
-- Nothing new can be written to the old public column.
alter table public.profiles drop constraint if exists profiles_sos_contacts_empty;
alter table public.profiles add constraint profiles_sos_contacts_empty check (sos_contacts = '[]'::jsonb);

-- The driver says the job is done: the money is released to be paid out.
create or replace function public.release_job_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.job_payments;
begin
  select * into p from public.job_payments where id = p_payment for update;
  if p.id is null or p.driver_id <> auth.uid() then raise exception 'Not found'; end if;
  if p.status <> 'held' then raise exception 'This payment isn''t waiting to be released.'; end if;
  update public.job_payments set status = 'released', released_at = now() where id = p.id;
  update public.bookings set status = 'done' where offer_id = p.offer_id and status <> 'cancelled';
  perform public.notify(p.provider_id, 'payment', 'Payment released', 'The driver marked the job done. Motiq will send ' || p.currency || ' ' || to_char(p.amount - p.commission, 'FM999,999,999.00') || ' to you.', 'quotes');
end $$;
revoke execute on function public.release_job_payment(uuid) from public, anon;
grant execute on function public.release_job_payment(uuid) to authenticated;

-- Admin: mark a released payment as sent to the mechanic, or a held one as refunded.
create or replace function public.admin_set_job_payment(p_payment uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.job_payments;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into p from public.job_payments where id = p_payment for update;
  if p_status = 'paid_out' and p.status = 'released' then
    update public.job_payments set status = 'paid_out', paid_out_at = now() where id = p.id;
    perform public.notify(p.provider_id, 'payment', 'Money sent', p.currency || ' ' || to_char(p.amount - p.commission, 'FM999,999,999.00') || ' is on its way to you.', 'quotes');
  elsif p_status = 'refunded' and p.status in ('held', 'released') then
    update public.job_payments set status = 'refunded' where id = p.id;
    perform public.notify(p.driver_id, 'payment', 'Payment refunded', p.currency || ' ' || to_char(p.amount, 'FM999,999,999.00') || ' is being refunded to you.', 'quotes');
  else raise exception 'Can''t change this payment from % to %.', p.status, p_status; end if;
end $$;
revoke execute on function public.admin_set_job_payment(uuid, text) from public, anon;
grant execute on function public.admin_set_job_payment(uuid, text) to authenticated;

-- ---- Fleet plan: a business owner sees every car they own, who drove it and what it cost.
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free', 'pro', 'fleet'));
alter table public.payments add column if not exists plan text not null default 'pro' check (plan in ('pro', 'fleet'));
create or replace function public.is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select plan in ('pro', 'fleet') and (pro_until is null or pro_until > now()) from public.profiles where id = uid), false);
$$;
-- Car owners can see trips their drivers made in their cars.
drop policy if exists "trips: car owner reads" on public.trips;
create policy "trips: car owner reads" on public.trips for select to authenticated using (vehicle_id is not null and public.owns_vehicle(vehicle_id));
-- Fleet limit: 2 cars free, 10 on Pro, 50 on Fleet.
create or replace function public.vehicle_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare p public.profiles; n int; cap int;
begin
  select * into p from public.profiles where id = new.owner_id;
  cap := case when p.plan = 'fleet' and (p.pro_until is null or p.pro_until > now()) then 50 when p.plan = 'pro' and (p.pro_until is null or p.pro_until > now()) then 10 else 2 end;
  select count(*) into n from public.vehicles where owner_id = new.owner_id;
  if n >= cap then
    raise exception '%', case when cap = 2 then 'The free plan has room for 2 cars. Upgrade to Motiq Pro for more.' when cap = 10 then 'Motiq Pro has room for 10 cars. The Fleet plan has room for 50.' else 'You''ve reached 50 cars. Contact us for a bigger fleet.' end;
  end if;
  return new;
end $$;

-- ---- Usage stats for the admin page
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  event text not null check (event ~ '^[a-z0-9_.:-]{2,40}$'),
  created_at timestamptz not null default now()
);
create index if not exists usage_events_time_idx on public.usage_events (created_at desc);
alter table public.usage_events enable row level security;
drop policy if exists "usage: add own" on public.usage_events;
create policy "usage: add own" on public.usage_events for insert to authenticated with check (user_id = (select auth.uid()));

create or replace function public.admin_usage(p_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'events', (select coalesce(jsonb_agg(x order by x.users desc), '[]'::jsonb) from (
      select event, count(*) as uses, count(distinct user_id) as users from public.usage_events
      where created_at > now() - make_interval(days => p_days) group by event order by count(distinct user_id) desc limit 40) x),
    'active', (select count(distinct user_id) from public.usage_events where created_at > now() - make_interval(days => p_days)),
    'daily', (select coalesce(jsonb_agg(x order by x.day), '[]'::jsonb) from (
      select date_trunc('day', created_at)::date as day, count(distinct user_id) as users from public.usage_events
      where created_at > now() - make_interval(days => p_days) group by 1) x),
    'funnel', jsonb_build_object(
      'signed_up', (select count(*) from public.profiles where created_at > now() - make_interval(days => p_days)),
      'added_car', (select count(distinct v.owner_id) from public.vehicles v join public.profiles p on p.id = v.owner_id where p.created_at > now() - make_interval(days => p_days)),
      'asked_ai', (select count(distinct a.owner_id) from public.ai_messages a join public.profiles p on p.id = a.owner_id where a.role = 'user' and p.created_at > now() - make_interval(days => p_days)),
      'came_back', (select count(distinct e.user_id) from public.usage_events e join public.profiles p on p.id = e.user_id where p.created_at > now() - make_interval(days => p_days) and e.created_at > p.created_at + interval '1 day')));
end $$;
revoke execute on function public.admin_usage(int) from public, anon;
grant execute on function public.admin_usage(int) to authenticated;

-- Admin lists: payments to send and listings to verify.
drop policy if exists "listings: admin verify" on public.listings;
create policy "listings: admin verify" on public.listings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- The server functions (Paystack webhook) create notifications too.
do $$ begin execute 'grant execute on function public.notify(uuid, text, text, text, text) to service_role'; exception when undefined_object then null; end $$;

-- Push setup: the push function's address and a random shared secret, kept only in the database.
insert into public.app_secrets (key, value) values ('push_url', 'https://qsnooitnvlziladyywho.supabase.co/functions/v1/motiq-push') on conflict (key) do nothing;
insert into public.app_secrets (key, value) values ('push_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) on conflict (key) do nothing;

-- ---- Selling a car: only a car that has been in Motiq for at least 30 days, owned by the
-- seller, can be listed — so every car for sale comes with at least a month of real history.
-- Listings made before this rule stay as they are.
alter table public.listings add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
alter table public.listings add column if not exists car_since timestamptz;
alter table public.listings add column if not exists car_services int;
create or replace function public.trg_car_listing_rule() returns trigger language plpgsql security definer set search_path = public as $$
declare v public.vehicles;
begin
  if new.kind <> 'car' then new.car_since := null; new.car_services := null; return new; end if;
  if tg_op = 'UPDATE' and old.kind = 'car' and new.vehicle_id is not distinct from old.vehicle_id then
    new.car_since := old.car_since; new.car_services := old.car_services; return new; -- these come from Motiq, not the seller
  end if;
  if new.vehicle_id is null then raise exception 'Pick the car from your garage to sell it.'; end if;
  select * into v from public.vehicles where id = new.vehicle_id;
  if v.id is null or v.owner_id <> new.seller_id then raise exception 'You can only sell a car that''s in your own garage.'; end if;
  if v.created_at > now() - interval '30 days' then
    raise exception 'Cars can be sold on Motiq after 30 days of history. % can be listed from %.', coalesce(nullif(v.nickname, ''), v.make || ' ' || v.model), to_char(v.created_at + interval '30 days', 'DD Mon YYYY');
  end if;
  new.car_since := v.created_at;
  new.car_services := (select count(*) from public.service_records where vehicle_id = v.id);
  return new;
end $$;
drop trigger if exists listings_car_rule on public.listings;
create trigger listings_car_rule before insert or update on public.listings for each row execute function public.trg_car_listing_rule();
