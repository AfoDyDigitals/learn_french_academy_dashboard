-- Edit a recurring schedule: saves the new settings and rebuilds only its future classes.
-- Past classes, attendance and reports are left untouched.
create function public.update_schedule(p_id uuid, p jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare s public.schedules; d date; c uuid; ts timestamptz; n int := 0;
begin
  if not public.is_admin() then raise exception 'Only admins can edit schedules'; end if;
  update public.schedules set
    title = p->>'title',
    level = (p->>'level')::public.cefr_level,
    tutor_id = nullif(p->>'tutor_id','')::uuid,
    weekdays = array(select jsonb_array_elements_text(p->'weekdays')::int),
    start_time = (p->>'start_time')::time,
    duration_min = coalesce((p->>'duration_min')::int, 90),
    meet_url = nullif(p->>'meet_url',''),
    start_date = (p->>'start_date')::date,
    weeks = (p->>'weeks')::int,
    student_ids = array(select jsonb_array_elements_text(coalesce(p->'student_ids','[]'))::uuid)
  where id = p_id returning * into s;
  if not found then raise exception 'Schedule not found'; end if;

  delete from public.classes where schedule_id = s.id and starts_at > now();

  for d in select generate_series(s.start_date, s.start_date + s.weeks * 7 - 1, interval '1 day')::date loop
    ts := (d + s.start_time) at time zone 'Africa/Lagos';
    if ts > now() and extract(isodow from d)::int = any(s.weekdays) then
      insert into public.classes (title, level, week_no, starts_at, duration_min, meet_url, tutor_id, schedule_id)
      values (s.title, s.level, (d - s.start_date) / 7 + 1, ts, s.duration_min, s.meet_url, s.tutor_id, s.id)
      returning id into c;
      insert into public.class_students (class_id, student_id) select c, unnest(s.student_ids);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Tell the tutor when their schedule changes
create function public.on_schedule_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_user(new.tutor_id, 'Class schedule updated', new.level || ' ' || new.title || ': check your classes', '/classes');
  if old.tutor_id is distinct from new.tutor_id then
    perform public.notify_user(old.tutor_id, 'Schedule reassigned', new.level || ' ' || new.title || ' moved to another tutor', '/classes');
  end if;
  return new;
end $$;
create trigger notify_schedule_update after update on public.schedules for each row execute function public.on_schedule_update();
