-- New messages also send a short email (the send-push function handles delivery)
alter table public.notify_queue add column if not exists email boolean not null default false;

create or replace function public.on_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  select full_name into who from public.profiles where id = new.sender;
  insert into public.notify_queue (user_id, title, body, url, email)
  select p.id,
    case when new.sender = new.thread_user then 'Message from ' || coalesce(who, 'a user') else 'New message from Learn French Academy' end,
    left(new.body, 120),
    case when new.sender = new.thread_user then '/messages?u=' || new.thread_user else '/messages' end,
    true
  from public.profiles p
  where p.active and p.id <> new.sender
    and (case when new.sender = new.thread_user then p.role = 'admin' else p.id = new.thread_user end);
  return new;
end $$;
