-- Student portal, phase 1. Run part A on its own first (a new enum value can't be used in the same run).

-- ===== Part A =====
alter type public.user_role add value if not exists 'student';

-- ===== Part B =====
-- Link a student record to its login, and record when their next payment is due
alter table public.students add column user_id uuid unique references public.profiles(id) on delete set null;
alter table public.students add column payment_due_date date;
alter table public.classes add column topic text;

-- The signed-in student's record id (bypasses RLS so policies can't loop)
create function public.my_student_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.students where user_id = auth.uid();
$$;
create function public.is_my_class(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.class_students where class_id = p_class and student_id = public.my_student_id());
$$;

-- Students read only their own data
create policy "student sees self" on public.students for select using (user_id = auth.uid());
create policy "student sees own rosters" on public.class_students for select using (student_id = public.my_student_id());
create policy "student sees own classes" on public.classes for select using (public.is_my_class(id));
create policy "student sees own payments" on public.payments for select using (student_id = public.my_student_id());
-- Their tutor's name, and the tutor of any class they're in
create policy "student sees own tutors" on public.profiles for select using (
  id = (select tutor_id from public.students where user_id = auth.uid())
  or exists (select 1 from public.classes c where c.tutor_id = profiles.id and public.is_my_class(c.id)));

-- What was covered and the homework for the student's classes (tutor's private notes stay hidden)
create function public.my_class_notes() returns table (class_id uuid, covered text, homework text)
language sql stable security definer set search_path = '' as $$
  select r.class_id, r.covered, r.homework from public.reports r where public.is_my_class(r.class_id);
$$;
grant execute on function public.my_class_notes to authenticated;

-- Class reminders now also go to students who have a login
create or replace function public.queue_class_reminders() returns void language plpgsql security definer set search_path = '' as $$
declare c record; s record;
begin
  for c in update public.classes set reminded_at = now()
           where reminded_at is null and starts_at between now() and now() + interval '15 minutes'
           returning id, tutor_id, title, topic, level, starts_at, meet_url loop
    perform public.notify_user(c.tutor_id, 'Class starts at ' || to_char(c.starts_at at time zone 'Africa/Lagos', 'HH24:MI'),
                               c.level || ' ' || c.title, coalesce(c.meet_url, '/'));
    for s in select st.user_id from public.class_students cs join public.students st on st.id = cs.student_id
             where cs.class_id = c.id and st.user_id is not null loop
      perform public.notify_user(s.user_id, 'Your French class starts at ' || to_char(c.starts_at at time zone 'Africa/Lagos', 'HH24:MI'),
                                 coalesce(c.topic, c.title), coalesce(c.meet_url, '/'));
    end loop;
  end loop;
end $$;
revoke execute on function public.queue_class_reminders from public, anon, authenticated;
