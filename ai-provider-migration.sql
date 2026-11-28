-- Apply in the Supabase SQL Editor for the same project used by SynthForge.
-- Existing OpenAI keys stay in place. Deploy new code with server credentials
-- in the same release window. Older server code needs the old table grants.
begin;

create table if not exists public.user_ai_provider_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  anthropic_key text,
  content_provider text not null default 'automatic' check (content_provider in ('automatic', 'openai', 'anthropic')),
  claude_model text not null default 'claude-sonnet-5-5'
    check (claude_model in ('claude-sonnet-5-5', 'claude-haiku-5-5'))
);

create table if not exists public.ai_generation_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  lease_id uuid not null,
  expires_at timestamptz not null,
  result jsonb,
  primary key (user_id, fingerprint)
);
create index if not exists ai_generation_requests_expires_at_idx
  on public.ai_generation_requests (expires_at);

alter table public.user_ai_keys enable row level security;
alter table public.user_ai_provider_settings enable row level security;
alter table public.ai_generation_requests enable row level security;

revoke all on table public.user_ai_keys, public.user_ai_provider_settings, public.ai_generation_requests
  from public, anon, authenticated;
-- Also close any explicit column-level grants for the existing credential.
revoke select (openai_key), insert (openai_key), update (openai_key)
  on table public.user_ai_keys from public, anon, authenticated;
grant select, insert, update, delete
  on table public.user_ai_keys, public.user_ai_provider_settings, public.ai_generation_requests
  to service_role;

-- Use a POST body for the previous manuscript so long chapters can be compared safely.
create or replace function public.save_generated_chapter(chapter_id uuid, book_id uuid, old_content text, new_content text)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with saved as (
    update public.chapters
    set content = new_content
    where id = chapter_id and product_id = book_id
      and user_id = (select auth.uid()) and content = old_content
    returning id
  )
  select exists (select 1 from saved);
$$;
revoke execute on function public.save_generated_chapter(uuid, uuid, text, text) from public, anon;
grant execute on function public.save_generated_chapter(uuid, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
