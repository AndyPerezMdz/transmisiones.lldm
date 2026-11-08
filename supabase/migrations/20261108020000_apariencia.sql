-- Paleta de colores de la app, por equipo (la cambian los administradores).
alter table public.teams
  add column if not exists theme jsonb not null default '{}'::jsonb
  check (jsonb_typeof(theme) = 'object');
