-- Cabina en Vivo: cantos y salas en vivo.

create extension if not exists pgcrypto;

create or replace function public.tocar_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Cantos -------------------------------------------------------------------
create table public.songs (
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
create index songs_owner_idx on public.songs (owner);
create trigger songs_updated_at before update on public.songs
  for each row execute function public.tocar_updated_at();

alter table public.songs enable row level security;
create policy "Cada quien ve sus cantos" on public.songs
  for select to authenticated using (owner = (select auth.uid()));
create policy "Cada quien agrega sus cantos" on public.songs
  for insert to authenticated with check (owner = (select auth.uid()));
create policy "Cada quien edita sus cantos" on public.songs
  for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "Cada quien borra sus cantos" on public.songs
  for delete to authenticated using (owner = (select auth.uid()));

-- Salas: lo que está al aire en cada templo --------------------------------
-- El estado es lo mismo que se ve en las TVs, por eso las pantallas y OBS lo
-- pueden leer sin iniciar sesión. Solo el dueño lo puede cambiar.
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default 'Templo' check (char_length(name) between 1 and 80),
  state       jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index rooms_owner_idx on public.rooms (owner);
create trigger rooms_updated_at before update on public.rooms
  for each row execute function public.tocar_updated_at();

alter table public.rooms enable row level security;
create policy "Las pantallas leen la sala" on public.rooms
  for select to anon, authenticated using (true);
create policy "El dueño crea salas" on public.rooms
  for insert to authenticated with check (owner = (select auth.uid()));
create policy "El dueño controla su sala" on public.rooms
  for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "El dueño borra su sala" on public.rooms
  for delete to authenticated using (owner = (select auth.uid()));

-- Cambios en tiempo real para TVs y OBS.
alter publication supabase_realtime add table public.rooms;
