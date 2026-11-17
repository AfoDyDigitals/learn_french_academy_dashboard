-- Paused students (profiles.active = false) lose all data access, same as paused tutors
create or replace function public.my_student_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.students where user_id = auth.uid() and public.is_active();
$$;
drop policy "student sees self" on public.students;
create policy "student sees self" on public.students for select using (user_id = auth.uid() and public.is_active());
