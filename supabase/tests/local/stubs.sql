-- Stand-ins for the Supabase platform pieces, so CREW's migrations run on plain Postgres.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated, service_role;
create schema auth; create schema extensions; create schema cron; create schema net;
grant usage on schema auth, extensions to anon, authenticated, service_role;
create table auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text, encrypted_password text,
  created_at timestamptz, updated_at timestamptz, raw_user_meta_data jsonb, raw_app_meta_data jsonb, last_sign_in_at timestamptz, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claims', true)::json->>'role' $$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create table cron.job_run_details (jobid bigint, start_time timestamptz, end_time timestamptz, status text, return_message text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (n, s, c) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n returning true $$;
create table net._http_response (id bigserial, status_code int, content text, error_msg text, created timestamptz default now());
create table net.calls (id bigserial, url text, body jsonb, at timestamptz default now());
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
  language sql as $$ insert into net.calls (url, body) values (url, body) returning id $$;
grant usage on schema net to postgres;
create publication supabase_realtime;
-- Supabase's default: app roles get table/sequence/function access; RLS policies decide which ROWS.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
