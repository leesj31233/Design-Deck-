-- PAPERFLOW cloud library: accounts, per-user papers/notes/translations, private PDF storage,
-- a 200 MB beta quota per user, and a shared translation cache keyed by source-text hash.
-- Every user table is protected by row level security: a user only ever sees their own rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  -- Beta quota: 200 MB of PDFs per user; null means unlimited.
  storage_quota_bytes bigint default 209715200,
  -- cloud: PDFs in the private bucket. local: PDFs stay on the device, only notes/metadata sync.
  storage_mode text not null default 'cloud' check (storage_mode in ('cloud', 'local')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Content hash of the PDF (SHA-256): the same id on every device.
  id text not null,
  filename text not null,
  title text not null,
  byte_length bigint not null check (byte_length > 0),
  page_count integer not null,
  storage_path text,
  -- Bibliographic and reading state (authors, journal, year, doi, keywords, jif, visited pages, opens…).
  metadata jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.annotations (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  document_id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists annotations_document on public.annotations (user_id, document_id);

create table if not exists public.translations (
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id text not null,
  unit_id text not null,
  prompt_version text not null,
  page_index integer not null default 0,
  text text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, document_id, unit_id)
);

-- Shared cache: the same source paragraph translated once for everyone. Keyed by
-- sha256(prompt_version || source text); written only by the server after the model answered.
create table if not exists public.shared_translations (
  source_hash text primary key,
  prompt_version text not null,
  text text not null,
  hits integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.annotations enable row level security;
alter table public.translations enable row level security;
alter table public.shared_translations enable row level security;

create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own documents" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own annotations" on public.annotations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own translations" on public.translations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- shared_translations: no policy on purpose. Only the server (service role) reads and writes it.

-- A profile row for every new account (name and picture from the Google account).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Storage used by one user: the sum of their uploaded PDFs.
create or replace function public.storage_used_bytes(uid uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(byte_length), 0)::bigint from public.documents where user_id = uid and storage_path is not null;
$$;

-- Private bucket for PDFs: <user id>/<document id>.pdf. 50 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('papers', 'papers', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

-- Users read and delete only files in their own folder. Uploads go through signed upload URLs
-- that the server issues after checking the quota, so there is no insert policy for users.
create policy "read own papers" on storage.objects for select using (bucket_id = 'papers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own papers" on storage.objects for delete using (bucket_id = 'papers' and (storage.foldername(name))[1] = auth.uid()::text);
