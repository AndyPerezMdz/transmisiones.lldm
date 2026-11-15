-- =====================================================================
-- Manual de usuario: un PDF en el bucket "manual" que cualquier usuario con sesión puede abrir.
-- El archivo se sube desde el panel de Supabase (Storage → manual) con el nombre manual-cabina-en-vivo.pdf.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('manual', 'manual', false, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists "Manual: leer (con sesión)" on storage.objects;
create policy "Manual: leer (con sesión)" on storage.objects
  for select to authenticated using (bucket_id = 'manual');
