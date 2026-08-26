-- =========================================================================
-- storage.sql
-- Buckets e policies de storage.
-- Estado ATUAL do banco para esta entidade.
-- =========================================================================

-- -------------------------------------------------------------------------
-- avatars — a foto de perfil.
--
-- LEITURA pública: a foto aparece no menu do usuário em toda tela, e um bucket
-- privado exigiria assinar uma URL temporária a cada montagem. A pasta é o
-- `auth_uuid` justamente por isso: uuid não se adivinha, enquanto uma pasta
-- numerada (1/, 2/, 3/…) se percorreria em minutos.
--
-- ESCRITA presa à própria pasta, pela policy abaixo.
--
-- Limite de tamanho e lista de mimes ficam no BUCKET, não só no front: validação
-- de cliente é conveniência, não segurança.
-- -------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- `for all` cobre insert/select/update/delete — inclusive o delete, que é o que
-- o botão "Remover foto" usa.
drop policy if exists avatar_own_folder on storage.objects;
create policy avatar_own_folder on storage.objects
  for all to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
