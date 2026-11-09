-- Recurring class schedules: set once when a contract starts, classes are generated for the whole contract
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  level public.cefr_level not null,
  tutor_id uuid references public.profiles(id),
  weekdays int[] not null,            -- ISO weekdays: 1 = Monday … 7 = Sunday
  start_time time not null,           -- Lagos time
  duration_min int not null default 90,
  meet_url text,
  start_date date not null,
  weeks int not null check (weeks between 1 and 52),
  student_ids uuid[] not null default '{}',
  created_at timestamptz default now()
);
alter table public.schedules enable row level security;
create policy "tutor sees own schedules" on public.schedules for select using (tutor_id = auth.uid() or public.is_admin());
create policy "admin schedules" on public.schedules for all using (public.is_admin()) with check (public.is_admin());

alter table public.classes add column schedule_id uuid references public.schedules on delete set null;
alter table public.reports add column duration_min int;

-- Creates the schedule and every class in it, in one go
create function public.create_schedule(p jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare s public.schedules; d date; c uuid; n int := 0;
begin
  if not public.is_admin() then raise exception 'Only admins can create schedules'; end if;
  insert into public.schedules (title, level, tutor_id, weekdays, start_time, duration_min, meet_url, start_date, weeks, student_ids)
  values (p->>'title', (p->>'level')::public.cefr_level, nullif(p->>'tutor_id','')::uuid,
          array(select jsonb_array_elements_text(p->'weekdays')::int), (p->>'start_time')::time,
          coalesce((p->>'duration_min')::int, 90), nullif(p->>'meet_url',''), (p->>'start_date')::date,
          (p->>'weeks')::int, array(select jsonb_array_elements_text(coalesce(p->'student_ids','[]'))::uuid))
  returning * into s;
  for d in select generate_series(s.start_date, s.start_date + s.weeks * 7 - 1, interval '1 day')::date loop
    if extract(isodow from d)::int = any(s.weekdays) then
      insert into public.classes (title, level, week_no, starts_at, duration_min, meet_url, tutor_id, schedule_id)
      values (s.title, s.level, (d - s.start_date) / 7 + 1, (d + s.start_time) at time zone 'Africa/Lagos',
              s.duration_min, s.meet_url, s.tutor_id, s.id)
      returning id into c;
      insert into public.class_students (class_id, student_id) select c, unnest(s.student_ids);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Ends a schedule early: removes its future classes, keeps past ones (and their reports)
create function public.end_schedule(p_id uuid) returns int
language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Only admins can end schedules'; end if;
  delete from public.classes where schedule_id = p_id and starts_at > now();
  get diagnostics n = row_count;
  delete from public.schedules where id = p_id;
  return n;
end $$;
