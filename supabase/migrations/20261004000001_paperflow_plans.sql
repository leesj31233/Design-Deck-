-- PAPERFLOW plans: every new account is a Tester; the administrator moves accounts to Basic / Pro
-- (or Admin) by hand from the admin page. Translation credits are counted per account per month.

alter table public.profiles add column if not exists plan text not null default 'tester';
do $$ begin
  alter table public.profiles add constraint profiles_plan_check check (plan in ('tester', 'basic', 'pro', 'admin'));
exception when duplicate_object then null; end $$;

-- A user could previously update their own profile row (and so their quota). Plans make that a
-- privilege: users may only read their profile; the server (service role) writes it.
drop policy if exists "own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);

-- Credits used per account and month ("YYYY-MM", Korean time). 1 credit = 1 translated paragraph.
create table if not exists public.credit_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.credit_usage enable row level security;
create policy "read own credit usage" on public.credit_usage for select using (auth.uid() = user_id);

-- Atomic add: returns the new total for the month. Server only.
create or replace function public.consume_credits(uid uuid, period text, amount integer)
returns integer language plpgsql security definer set search_path = public as $$
declare total integer;
begin
  insert into public.credit_usage (user_id, month, used) values (uid, period, greatest(amount, 0))
  on conflict (user_id, month) do update set used = public.credit_usage.used + greatest(amount, 0), updated_at = now()
  returning used into total;
  return total;
end;
$$;
revoke execute on function public.consume_credits(uuid, text, integer) from public, anon, authenticated;
