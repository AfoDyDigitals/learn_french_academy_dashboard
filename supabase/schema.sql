-- Learn French Academy: core schema
create type public.user_role as enum ('admin','tutor');
create type public.cefr_level as enum ('A1','A2','B1','B2','C1','C2','TCF');

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role public.user_role not null default 'tutor',
  created_at timestamptz default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  country text,
  level public.cefr_level not null,
  goal text check (goal in ('general','tcf')) default 'general',
  exam_date date,
  hours_per_week numeric,
  tutor_id uuid references public.profiles(id),
  status text check (status in ('active','paused','finished')) default 'active',
  created_at timestamptz default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  level public.cefr_level not null,
  week_no int,
  starts_at timestamptz not null,
  duration_min int default 90,
  meet_url text,
  tutor_id uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table public.class_students (
  class_id uuid references public.classes on delete cascade,
  student_id uuid references public.students on delete cascade,
  attended boolean,
  primary key (class_id, student_id)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  level public.cefr_level not null,
  skill text check (skill in ('Listening','Speaking','Reading','Writing','Grammar')) not null,
  source text,
  url text not null,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes on delete cascade,
  tutor_id uuid references public.profiles(id) default auth.uid(),
  covered text,
  homework text,
  notes text,
  created_at timestamptz default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students on delete cascade,
  amount numeric not null,
  currency text check (currency in ('NGN','USD')) not null,
  method text check (method in ('paystack','paypal','transfer')),
  reference text,
  status text check (status in ('pending','paid','failed')) default 'pending',
  period_month date,
  paid_at timestamptz,
  created_at timestamptz default now()
);

-- New sign-ups get a tutor profile; admins are promoted manually
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Row level security
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.classes enable row level security;
alter table public.class_students enable row level security;
alter table public.resources enable row level security;
alter table public.reports enable row level security;
alter table public.payments enable row level security;

create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "admin profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy "tutor sees own students" on public.students for select using (tutor_id = auth.uid() or public.is_admin());
create policy "admin students" on public.students for all using (public.is_admin()) with check (public.is_admin());

create policy "tutor sees own classes" on public.classes for select using (tutor_id = auth.uid() or public.is_admin());
create policy "admin classes" on public.classes for all using (public.is_admin()) with check (public.is_admin());

create policy "tutor sees own rosters" on public.class_students for select
  using (public.is_admin() or exists (select 1 from public.classes c where c.id = class_id and c.tutor_id = auth.uid()));
create policy "tutor marks attendance" on public.class_students for update
  using (exists (select 1 from public.classes c where c.id = class_id and c.tutor_id = auth.uid()));
create policy "admin rosters" on public.class_students for all using (public.is_admin()) with check (public.is_admin());

create policy "signed-in read resources" on public.resources for select to authenticated using (true);
create policy "admin resources" on public.resources for all using (public.is_admin()) with check (public.is_admin());

create policy "tutor reads own reports" on public.reports for select using (tutor_id = auth.uid() or public.is_admin());
create policy "tutor files reports" on public.reports for insert
  with check (tutor_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.tutor_id = auth.uid()));
create policy "admin reports" on public.reports for all using (public.is_admin()) with check (public.is_admin());

create policy "admin payments" on public.payments for all using (public.is_admin()) with check (public.is_admin());

-- Starter resources (links to free sites)
insert into public.resources (title, level, skill, source, url, created_by) values
 ('Se présenter','A1','Listening','TV5Monde Apprendre','https://apprendre.tv5monde.com/fr',null),
 ('Au café','A1','Listening','Podcast Français Facile','https://www.podcastfrancaisfacile.com',null),
 ('Le week-end dernier','A2','Listening','RFI Savoirs','https://savoirs.rfi.fr/fr/apprendre-enseigner',null),
 ('Journal en français facile','B1','Listening','RFI Savoirs','https://savoirs.rfi.fr/fr/apprendre-enseigner',null),
 ('TCF sample tests','TCF','Listening','France Éducation international','https://www.france-education-international.fr/test/tcf-tout-public',null);
