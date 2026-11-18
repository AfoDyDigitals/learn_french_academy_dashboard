-- Phase 4: payment reminders (2 days and 1 day before), overdue notices, receipts

-- One row per reminder sent, so nothing is sent twice for the same due date
create table if not exists public.payment_reminders (
  student_id uuid not null references public.students(id) on delete cascade,
  due_date date not null,
  kind text not null check (kind in ('2d', '1d', 'overdue')),
  sent_at timestamptz not null default now(),
  primary key (student_id, due_date, kind)
);
alter table public.payment_reminders enable row level security;
create policy "admins read reminders" on public.payment_reminders for select using (public.is_admin());

-- Runs every morning (08:00 Lagos). Push + email to the student; overdue students also go to admins.
create or replace function public.queue_payment_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare r record; k text; days int; today date := (now() at time zone 'Africa/Lagos')::date;
begin
  for r in
    select s.id, s.full_name, s.user_id, s.payment_due_date as due
    from public.students s
    where s.status = 'active' and s.payment_due_date is not null
      and (s.payment_due_date - today in (2, 1) or s.payment_due_date between today - 14 and today - 1) -- overdue notice once; very old dates skipped
  loop
    days := r.due - today;
    k := case when days = 2 then '2d' when days = 1 then '1d' else 'overdue' end;
    insert into public.payment_reminders (student_id, due_date, kind) values (r.id, r.due, k) on conflict do nothing;
    if not found then continue; end if; -- already sent
    if r.user_id is not null then
      insert into public.notify_queue (user_id, title, body, url, email)
      select p.id,
        case k when 'overdue' then 'Payment overdue' else 'Payment due ' || case days when 1 then 'tomorrow' else 'in 2 days' end end,
        case k when 'overdue' then 'Your payment was due on ' || to_char(r.due, 'Dy DD Mon') || '. Please pay to keep your classes going, or message us if you need help.'
          else 'Your next payment is due on ' || to_char(r.due, 'Dy DD Mon') || '. Thank you!' end,
        '/payments', true
      from public.profiles p where p.id = r.user_id and p.active;
    end if;
    if k = 'overdue' then
      perform public.notify_admins('Payment overdue', r.full_name || ' · was due ' || to_char(r.due, 'Dy DD Mon'), '/payments');
    end if;
  end loop;
end $$;
revoke execute on function public.queue_payment_reminders from public, anon, authenticated;
select cron.unschedule('payment-reminders') where exists (select 1 from cron.job where jobname = 'payment-reminders');
select cron.schedule('payment-reminders', '0 7 * * *', 'select public.queue_payment_reminders()');

-- Payment logged or marked paid: admins are told (as before) and the student gets a receipt notice
create or replace function public.on_payment() returns trigger language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select full_name, user_id into s from public.students where id = new.student_id;
  if tg_op = 'INSERT' then
    perform public.notify_admins('Payment ' || new.status, coalesce(s.full_name, 'Student') || ' · ' || new.currency || ' ' || new.amount, '/payments');
  end if;
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') and s.user_id is not null then
    perform public.notify_user(s.user_id, 'Payment received ✅', new.currency || ' ' || to_char(new.amount, 'FM999G999G990D00') || ' · thank you!', '/payments');
  end if;
  return new;
end $$;
drop trigger if exists notify_payment on public.payments;
create trigger notify_payment after insert or update of status on public.payments for each row execute function public.on_payment();
