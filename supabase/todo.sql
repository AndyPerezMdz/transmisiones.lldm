-- =====================================================================
-- Cabina en Vivo: TODO el SQL en un solo archivo.
-- Pégalo completo en Supabase → SQL Editor → Run.
-- Se puede correr las veces que quieras: lo que ya existe se queda igual
-- y solo agrega lo que falta. (Es lo mismo que supabase/migrations/.)
-- =====================================================================

create extension if not exists pgcrypto;

create or replace function public.tocar_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Cantos ----------------------------------------------------
create table if not exists public.songs (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('hymn', 'coro')),
  number      integer check (number between 1 and 9999),
  title       text not null check (char_length(title) between 1 and 200),
  sections    jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint songs_owner_kind_number_key unique (owner, kind, number)
);
create index if not exists songs_owner_idx on public.songs (owner);
drop trigger if exists songs_updated_at on public.songs;
create trigger songs_updated_at before update on public.songs
  for each row execute function public.tocar_updated_at();

alter table public.songs enable row level security;
drop policy if exists "Cada quien ve sus cantos" on public.songs;
create policy "Cada quien ve sus cantos" on public.songs
  for select to authenticated using (owner = (select auth.uid()));
drop policy if exists "Cada quien agrega sus cantos" on public.songs;
create policy "Cada quien agrega sus cantos" on public.songs
  for insert to authenticated with check (owner = (select auth.uid()));
drop policy if exists "Cada quien edita sus cantos" on public.songs;
create policy "Cada quien edita sus cantos" on public.songs
  for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists "Cada quien borra sus cantos" on public.songs;
create policy "Cada quien borra sus cantos" on public.songs
  for delete to authenticated using (owner = (select auth.uid()));

-- ---------- Salas: lo que está al aire y el diseño de cada templo -------
-- Las pantallas y OBS leen la sala sin iniciar sesión (es lo mismo que se
-- ve en las TVs). Solo el dueño la puede cambiar.
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default 'Templo' check (char_length(name) between 1 and 80),
  state       jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.rooms
  add column if not exists design jsonb not null default '{}'::jsonb
  check (jsonb_typeof(design) = 'object');
create index if not exists rooms_owner_idx on public.rooms (owner);
drop trigger if exists rooms_updated_at on public.rooms;
create trigger rooms_updated_at before update on public.rooms
  for each row execute function public.tocar_updated_at();

alter table public.rooms enable row level security;
drop policy if exists "Las pantallas leen la sala" on public.rooms;
create policy "Las pantallas leen la sala" on public.rooms
  for select to anon, authenticated using (true);
drop policy if exists "El dueño crea salas" on public.rooms;
create policy "El dueño crea salas" on public.rooms
  for insert to authenticated with check (owner = (select auth.uid()));
drop policy if exists "El dueño controla su sala" on public.rooms;
create policy "El dueño controla su sala" on public.rooms
  for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists "El dueño borra su sala" on public.rooms;
create policy "El dueño borra su sala" on public.rooms
  for delete to authenticated using (owner = (select auth.uid()));

-- Cambios en tiempo real para TVs y OBS.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
end;
$$;

-- ---------- Imágenes del diseño (letrero, fondo, logo) -----------------
-- Lectura pública porque OBS y las TVs las cargan sin sesión;
-- cada usuario solo escribe en su propia carpeta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('disenos', 'disenos', true, 8388608, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Diseños: ver mis archivos" on storage.objects;
create policy "Diseños: ver mis archivos" on storage.objects
  for select to authenticated
  using (bucket_id = 'disenos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Diseños: subir a mi carpeta" on storage.objects;
create policy "Diseños: subir a mi carpeta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'disenos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Diseños: cambiar mis archivos" on storage.objects;
create policy "Diseños: cambiar mis archivos" on storage.objects
  for update to authenticated
  using (bucket_id = 'disenos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'disenos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Diseños: borrar mis archivos" on storage.objects;
create policy "Diseños: borrar mis archivos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'disenos' and (storage.foldername(name))[1] = (select auth.uid())::text);
