-- Phase 2: level lengths, weekly progress, exam results that unlock the next level

-- How many weeks each level runs (the last week is the assessment week). Null = not decided yet.
create table if not exists public.level_lengths (
  level public.cefr_level primary key,
  weeks int check (weeks between 1 and 104)
);
insert into public.level_lengths (level, weeks) values
  ('A1', 12), ('A2', 12), ('B1', null), ('B2', null), ('C1', null), ('C2', null)
on conflict (level) do nothing;
alter table public.level_lengths enable row level security;
create policy "everyone signed in reads level lengths" on public.level_lengths for select to authenticated using (true);
create policy "admins edit level lengths" on public.level_lengths for all using (public.is_admin()) with check (public.is_admin());

-- When the student started their current level (progress counts weeks from here)
alter table public.students add column if not exists level_started_on date;
update public.students set level_started_on = created_at::date where level_started_on is null;
alter table public.students alter column level_started_on set default current_date;

-- End-of-level exam results
create table if not exists public.level_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  level public.cefr_level not null,
  passed boolean not null,
  score numeric check (score is null or score between 0 and 100),
  exam_date date not null default current_date,
  notes text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists level_results_student on public.level_results (student_id, exam_date);
alter table public.level_results enable row level security;
create policy "admins manage results" on public.level_results for all using (public.is_admin()) with check (public.is_admin());
create policy "tutors read their students' results" on public.level_results for select
  using (public.is_active() and exists (select 1 from public.students s where s.id = student_id and s.tutor_id = auth.uid()));
create policy "students read own results" on public.level_results for select using (student_id = public.my_student_id());

-- Record an exam result. A pass on the student's current level moves them to the next level and restarts the weekly count.
create or replace function public.record_level_result(p_student uuid, p_level public.cefr_level, p_passed boolean,
  p_score numeric default null, p_exam_date date default current_date, p_notes text default null)
returns public.cefr_level language plpgsql security definer set search_path = '' as $$
declare cur public.cefr_level; nxt public.cefr_level;
begin
  if not public.is_admin() then raise exception 'Only admins can record exam results'; end if;
  select level into cur from public.students where id = p_student for update;
  if cur is null then raise exception 'Student not found'; end if;
  insert into public.level_results (student_id, level, passed, score, exam_date, notes, recorded_by)
  values (p_student, p_level, p_passed, p_score, coalesce(p_exam_date, current_date), nullif(trim(p_notes), ''), auth.uid());
  if p_passed and p_level = cur then
    nxt := case cur when 'A1' then 'A2' when 'A2' then 'B1' when 'B1' then 'B2' when 'B2' then 'C1' when 'C1' then 'C2' end;
    if nxt is not null then
      update public.students set level = nxt, level_started_on = greatest(coalesce(p_exam_date, current_date), current_date) where id = p_student;
      -- Let the student know (skipped if they have no login or are paused)
      perform public.notify_user(s.user_id, 'Level complete! 🎉', 'You passed ' || cur || '. Welcome to ' || nxt || '!', '/')
        from public.students s where s.id = p_student and s.user_id is not null;
      return nxt;
    end if;
  end if;
  return cur;
end $$;
revoke all on function public.record_level_result from public, anon;
grant execute on function public.record_level_result to authenticated;
