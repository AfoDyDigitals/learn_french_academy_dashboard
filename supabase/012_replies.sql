-- Replies: a message can quote an earlier message from the same conversation
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;

-- Ignore a reply_to that points into a different conversation
create or replace function public.check_reply() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from public.messages where id = new.reply_to and thread_user = new.thread_user) then
    new.reply_to := null;
  end if;
  return new;
end $$;
drop trigger if exists check_reply on public.messages;
create trigger check_reply before insert on public.messages for each row execute function public.check_reply();
