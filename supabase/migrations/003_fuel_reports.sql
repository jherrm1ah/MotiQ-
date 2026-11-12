-- Motiq: fuel log (fill-ups per car), and keeping the market safe (report a listing, block a person).

-- Stops if pasted into the Pleen project by mistake.
do $$ begin if to_regclass('public.plans') is not null or to_regclass('public.crews') is not null then raise exception 'STOP: this is the Pleen project. Open the MotiQ project and paste this there.'; end if; end $$;

-- Fill-ups: amount is in litres or gallons (the driver's unit), odometer in km or miles.
create table if not exists public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  filled_on date not null default current_date,
  odometer int not null check (odometer between 0 and 5000000),
  amount numeric(8, 2) not null check (amount > 0 and amount < 2000),
  cost numeric(12, 2) check (cost is null or cost >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  full_tank boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists fuel_logs_vehicle_idx on public.fuel_logs (vehicle_id, odometer desc);
alter table public.fuel_logs enable row level security;
drop policy if exists "fuel: own" on public.fuel_logs;
create policy "fuel: own" on public.fuel_logs for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));

-- Reports: anyone signed in can report a listing once; three different reports hide it for review.
create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('scam', 'fake', 'wrong_price', 'offensive', 'sold', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz not null default now(),
  unique (listing_id, reporter_id)
);
alter table public.listing_reports enable row level security;
drop policy if exists "reports: add" on public.listing_reports;
create policy "reports: add" on public.listing_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and not exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())));
drop policy if exists "reports: mine" on public.listing_reports;
create policy "reports: mine" on public.listing_reports for select to authenticated using (reporter_id = (select auth.uid()));

create or replace function public.hide_reported_listing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(distinct reporter_id) from public.listing_reports where listing_id = new.listing_id) >= 3 then
    update public.listings set status = 'hidden' where id = new.listing_id and status = 'active';
  end if;
  return new;
end $$;
revoke execute on function public.hide_reported_listing() from public, anon, authenticated;
drop trigger if exists listing_reports_hide on public.listing_reports;
create trigger listing_reports_hide after insert on public.listing_reports for each row execute function public.hide_reported_listing();

-- Blocks: you stop seeing someone's listings and messages.
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists "blocks: own" on public.user_blocks;
create policy "blocks: own" on public.user_blocks for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

-- A blocked person can't message you any more. (Checked with a helper, because the sender can't
-- see other people's block lists.)
create or replace function public.blocked_me(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_blocks where blocker_id = other and blocked_id = (select auth.uid()));
$$;
revoke execute on function public.blocked_me(uuid) from public, anon;
grant execute on function public.blocked_me(uuid) to authenticated;
drop policy if exists "messages: send" on public.messages;
create policy "messages: send" on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.buyer_id, c.seller_id)
      and not public.blocked_me(case when c.buyer_id = (select auth.uid()) then c.seller_id else c.buyer_id end))
  );
