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

-- =====================================================================
-- Equipos (compartir cantos, salas y diseños con la congregación)
-- =====================================================================
-- Equipos: cantos, salas y diseños se comparten con toda la congregación.
-- Los administradores invitan por correo; quien se registra sin invitación no ve nada.

-- ---------- Tablas ----------
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Mi congregación' check (char_length(name) between 1 and 80),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id   uuid not null references public.teams (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'miembro' check (role in ('admin', 'miembro')),
  email     text,
  name      text,
  added_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on public.team_members (user_id);

create table if not exists public.team_invites (
  team_id     uuid not null references public.teams (id) on delete cascade,
  email       text not null check (email = lower(email) and position('@' in email) > 1),
  role        text not null default 'miembro' check (role in ('admin', 'miembro')),
  invited_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (team_id, email)
);
create index if not exists team_invites_email_idx on public.team_invites (email);

alter table public.songs add column if not exists team_id uuid references public.teams (id) on delete cascade;
alter table public.rooms add column if not exists team_id uuid references public.teams (id) on delete cascade;
create index if not exists songs_team_idx on public.songs (team_id);
create index if not exists rooms_team_idx on public.rooms (team_id);

-- ---------- Funciones de permiso (no dependen de RLS para no ciclarse) ----------
create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members m where m.team_id = t and m.user_id = (select auth.uid()));
$$;
create or replace function public.is_admin(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members m where m.team_id = t and m.user_id = (select auth.uid()) and m.role = 'admin');
$$;
revoke all on function public.is_member(uuid), public.is_admin(uuid) from public;
grant execute on function public.is_member(uuid), public.is_admin(uuid) to authenticated, anon;

-- Quien crea un equipo queda como administrador.
create or replace function public.team_creator_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is not null then
    insert into public.team_members (team_id, user_id, role, email, name)
    select new.id, u.id, 'admin', u.email, coalesce(u.raw_user_meta_data ->> 'name', '')
    from auth.users u where u.id = new.created_by
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists teams_creator_admin on public.teams;
create trigger teams_creator_admin after insert on public.teams
  for each row execute function public.team_creator_admin();

-- Siempre debe quedar al menos un administrador.
create or replace function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (select 1 from public.teams t where t.id = old.team_id)
     and not exists (select 1 from public.team_members m
                     where m.team_id = old.team_id and m.role = 'admin' and m.user_id <> old.user_id) then
    raise exception 'El equipo necesita al menos un administrador.';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists team_members_keep_admin on public.team_members;
create trigger team_members_keep_admin before update or delete on public.team_members
  for each row execute function public.keep_one_admin();

-- Al entrar, se aceptan las invitaciones hechas a tu correo (solo si ya lo confirmaste).
create or replace function public.accept_invites() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  my_email text;
  my_name text;
  n integer;
begin
  select lower(u.email), coalesce(u.raw_user_meta_data ->> 'name', '') into my_email, my_name
  from auth.users u where u.id = me and u.email_confirmed_at is not null;
  if my_email is null then return 0; end if;
  insert into public.team_members (team_id, user_id, role, email, name)
  select i.team_id, me, i.role, my_email, my_name from public.team_invites i where i.email = my_email
  on conflict (team_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from public.team_invites where email = my_email;
  return n;
end;
$$;
revoke all on function public.accept_invites() from public;
grant execute on function public.accept_invites() to authenticated;

-- ---------- Pasar lo que ya existe a un equipo por persona ----------
do $$
declare u uuid; t uuid;
begin
  for u in (select owner from public.rooms where team_id is null union select owner from public.songs where team_id is null) loop
    select m.team_id into t from public.team_members m where m.user_id = u and m.role = 'admin' order by m.added_at limit 1;
    if t is null then
      insert into public.teams (name, created_by) values ('Mi congregación', u) returning id into t;
    end if;
    update public.rooms set team_id = t where owner = u and team_id is null;
    update public.songs set team_id = t where owner = u and team_id is null;
  end loop;
end;
$$;
alter table public.songs alter column team_id set not null;
alter table public.rooms alter column team_id set not null;

-- Los números de himno/coro ahora son únicos por equipo.
alter table public.songs drop constraint if exists songs_owner_kind_number_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'songs_team_kind_number_key') then
    alter table public.songs add constraint songs_team_kind_number_key unique (team_id, kind, number);
  end if;
