-- Push notifications: devices subscribe, events queue messages, an edge function delivers them
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own subscriptions" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.notify_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  url text default '/',
  created_at timestamptz default now(),
  sent_at timestamptz
);
alter table public.notify_queue enable row level security; -- no policies: only the server reads it

alter table public.classes add column reminded_at timestamptz;

-- Helpers
create function public.notify_user(p_user uuid, p_title text, p_body text, p_url text default '/') returns void
language sql security definer set search_path = '' as $$
  insert into public.notify_queue (user_id, title, body, url) select p_user, p_title, p_body, p_url where p_user is not null;
$$;
create function public.notify_admins(p_title text, p_body text, p_url text default '/') returns void
language sql security definer set search_path = '' as $$
  insert into public.notify_queue (user_id, title, body, url) select id, p_title, p_body, p_url from public.profiles where role = 'admin';
$$;
revoke execute on function public.notify_user, public.notify_admins from public, anon, authenticated;

-- Event: report submitted -> admins
create function public.on_report() returns trigger language plpgsql security definer set search_path = '' as $$
declare c record; t text;
begin
  select title, level into c from public.classes where id = new.class_id;
  select coalesce(full_name, 'A tutor') into t from public.profiles where id = new.tutor_id;
  perform public.notify_admins('Class report submitted', t || ' · ' || c.level || ' ' || c.title, '/admin');
  return new;
end $$;
create trigger notify_report after insert on public.reports for each row execute function public.on_report();

-- Event: student assigned to a tutor -> that tutor
create function public.on_student() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tutor_id is not null and (tg_op = 'INSERT' or new.tutor_id is distinct from old.tutor_id) then
    perform public.notify_user(new.tutor_id, 'New student assigned', new.full_name || ' · ' || new.level, '/students');
  end if;
  return new;
end $$;
create trigger notify_student after insert or update of tutor_id on public.students for each row execute function public.on_student();

-- Event: payment logged -> admins
create function public.on_payment() returns trigger language plpgsql security definer set search_path = '' as $$
declare s text;
begin
  select full_name into s from public.students where id = new.student_id;
  perform public.notify_admins('Payment ' || new.status, coalesce(s, 'Student') || ' · ' || new.currency || ' ' || new.amount, '/admin');
  return new;
end $$;
create trigger notify_payment after insert on public.payments for each row execute function public.on_payment();

-- Event: recurring schedule created -> tutor
create function public.on_schedule() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_user(new.tutor_id, 'New class schedule', new.level || ' ' || new.title || ' starts ' || to_char(new.start_date, 'Dy DD Mon'), '/classes');
  return new;
end $$;
create trigger notify_schedule after insert on public.schedules for each row execute function public.on_schedule();

-- Event: class starts within 15 minutes -> tutor (runs every 5 minutes)
create function public.queue_class_reminders() returns void language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  for c in update public.classes set reminded_at = now()
           where reminded_at is null and tutor_id is not null and starts_at between now() and now() + interval '15 minutes'
           returning tutor_id, title, level, starts_at, meet_url loop
    perform public.notify_user(c.tutor_id, 'Class starts at ' || to_char(c.starts_at at time zone 'Africa/Lagos', 'HH24:MI'),
                               c.level || ' ' || c.title, coalesce(c.meet_url, '/'));
  end loop;
end $$;

-- Delivery: call the edge function only when something is waiting
create function public.deliver_push() returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.notify_queue where sent_at is null) then
    perform net.http_post(url := 'https://jlbpjwgyfdulkjbdhfuf.supabase.co/functions/v1/send-push',
                          headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);
  end if;
end $$;
revoke execute on function public.queue_class_reminders, public.deliver_push from public, anon, authenticated;

select cron.schedule('class-reminders', '*/5 * * * *', 'select public.queue_class_reminders()');
select cron.schedule('deliver-push', '* * * * *', 'select public.deliver_push()');
