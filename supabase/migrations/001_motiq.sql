-- Motiq: cars, health tracking, OBD-II scans, the AI mechanic, the marketplace and its chats.
-- Every table has row level security: you only see your own cars, scans, service history and
-- AI chats; marketplace listings are public while active; a chat is visible to its two people.

-- Stops if pasted into the Pleen project by mistake.
do $$ begin if to_regclass('public.plans') is not null or to_regclass('public.crews') is not null then raise exception 'STOP: this is the Pleen project. Open the MotiQ project and paste this there.'; end if; end $$;

-- People -------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  country text not null default '' check (char_length(country) <= 2),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  distance_unit text not null default 'km' check (distance_unit in ('km', 'mi')),
  city text not null default '' check (char_length(city) <= 60),
  phone text not null default '' check (char_length(phone) <= 20),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles: own" on public.profiles;
create policy "profiles: own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(left(new.raw_user_meta_data->>'name', 60), ''))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Cars ---------------------------------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  make text not null check (char_length(btrim(make)) between 1 and 40),
  model text not null check (char_length(btrim(model)) between 1 and 60),
  year int check (year is null or year between 1950 and 2100),
  trim_level text not null default '' check (char_length(trim_level) <= 60),
  nickname text not null default '' check (char_length(nickname) <= 40),
  vin text not null default '' check (char_length(vin) <= 17),
  plate text not null default '' check (char_length(plate) <= 15),
  fuel text not null default 'petrol' check (fuel in ('petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other')),
  transmission text not null default 'automatic' check (transmission in ('automatic', 'manual', 'cvt', 'other')),
  odometer int not null default 0 check (odometer between 0 and 5000000),
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists vehicles_owner_idx on public.vehicles (owner_id);
alter table public.vehicles enable row level security;
drop policy if exists "vehicles: own" on public.vehicles;
create policy "vehicles: own" on public.vehicles for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Service history and reminders ------------------------------------------------------------------
create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'other' check (kind in ('oil', 'tyres', 'brakes', 'battery', 'filters', 'fluids', 'inspection', 'repair', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  done_on date not null default current_date,
  odometer int check (odometer is null or odometer between 0 and 5000000),
  cost numeric(12, 2) check (cost is null or cost >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  shop text not null default '' check (char_length(shop) <= 80),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists service_vehicle_idx on public.service_records (vehicle_id, done_on desc);
alter table public.service_records enable row level security;
drop policy if exists "service: own" on public.service_records;
create policy "service: own" on public.service_records for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'other' check (kind in ('oil', 'tyres', 'brakes', 'battery', 'filters', 'fluids', 'inspection', 'insurance', 'licence', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  due_on date,
  due_odometer int check (due_odometer is null or due_odometer between 0 and 5000000),
  every_months int check (every_months is null or every_months between 1 and 120),
  every_distance int check (every_distance is null or every_distance between 100 and 500000),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  check (due_on is not null or due_odometer is not null)
);
create index if not exists reminders_vehicle_idx on public.reminders (vehicle_id) where done_at is null;
alter table public.reminders enable row level security;
drop policy if exists "reminders: own" on public.reminders;
create policy "reminders: own" on public.reminders for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));

-- OBD-II scans -----------------------------------------------------------------------------------
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'obd' check (source in ('obd', 'demo', 'manual')),
  check_engine boolean not null default false,
  codes jsonb not null default '[]'::jsonb,    -- [{code, kind: stored|pending|permanent}]
  readings jsonb not null default '{}'::jsonb, -- {rpm, coolant_c, battery_v, load_pct, fuel_pct, speed_kmh}
  summary text not null default '' check (char_length(summary) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists scans_vehicle_idx on public.scans (vehicle_id, created_at desc);
alter table public.scans enable row level security;
drop policy if exists "scans: own" on public.scans;
create policy "scans: own" on public.scans for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));

-- The AI mechanic --------------------------------------------------------------------------------
-- Written only by the motiq-ai server function (service role); you can read and delete yours.
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  mode text not null default 'chat' check (mode in ('chat', 'voice', 'scan')),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  image_path text,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_owner_idx on public.ai_messages (owner_id, created_at desc);
alter table public.ai_messages enable row level security;
drop policy if exists "ai: read own" on public.ai_messages;
create policy "ai: read own" on public.ai_messages for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "ai: delete own" on public.ai_messages;
create policy "ai: delete own" on public.ai_messages for delete to authenticated using (owner_id = (select auth.uid()));

-- Marketplace ------------------------------------------------------------------------------------
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('part', 'service', 'car')),
  category text not null default 'other' check (char_length(category) <= 40),
  title text not null check (char_length(btrim(title)) between 3 and 90),
  description text not null default '' check (char_length(description) <= 3000),
  price numeric(14, 2) check (price is null or price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  condition text not null default 'used' check (condition in ('new', 'used', 'refurbished', 'na')),
  country text not null default '' check (char_length(country) <= 2),
  city text not null default '' check (char_length(city) <= 60),
  fits_make text not null default '' check (char_length(fits_make) <= 40),
  fits_model text not null default '' check (char_length(fits_model) <= 60),
  fits_year_from int check (fits_year_from is null or fits_year_from between 1950 and 2100),
  fits_year_to int check (fits_year_to is null or fits_year_to between 1950 and 2100),
  photos text[] not null default '{}' check (cardinality(photos) <= 8),
  status text not null default 'active' check (status in ('active', 'sold', 'hidden')),
  created_at timestamptz not null default now()
);
create index if not exists listings_browse_idx on public.listings (status, created_at desc);
create index if not exists listings_seller_idx on public.listings (seller_id);
alter table public.listings enable row level security;
drop policy if exists "listings: read" on public.listings;
create policy "listings: read" on public.listings for select to anon, authenticated using (status = 'active' or seller_id = (select auth.uid()));
drop policy if exists "listings: own" on public.listings;
create policy "listings: own" on public.listings for all to authenticated using (seller_id = (select auth.uid())) with check (seller_id = (select auth.uid()));

