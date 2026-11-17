-- Instant messages. Each conversation is between one student or tutor (thread_user) and the academy team (all admins).
-- Students and tutors can only ever write in their own thread, so students can't message tutors.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_user uuid not null references public.profiles(id) on delete cascade,
  sender uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz  -- set when the other side opens the thread
);
create index messages_thread on public.messages (thread_user, created_at);
alter table public.messages enable row level security;

create policy "read own thread" on public.messages for select
  using (public.is_admin() or (thread_user = auth.uid() and public.is_active()));
create policy "write own thread" on public.messages for insert
  with check (sender = auth.uid() and (public.is_admin() or (thread_user = auth.uid() and public.is_active())));

-- Mark the other side's messages in a thread as read
create function public.mark_read(p_thread uuid) returns void
language sql security definer set search_path = '' as $$
  update public.messages set read_at = now()
  where thread_user = p_thread and read_at is null
    and (case when public.is_admin() then sender = p_thread else p_thread = auth.uid() and sender <> auth.uid() end);
$$;

-- Push notification to the other side
create function public.on_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  select full_name into who from public.profiles where id = new.sender;
  if new.sender = new.thread_user then
    perform public.notify_admins('Message from ' || coalesce(who, 'a user'), left(new.body, 120), '/messages?u=' || new.thread_user);
  else
    perform public.notify_user(new.thread_user, 'New message from the academy', left(new.body, 120), '/messages');
  end if;
  return new;
end $$;
create trigger notify_message after insert on public.messages for each row execute function public.on_message();

-- Live updates in the app
alter publication supabase_realtime add table public.messages;

-- Admin inbox: one row per conversation, newest first
create function public.message_threads() returns table (thread_user uuid, full_name text, role text, last_body text, last_at timestamptz, unread int)
language sql stable security definer set search_path = '' as $$
  select m.thread_user, p.full_name, p.role::text,
    (array_agg(m.body order by m.created_at desc))[1], max(m.created_at),
    count(*) filter (where m.sender = m.thread_user and m.read_at is null)::int
  from public.messages m join public.profiles p on p.id = m.thread_user
  where public.is_admin()
  group by m.thread_user, p.full_name, p.role
  order by max(m.created_at) desc;
$$;
