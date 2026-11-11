-- Pause/resume tutor access, and transfer a tutor's students and classes to another tutor
alter table public.profiles add column active boolean not null default true;

create function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- Tutor access now requires an active account (admin policies are unchanged)
drop policy "tutor sees own students" on public.students;
create policy "tutor sees own students" on public.students for select using (tutor_id = auth.uid() and public.is_active());

drop policy "tutor sees own classes" on public.classes;
create policy "tutor sees own classes" on public.classes for select using (tutor_id = auth.uid() and public.is_active());

drop policy "tutor sees own rosters" on public.class_students;
create policy "tutor sees own rosters" on public.class_students for select
  using (public.is_active() and exists (select 1 from public.classes c where c.id = class_id and c.tutor_id = auth.uid()));
drop policy "tutor marks attendance" on public.class_students;
create policy "tutor marks attendance" on public.class_students for update
  using (public.is_active() and exists (select 1 from public.classes c where c.id = class_id and c.tutor_id = auth.uid()));

drop policy "signed-in read resources" on public.resources;
create policy "signed-in read resources" on public.resources for select to authenticated using (public.is_active());

drop policy "tutor reads own reports" on public.reports;
create policy "tutor reads own reports" on public.reports for select using (tutor_id = auth.uid() and public.is_active());
drop policy "tutor files reports" on public.reports;
create policy "tutor files reports" on public.reports for insert
  with check (tutor_id = auth.uid() and public.is_active()
              and exists (select 1 from public.classes c where c.id = class_id and c.tutor_id = auth.uid()));

drop policy "tutor sees own schedules" on public.schedules;
create policy "tutor sees own schedules" on public.schedules for select using (tutor_id = auth.uid() and public.is_active());

-- Paused accounts get no notifications
create or replace function public.notify_user(p_user uuid, p_title text, p_body text, p_url text default '/') returns void
language sql security definer set search_path = '' as $$
  insert into public.notify_queue (user_id, title, body, url)
  select p_user, p_title, p_body, p_url
  where p_user is not null and exists (select 1 from public.profiles where id = p_user and active);
$$;

-- Move everything a tutor has (current students, schedules, upcoming classes) to another tutor
create function public.transfer_tutor(p_from uuid, p_to uuid) returns json
language plpgsql security invoker set search_path = '' as $$
declare s int; sc int; c int;
begin
  if not public.is_admin() then raise exception 'Only admins can transfer tutors'; end if;
  if p_from = p_to then raise exception 'Pick a different tutor'; end if;
  update public.students set tutor_id = p_to where tutor_id = p_from and status <> 'finished';
  get diagnostics s = row_count;
  update public.schedules set tutor_id = p_to where tutor_id = p_from;
  get diagnostics sc = row_count;
  update public.classes set tutor_id = p_to, reminded_at = null where tutor_id = p_from and starts_at > now();
  get diagnostics c = row_count;
  return json_build_object('students', s, 'schedules', sc, 'classes', c);
end $$;
