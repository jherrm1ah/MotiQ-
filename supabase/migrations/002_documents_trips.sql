-- Motiq: documents & warranty for each car, and trip history. Both are private to their owner.

-- Stops if pasted into the Pleen project by mistake.
do $$ begin if to_regclass('public.plans') is not null or to_regclass('public.crews') is not null then raise exception 'STOP: this is the Pleen project. Open the MotiQ project and paste this there.'; end if; end $$;

create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  kind text not null default 'other' check (kind in ('warranty', 'registration', 'insurance', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  expires_on date,
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists vehicle_documents_owner_idx on public.vehicle_documents (owner_id, expires_on);
alter table public.vehicle_documents enable row level security;
drop policy if exists "documents: own" on public.vehicle_documents;
create policy "documents: own" on public.vehicle_documents for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  origin text not null default '' check (char_length(origin) <= 120),
  destination text not null default '' check (char_length(destination) <= 120),
  distance_km numeric(9, 2) not null default 0 check (distance_km between 0 and 20000),
  duration_sec int not null default 0 check (duration_sec between 0 and 604800),
  alerts int not null default 0 check (alerts between 0 and 1000),
  real_route boolean not null default false,
  completed boolean not null default false,
  ended_at timestamptz not null default now()
);
create index if not exists trips_owner_idx on public.trips (owner_id, ended_at desc);
alter table public.trips enable row level security;
drop policy if exists "trips: own" on public.trips;
create policy "trips: own" on public.trips for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (vehicle_id is null or exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid()))));