-- Spam limit: at most 20 new listings a day per person.
create or replace function public.listing_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from listings where seller_id = new.seller_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You can post up to 20 listings a day.';
  end if;
  return new;
end $$;
revoke execute on function public.listing_limit() from public, anon, authenticated;
drop trigger if exists listing_limit on public.listings;
create trigger listing_limit before insert on public.listings for each row execute function public.listing_limit();

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);
alter table public.conversations enable row level security;
drop policy if exists "conversations: mine" on public.conversations;
create policy "conversations: mine" on public.conversations for select to authenticated using ((select auth.uid()) in (buyer_id, seller_id));

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
alter table public.messages enable row level security;
drop policy if exists "messages: read" on public.messages;
create policy "messages: read" on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.buyer_id, c.seller_id)));
drop policy if exists "messages: send" on public.messages;
create policy "messages: send" on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.buyer_id, c.seller_id)));
drop policy if exists "messages: mark read" on public.messages;
create policy "messages: mark read" on public.messages for update to authenticated
  using (sender_id <> (select auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.buyer_id, c.seller_id)))
  with check (sender_id <> (select auth.uid()));

create or replace function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
revoke execute on function public.touch_conversation() from public, anon, authenticated;
drop trigger if exists touch_conversation on public.messages;
create trigger touch_conversation after insert on public.messages for each row execute function public.touch_conversation();

-- Start (or reopen) a chat with a seller about a listing. Returns the conversation id.
create or replace function public.contact_seller(p_listing uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l record; cid uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select id, seller_id, status into l from listings where id = p_listing;
  if l.id is null or l.status <> 'active' then raise exception 'This listing is no longer available'; end if;
  if l.seller_id = me then raise exception 'This is your own listing'; end if;
  insert into conversations (listing_id, buyer_id, seller_id) values (p_listing, me, l.seller_id)
    on conflict (listing_id, buyer_id) do update set listing_id = excluded.listing_id
    returning id into cid;
  return cid;
end $$;
revoke execute on function public.contact_seller(uuid) from public, anon;
grant execute on function public.contact_seller(uuid) to authenticated;

-- Live updates for chats.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.conversations; exception when duplicate_object then null; end;
  end if;
end $$;

-- Photos -----------------------------------------------------------------------------------------
-- car-photos and ai-photos are private (only the owner, first folder = their id); listing-photos are public.
insert into storage.buckets (id, name, public) values ('car-photos', 'car-photos', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('ai-photos', 'ai-photos', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('listing-photos', 'listing-photos', true) on conflict (id) do nothing;

drop policy if exists "own photos: read" on storage.objects;
create policy "own photos: read" on storage.objects for select to authenticated
  using (bucket_id in ('car-photos', 'ai-photos', 'listing-photos') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "own photos: write" on storage.objects;
create policy "own photos: write" on storage.objects for insert to authenticated
  with check (bucket_id in ('car-photos', 'ai-photos', 'listing-photos') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "own photos: delete" on storage.objects;
create policy "own photos: delete" on storage.objects for delete to authenticated
  using (bucket_id in ('car-photos', 'ai-photos', 'listing-photos') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "listing photos: read" on storage.objects;
create policy "listing photos: read" on storage.objects for select to anon, authenticated using (bucket_id = 'listing-photos');
