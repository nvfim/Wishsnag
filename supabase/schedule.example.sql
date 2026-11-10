-- Example: run WishSnag server-side price monitoring every 3 hours with pg_cron + pg_net.
-- Run this manually in the Supabase SQL editor AFTER deploying the monitor-prices function
-- and storing two secrets in Supabase Vault:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'wishsnag_project_url');
--   select vault.create_secret('<the same random value as the CRON_SECRET function secret>', 'wishsnag_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'wishsnag-monitor-prices',
  '7 */3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'wishsnag_project_url') || '/functions/v1/monitor-prices',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'wishsnag_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