end $$;

-- ---------- Reglas (RLS) ----------
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

drop policy if exists "Equipos: ver los míos" on public.teams;
create policy "Equipos: ver los míos" on public.teams for select to authenticated using (public.is_member(id) or created_by = (select auth.uid()));
drop policy if exists "Equipos: crear" on public.teams;
create policy "Equipos: crear" on public.teams for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists "Equipos: cambiar (admin)" on public.teams;
create policy "Equipos: cambiar (admin)" on public.teams for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));
drop policy if exists "Equipos: borrar (admin)" on public.teams;
create policy "Equipos: borrar (admin)" on public.teams for delete to authenticated using (public.is_admin(id));

drop policy if exists "Miembros: ver a mi equipo" on public.team_members;
create policy "Miembros: ver a mi equipo" on public.team_members for select to authenticated using (public.is_member(team_id));
drop policy if exists "Miembros: cambiar rol (admin)" on public.team_members;
create policy "Miembros: cambiar rol (admin)" on public.team_members for update to authenticated using (public.is_admin(team_id)) with check (public.is_admin(team_id));
drop policy if exists "Miembros: quitar (admin) o salirme" on public.team_members;
create policy "Miembros: quitar (admin) o salirme" on public.team_members for delete to authenticated
  using (public.is_admin(team_id) or user_id = (select auth.uid()));

drop policy if exists "Invitaciones: ver (admin)" on public.team_invites;
create policy "Invitaciones: ver (admin)" on public.team_invites for select to authenticated using (public.is_admin(team_id));
drop policy if exists "Invitaciones: crear (admin)" on public.team_invites;
create policy "Invitaciones: crear (admin)" on public.team_invites for insert to authenticated with check (public.is_admin(team_id));
drop policy if exists "Invitaciones: borrar (admin)" on public.team_invites;
create policy "Invitaciones: borrar (admin)" on public.team_invites for delete to authenticated using (public.is_admin(team_id));

-- Cantos: todo el equipo los ve y los edita.
drop policy if exists "Cada quien ve sus cantos" on public.songs;
drop policy if exists "Cada quien agrega sus cantos" on public.songs;
drop policy if exists "Cada quien edita sus cantos" on public.songs;
drop policy if exists "Cada quien borra sus cantos" on public.songs;
drop policy if exists "Cantos: ver (equipo)" on public.songs;
create policy "Cantos: ver (equipo)" on public.songs for select to authenticated using (public.is_member(team_id));
drop policy if exists "Cantos: agregar (equipo)" on public.songs;
create policy "Cantos: agregar (equipo)" on public.songs for insert to authenticated with check (public.is_member(team_id));
drop policy if exists "Cantos: editar (equipo)" on public.songs;
create policy "Cantos: editar (equipo)" on public.songs for update to authenticated using (public.is_member(team_id)) with check (public.is_member(team_id));
drop policy if exists "Cantos: borrar (equipo)" on public.songs;
create policy "Cantos: borrar (equipo)" on public.songs for delete to authenticated using (public.is_member(team_id));

-- Salas: las pantallas y OBS las leen sin sesión; el equipo las opera; solo admins crean o borran.
drop policy if exists "El dueño crea salas" on public.rooms;
drop policy if exists "El dueño controla su sala" on public.rooms;
drop policy if exists "El dueño borra su sala" on public.rooms;
drop policy if exists "Salas: crear (admin)" on public.rooms;
create policy "Salas: crear (admin)" on public.rooms for insert to authenticated with check (public.is_admin(team_id));
drop policy if exists "Salas: operar (equipo)" on public.rooms;
create policy "Salas: operar (equipo)" on public.rooms for update to authenticated using (public.is_member(team_id)) with check (public.is_member(team_id));
drop policy if exists "Salas: borrar (admin)" on public.rooms;
create policy "Salas: borrar (admin)" on public.rooms for delete to authenticated using (public.is_admin(team_id));

-- =====================================================================
-- Apariencia
-- =====================================================================
-- Paleta de colores de la app, por equipo (la cambian los administradores).
alter table public.teams
  add column if not exists theme jsonb not null default '{}'::jsonb
  check (jsonb_typeof(theme) = 'object');
