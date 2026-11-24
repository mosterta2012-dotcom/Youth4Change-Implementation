-- =====================================================================
-- Angels Resource Centres · NPO Management System
-- Youth4Change Programme tab — Supabase database setup
-- Run this whole file once in Supabase: SQL Editor → New query → Run.
-- Safe to re-run: it only creates what is missing.
-- All objects are prefixed y4c_ so they sit next to other NPO System
-- modules in the same Supabase project without clashing.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Staff allow-list (who may see applicant data)
--    Add a row for each staff user AFTER inviting them in
--    Authentication → Users. Only these users can read or change data.
-- ---------------------------------------------------------------------
create table if not exists public.y4c_staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'staff'
             check (role in ('admin', 'staff', 'facilitator')),
  created_at timestamptz not null default now()
);

create or replace function public.y4c_is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.y4c_staff where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 2. Intakes / cohorts (one row per town per programme quarter)
-- ---------------------------------------------------------------------
create table if not exists public.y4c_intakes (
  id                 uuid primary key default gen_random_uuid(),
  programme_year     int  not null,                 -- 1 or 2
  cal_year           int  not null,                 -- 2026, 2027 …
  cohort             text not null check (cohort in ('Q1','Q2','Q3','Q4')),
  town               text not null,
  town_code          text not null,                 -- KEN, GAR, WEG, TOP …
  municipality       text,
  week1_start        date,                          -- Careers & Soft Skills
  week2_start        date,                          -- Jobs of the Future: Tech
  week3_start        date,                          -- Entrepreneurship & Sport + Mini Expo
  applications_close date,
  places             int  not null default 20,
  camp_places        int  not null default 10,      -- Soetwater Youth Camp places
  intern             text,
  status             text not null default 'planning'
                     check (status in ('planning','recruiting','running','completed')),
  app_counter        int  not null default 0,       -- used for reference numbers
  created_at         timestamptz not null default now(),
  unique (cal_year, cohort, town_code)
);

