-- Diseño propio por sala: letrero de la transmisión y fondo de las pantallas.

alter table public.rooms
  add column if not exists design jsonb not null default '{}'::jsonb
  check (jsonb_typeof(design) = 'object');

-- Imágenes del diseño (banner, fondo, logo). Lectura pública porque OBS y las
-- TVs las cargan sin sesión; cada usuario solo escribe en su propia carpeta.
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
