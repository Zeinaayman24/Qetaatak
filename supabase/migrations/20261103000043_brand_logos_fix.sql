-- Brand logos: allow JPG and up to 2 MB, and let admins read their own uploads (the storage API needs it).
update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['image/png','image/webp','image/svg+xml','image/jpeg'] where id = 'brand-logos';
create policy brand_logos_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'brand-logos' and (select private.is_admin()));
