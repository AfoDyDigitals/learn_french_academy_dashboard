-- Message attachments: images, files and voice notes in a private storage bucket.
-- Files live at attachments/<thread_user>/<random>-<name>, so the same rule as messages applies:
-- admins see every conversation; a student or tutor only their own.
alter table public.messages
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_type text,
  add column if not exists file_size int;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages alter column body set default '';
alter table public.messages add constraint messages_body_check
  check (length(body) <= 4000 and (length(trim(body)) > 0 or file_path is not null));
-- A message may only point at a file inside its own conversation folder
alter table public.messages add constraint messages_file_in_thread
  check (file_path is null or split_part(file_path, '/', 1) = thread_user::text);

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 15728640) -- 15 MB per file
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy "attachments read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (public.is_admin()
    or ((storage.foldername(name))[1] = auth.uid()::text and public.is_active())));
create policy "attachments upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (public.is_admin()
    or ((storage.foldername(name))[1] = auth.uid()::text and public.is_active())));

-- Notification text for messages that are only an attachment
create or replace function public.on_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare who text; preview text;
begin
  select full_name into who from public.profiles where id = new.sender;
  preview := coalesce(nullif(left(trim(new.body), 120), ''),
    case when new.file_type like 'image/%' then '📷 Sent a photo'
         when new.file_type like 'audio/%' then '🎤 Sent a voice note'
         else '📎 Sent a file: ' || coalesce(new.file_name, 'attachment') end);
  insert into public.notify_queue (user_id, title, body, url, email)
  select p.id,
    case when new.sender = new.thread_user then 'Message from ' || coalesce(who, 'a user') else 'New message from Learn French Academy' end,
    preview,
    case when new.sender = new.thread_user then '/messages?u=' || new.thread_user else '/messages' end,
    true
  from public.profiles p
  where p.active and p.id <> new.sender
    and (case when new.sender = new.thread_user then p.role = 'admin' else p.id = new.thread_user end);
  return new;
end $$;

-- Admin inbox preview for attachment-only messages
create or replace function public.message_threads() returns table (thread_user uuid, full_name text, role text, last_body text, last_at timestamptz, unread int)
language sql stable security definer set search_path = '' as $$
  select m.thread_user, p.full_name, p.role::text,
    (array_agg(coalesce(nullif(m.body, ''), case when m.file_type like 'image/%' then '📷 Photo' when m.file_type like 'audio/%' then '🎤 Voice note' else '📎 ' || m.file_name end) order by m.created_at desc))[1],
    max(m.created_at),
    count(*) filter (where m.sender = m.thread_user and m.read_at is null)::int
  from public.messages m join public.profiles p on p.id = m.thread_user
  where public.is_admin()
  group by m.thread_user, p.full_name, p.role
  order by max(m.created_at) desc;
$$;
