-- Lexicon — an email to you for every new account.
--
-- Run once in the SQL editor, AFTER tools/signup-mailer.gs is deployed as a
-- Google Apps Script web app. Paste this file into the editor and replace the
-- two PASTE placeholders THERE, in the editor: never save the real URL or the
-- secret into this file, it is in git.
-- The trigger posts {secret, email, created, provider} to that URL through
-- pg_net (asynchronous, non-blocking); the script emails the account it was
-- deployed from. A failure here can never block a sign-up.

create extension if not exists pg_net with schema extensions;

-- Settings only the server can read: RLS on, no policies.
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value) values
  ('signup_webhook_url',    'PASTE-YOUR-APPS-SCRIPT-WEB-APP-URL-HERE'),
  ('signup_webhook_secret', 'PASTE-THE-SAME-LONG-RANDOM-SECRET-AS-IN-THE-SCRIPT')
on conflict (key) do update set value = excluded.value;

create or replace function public.notify_new_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  url text; secret text;
begin
  select value into url    from public.app_settings where key = 'signup_webhook_url';
  select value into secret from public.app_settings where key = 'signup_webhook_secret';
  if url is null or url like 'PASTE%' then return new; end if;
  perform net.http_post(
    url     := url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object(
      'secret',   secret,
      'email',    new.email,
      'created',  to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI'),
      'provider', coalesce(new.raw_app_meta_data ->> 'provider', 'email'))
  );
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists on_auth_user_created_notify on auth.users;
create trigger on_auth_user_created_notify after insert on auth.users
  for each row execute procedure public.notify_new_user();

-- To try it without creating a real account, run this once and check the
-- mailbox (nothing is stored; it only exercises the call):
--   select net.http_post(
--     url := (select value from public.app_settings where key = 'signup_webhook_url'),
--     headers := '{"Content-Type": "application/json"}'::jsonb,
--     body := jsonb_build_object('secret', (select value from public.app_settings where key = 'signup_webhook_secret'),
--                                'email', 'test-only', 'created', now()::text, 'provider', 'manual test'));
