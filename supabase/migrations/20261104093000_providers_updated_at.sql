-- The admin page stamps updated_at when it saves models, prices or the on/off switch;
-- that column was missing from the update grant, so every save failed ("permission denied").
-- Row access is still admins only (policy "admin changes providers"); api_key stays unwritable from the app.
grant update (updated_at) on public.ai_providers to authenticated;