-- ---------------------------------------------------------------------
-- 3. Applications (filled in by applicants via the QR / public link)
-- ---------------------------------------------------------------------
create table if not exists public.y4c_applications (
  id                   uuid primary key default gen_random_uuid(),
  intake_id            uuid not null references public.y4c_intakes(id),
  ref                  text unique,
  full_name            text not null,
  id_number            text not null check (id_number ~ '^[0-9]{13}$'),
  age                  int,
  gender               text,
  phone                text,
  email                text,
  municipality         text,
  town                 text,
  qualification        text,
  employed             text check (employed in ('Yes','No')),
  motivation           text,
  poa_type             text,
  id_file_path         text,
  poa_file_path        text,
  criteria_understood  boolean not null default false,
  decl_true            boolean not null default false,
  decl_consent         boolean not null default false,
  previous_participant boolean not null default false,  -- set by the database, Year 2 rule
  doc_status           text not null default 'Pending' check (doc_status in ('Pending','Verified','Rejected')),
  status               text not null default 'New'
                       check (status in ('New','Screened','Shortlisted','Reserve','Not successful','Selected')),
  panel_motivation     int check (panel_motivation between 0 and 5),
  panel_interview      int check (panel_interview between 0 and 5),
  panel_comment        text,
  scored_by            text,
  scored_at            timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists y4c_applications_intake_idx on public.y4c_applications(intake_id);
create index if not exists y4c_applications_idno_idx   on public.y4c_applications(id_number);

-- ---------------------------------------------------------------------
-- 4. Participants (selected youth in a cohort; also the Year 1 register)
-- ---------------------------------------------------------------------
create table if not exists public.y4c_participants (
  id                uuid primary key default gen_random_uuid(),
  intake_id         uuid not null references public.y4c_intakes(id),
  application_id    uuid references public.y4c_applications(id),
  full_name         text not null,
  id_number         text,
  phone             text,
  punctuality       int  not null default 0 check (punctuality between 0 and 5),
  licence_points    int  not null default 0 check (licence_points in (0,5,10,12,15)),
  conduct_behaviour int  check (conduct_behaviour between 0 and 5),
  conduct_teamwork  int  check (conduct_teamwork between 0 and 5),
  bonus_pitch       boolean not null default false,
  bonus_business    boolean not null default false,
  bonus_peers       boolean not null default false,
  bonus_job         boolean not null default false,
  intervention      text not null default 'None'
                    check (intervention in ('None','1st — one-on-one','2nd — formal warning','Exited')),
  camp_selected     boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (intake_id, application_id)
);
create index if not exists y4c_participants_idno_idx on public.y4c_participants(id_number);

-- ---------------------------------------------------------------------
-- 5. Daily scoresheet: one session per workshop day (1–15),
--    one score row per participant per day
-- ---------------------------------------------------------------------
create table if not exists public.y4c_sessions (
  id           uuid primary key default gen_random_uuid(),
  intake_id    uuid not null references public.y4c_intakes(id) on delete cascade,
  day_no       int  not null check (day_no between 1 and 15),
  session_date date,
  facilitator  text,
  module       text,
  unique (intake_id, day_no)
);

create table if not exists public.y4c_scores (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.y4c_sessions(id) on delete cascade,
  participant_id uuid not null references public.y4c_participants(id) on delete cascade,
  present        boolean,
  score          int check (score between 0 and 5),
  note           text,
  updated_at     timestamptz not null default now(),
  unique (session_id, participant_id)
);

-- ---------------------------------------------------------------------
-- 6. Feedback (end of programme, sent to class via WhatsApp / QR)
-- ---------------------------------------------------------------------
create table if not exists public.y4c_feedback (
  id                 uuid primary key default gen_random_uuid(),
  intake_id          uuid not null references public.y4c_intakes(id),
  first_name         text not null,
  surname            text not null,
  gender             text,
  area               text,
  rating_content     int check (rating_content between 1 and 10),
  rating_facilitator int check (rating_facilitator between 1 and 10),
  improve            text,
  additional         text,
  declaration        boolean not null default false,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. Checklists: cohort preparation timeline + quarter deliverables
-- ---------------------------------------------------------------------
create table if not exists public.y4c_checklist (
  intake_id  uuid not null references public.y4c_intakes(id) on delete cascade,
  list       text not null check (list in ('prep','deliverable')),
  item_key   text not null,
  done       boolean not null default false,
  done_at    timestamptz,
  done_by    uuid default auth.uid(),
  primary key (intake_id, list, item_key)
);

-- ---------------------------------------------------------------------
-- 8. Year 2 rule: flag applicants who were participants before
-- ---------------------------------------------------------------------
create or replace function public.y4c_flag_previous()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.previous_participant := exists (
    select 1 from public.y4c_participants p
    where p.id_number = new.id_number and p.intake_id <> new.intake_id
  );
  return new;
end;
$$;

drop trigger if exists y4c_flag_previous_trg on public.y4c_applications;
create trigger y4c_flag_previous_trg
  before insert on public.y4c_applications
  for each row execute function public.y4c_flag_previous();

-- ---------------------------------------------------------------------
-- 9. Public submit functions (used by the QR forms, no login needed).
--    Applicants can only ADD a record — they can never read anyone's data.
-- ---------------------------------------------------------------------
create or replace function public.y4c_submit_application(p jsonb)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  i   public.y4c_intakes;
  n   int;
  r   text;
  idn text := regexp_replace(coalesce(p->>'id_number',''), '\s', '', 'g');
begin
  select * into i from public.y4c_intakes where id = (p->>'intake_id')::uuid;
  if not found or i.status <> 'recruiting' then
    raise exception 'Applications for this intake are not open';
  end if;
  if i.applications_close is not null and current_date > i.applications_close then
    raise exception 'Applications for this intake have closed';
  end if;
  if idn !~ '^[0-9]{13}$' then raise exception 'ID number must be 13 digits'; end if;
  if coalesce(trim(p->>'full_name'),'') = '' then raise exception 'Full name is required'; end if;
  if coalesce(p->>'id_file_path','') = '' or coalesce(p->>'poa_file_path','') = '' then
    raise exception 'ID copy and proof of address are required';
  end if;
  if not coalesce((p->>'decl_true')::boolean,false) or not coalesce((p->>'decl_consent')::boolean,false) then
    raise exception 'Both declarations must be accepted';
  end if;

  update public.y4c_intakes set app_counter = app_counter + 1
   where id = i.id returning app_counter into n;
  r := 'Y4C-' || right(i.cal_year::text, 2) || i.cohort || '-' || i.town_code || '-' || lpad(n::text, 3, '0');

  insert into public.y4c_applications (
    intake_id, ref, full_name, id_number, age, gender, phone, email, municipality, town,
    qualification, employed, motivation, poa_type, id_file_path, poa_file_path,
    criteria_understood, decl_true, decl_consent, doc_status
  ) values (
    i.id, r, trim(p->>'full_name'), idn, nullif(p->>'age','')::int, p->>'gender', p->>'phone', p->>'email',
    p->>'municipality', p->>'town', p->>'qualification', p->>'employed', p->>'motivation', p->>'poa_type',
    p->>'id_file_path', p->>'poa_file_path',
    coalesce((p->>'criteria_understood')::boolean,false), true, true,
    case when p->>'poa_type' = 'Affidavit' then 'Rejected' else 'Pending' end
  );
  return r;
end;
$$;

create or replace function public.y4c_submit_feedback(p jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.y4c_intakes where id = (p->>'intake_id')::uuid) then
    raise exception 'Unknown cohort';
  end if;
  if not coalesce((p->>'declaration')::boolean,false) then
    raise exception 'Please accept the declaration';
  end if;
  insert into public.y4c_feedback (intake_id, first_name, surname, gender, area,
    rating_content, rating_facilitator, improve, additional, declaration)
  values ((p->>'intake_id')::uuid, trim(p->>'first_name'), trim(p->>'surname'), p->>'gender', p->>'area',
    nullif(p->>'rating_content','')::int, nullif(p->>'rating_facilitator','')::int,
    p->>'improve', p->>'additional', true);
end;
$$;

revoke all on function public.y4c_submit_application(jsonb) from public;
revoke all on function public.y4c_submit_feedback(jsonb)    from public;
grant execute on function public.y4c_submit_application(jsonb) to anon, authenticated;
grant execute on function public.y4c_submit_feedback(jsonb)    to anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. Row Level Security
--     anon (public forms): may only read intake names/dates.
--     staff (y4c_staff list): full access.
-- ---------------------------------------------------------------------
alter table public.y4c_staff        enable row level security;
alter table public.y4c_intakes      enable row level security;
alter table public.y4c_applications enable row level security;
alter table public.y4c_participants enable row level security;
alter table public.y4c_sessions     enable row level security;
alter table public.y4c_scores       enable row level security;
alter table public.y4c_feedback     enable row level security;
alter table public.y4c_checklist    enable row level security;

drop policy if exists y4c_staff_self on public.y4c_staff;
create policy y4c_staff_self on public.y4c_staff
  for select to authenticated using (user_id = auth.uid() or public.y4c_is_staff());

drop policy if exists y4c_intakes_public_read on public.y4c_intakes;
create policy y4c_intakes_public_read on public.y4c_intakes
  for select to anon, authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['y4c_intakes','y4c_applications','y4c_participants','y4c_sessions',
                           'y4c_scores','y4c_feedback','y4c_checklist']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (public.y4c_is_staff()) with check (public.y4c_is_staff())', t || '_staff_all', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 11. Private storage for ID copies and proof of address (POPIA)
--     Anyone may upload into applications/…; only staff can open files.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('y4c-documents', 'y4c-documents', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/heic','image/webp'])
on conflict (id) do nothing;

drop policy if exists y4c_docs_upload on storage.objects;
create policy y4c_docs_upload on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'y4c-documents' and (storage.foldername(name))[1] = 'applications');

drop policy if exists y4c_docs_staff_read on storage.objects;
create policy y4c_docs_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'y4c-documents' and public.y4c_is_staff());

-- ---------------------------------------------------------------------
-- 12. Seed: Year 2 (2027) schedule — Scatec Youth4Change Cohort 2
--     plus the Year 1 Kenhardt cohort (for importing the Year 1 register).
--     Edit dates/towns later in Table Editor → y4c_intakes.
-- ---------------------------------------------------------------------
insert into public.y4c_intakes
  (programme_year, cal_year, cohort, town, town_code, municipality,
   week1_start, week2_start, week3_start, applications_close, places, camp_places, intern, status)
values
  (1, 2026, 'Q4', 'Kenhardt', 'KEN', 'Kenhardt Municipality', null, null, null, null, 20, 5, null, 'completed'),
  (2, 2027, 'Q1', 'Kenhardt', 'KEN', 'Kenhardt Municipality', '2027-01-25', '2027-02-15', '2027-02-22', '2027-01-18', 20, 10, 'Alyssa',  'recruiting'),
  (2, 2027, 'Q2', 'Gariep',   'GAR', null,                    '2027-03-22', '2027-04-19', '2027-04-26', '2027-03-15', 20, 10, 'Uchenay', 'planning'),
  (2, 2027, 'Q3', 'Wegdraai', 'WEG', null,                    '2027-05-24', '2027-06-21', '2027-07-19', '2027-05-17', 20, 10, 'Uchenay', 'planning'),
  (2, 2027, 'Q4', 'Topline',  'TOP', null,                    '2027-08-23', '2027-09-13', '2027-10-18', '2027-08-16', 20, 10, 'Uchenay', 'planning')
on conflict (cal_year, cohort, town_code) do nothing;
