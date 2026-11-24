# Youth4Change module — developer handover

For: Head of Operations and Systems
Purpose: add the Youth4Change Programme module to the Angels NPO Management System as a tab.

## Build status

| Part | Status |
|---|---|
| Database schema, RLS, storage, submit functions (`supabase/schema.sql`) | Done — tested on Postgres 16 with Supabase-style `auth`/`storage` stubs (anon cannot read applications or files; non-staff users see nothing; reference numbers, previous-participant flag, closed-intake rejection all work) |
| Public application form (`apply.html`) and feedback form (`feedback.html`) | Done — tested in demo mode, desktop and phone width |
| Staff tab (`index.html`) | Done — tested in demo mode |
| Live Supabase connection | Not yet tested against a real project — first job after `config.js` is filled in |
| Selection weights, rubric total vs average, module-per-day split | Waiting for programme decisions — do not change without sign-off |

## Stack

Matches PERSAL: static files, no build step. React 18 + Babel Standalone (CDN) for the staff tab, plain JS for the public forms, `@supabase/supabase-js@2` (CDN), `qrcodejs` for QR codes. All data access goes through `assets/db.js` (`window.Y4C`), which switches between Supabase (live) and localStorage (demo).

## Database (all objects prefixed `y4c_`)

| Table | Holds |
|---|---|
| `y4c_staff` | Allow-list of auth users who may see data (`role`: admin/staff/facilitator) |
| `y4c_intakes` | One row per cohort: year, cohort, town, week start dates, closing date, places, camp places, status |
| `y4c_applications` | Applications + document paths + panel scores + status |
| `y4c_participants` | Cohort members and the Year 1 register; scoretracker inputs (punctuality, licence, conduct, bonus, intervention, camp) |
| `y4c_sessions` / `y4c_scores` | Daily scoresheet: day 1–15 per cohort; present/score/note per participant |
| `y4c_feedback` | End-of-programme feedback |
| `y4c_checklist` | Preparation timeline and deliverable ticks |

Functions: `y4c_is_staff()`, `y4c_submit_application(jsonb)` and `y4c_submit_feedback(jsonb)` (security definer, granted to `anon`), trigger `y4c_flag_previous` (Year 2 rule).
Storage: private bucket `y4c-documents`; anon may only insert under `applications/`; staff read via signed URLs.

## Adding it as a tab in the main system — options

1. **Quickest:** host as is and link or iframe `index.html` from the main system's Youth4Change tab. If the main system uses the same Supabase project and origin, the user's session is shared.
2. **Integrated:** copy the components from `index.html` (`Overview`, `Recruitment`, `Selection`, `Daily`, `Tracker`, `Feedback`) into the main app and keep `assets/db.js` as the data service. The public forms stay as separate pages because applicants have no login.
3. **Roles:** if the main system already has a role table, replace the body of `y4c_is_staff()` with a check against it — every policy uses that one function.

## Decisions not to make without programme sign-off

- Selection weights (`QUAL_PTS` and the 30/20/30/20 split in `appScore`).
- Scoretracker formula — it mirrors the beneficiary scoretracker spreadsheet exactly (daily rubric scores are summed).
- Which modules run on which day (`DAY_MOD`); week labels come from the Cohort 2 schedule.
- Hosting/storage location and the POPIA retention period for ID copies.
