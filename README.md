# Angels Youth4Change — NPO Management System tab

Youth4Change Programme module for the Angels Resource Centres NPO Management System.
It runs on **GitHub Pages** (the website) and **Supabase** (the database and document storage).

| Page | Who uses it | What it does |
|---|---|---|
| `index.html` | Angels staff (login) | The Youth4Change tab: Overview & KPIs, Recruitment, Daily scoresheet, Scoretracker, Feedback |
| `apply.html?intake=…` | Applicants (no login) | Application form — the QR code on flyers and posters |
| `feedback.html?intake=…` | Participants (no login) | Feedback form — sent via the class WhatsApp group |
| `terms.html` | Applicants | Terms & Conditions linked from the application form |

**Demo mode:** while `config.js` is empty, everything runs on sample data saved in your own browser. You can put it on GitHub Pages straight away to show people, then connect Supabase when you are ready.

---

## Part A — Put it on GitHub Pages (same as PERSAL)

1. On GitHub, click **New repository**. Name it `Angels_Youth4Change`. Choose **Public** (GitHub Pages on a free account needs a public repository — the data is safe because it lives in Supabase, not in the files).
2. Click **uploading an existing file**, then drag in **everything inside** the `Angels_Youth4Change` folder (`index.html`, `apply.html`, `feedback.html`, `terms.html`, `config.js`, `README.md`, and the `assets`, `supabase`, `docs` folders). Click **Commit changes**.
3. Go to **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After a minute or two your site is at `https://<your-github-name>.github.io/Angels_Youth4Change/`. It opens in demo mode.

## Part B — Connect Supabase (live data)

1. Sign in at supabase.com. Use the **same project as the NPO Management System / PERSAL** if there is one (all tables start with `y4c_`, so nothing clashes). Otherwise click **New project**, region **South Africa (Cape Town)** if offered.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, click **Run**. This creates the tables, the security rules, the private document store and the 2027 schedule (Kenhardt, Gariep, Wegdraai, Topline). It is safe to run again.
3. **Stop strangers from signing up:** Authentication → Sign In / Providers → turn **off** "Allow new users to sign up".
4. **Add staff:** Authentication → Users → **Invite user** (or Add user) for each person. Then in SQL Editor run, once per person:
   ```sql
   insert into y4c_staff (user_id, full_name, role)
   select id, 'Annemarie Mostert', 'admin' from auth.users where email = 'annemarie@…';
   ```
   Only people on this list can see applicants, documents and scores.
5. Copy the connection details: **Project Settings → API** (or *API Keys*): the **Project URL** and the **anon / publishable** key. *Never* use the `service_role` / secret key.
6. On GitHub open `config.js` → pencil icon → fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `PUBLIC_BASE_URL` (your GitHub Pages address) → **Commit changes**. Wait a minute and refresh — you now get a login screen.

## Part C — Before the Q1 2027 Kenhardt form goes live (due 24–30 Nov 2026)

- [ ] Paste the approved Terms & Conditions into `terms.html`.
- [ ] **Import the Year 1 participant register** into `y4c_participants` (Table Editor → y4c_participants → Insert → Import data from CSV, columns `intake_id`, `full_name`, `id_number`). Use the `id` of the Year 1 Kenhardt row in `y4c_intakes`, and add Year 1 cohorts for the other towns first. Without this the "not a previous participant" check cannot work.
- [ ] Check the Q1 cohort status is **recruiting** (Overview → Cohort settings).
- [ ] Recruitment → *Application form & QR* → **Download QR (PNG)** and send it to design for the flyers and posters.
- [ ] Test once on a phone: submit an application with a photo of a document, then find it in the Applications store and open the document.

## Day-to-day

- **Recruitment:** applications arrive in the Applications store with their ID copy and proof of address. Verify the documents, score on the Selection scoresheet, then **Add to cohort**. Export CSV for the WhatsApp selection list.
- **Daily scoresheet:** facilitators pick the day (1–15), mark attendance, score 0–5 against the rubric and add an evidence note.
- **Scoretracker:** totals build automatically from the daily scoresheets. Capture punctuality, licence progress, conduct (last week) and bonus points. Tick the camp winners in November.
- **Feedback:** on the last day send the link with **Send via WhatsApp**, or show the QR code on screen.

## Rules built in

- Applicant ages are worked out from the SA ID number (with check-digit validation).
- Applicants can only **add** an application — they can never read anyone's data. ID copies and proof of address are in a private store; only staff on the `y4c_staff` list can open them (5-minute links).
- Reference numbers: `Y4C-27Q1-KEN-001`.
- Year 2 rule: the database flags anyone whose ID number is already in the participant register.
- Affidavits are rejected automatically; the form stops accepting entries after the closing date or when the cohort is not "recruiting".
- Scoretracker totals follow the template: attendance (1/day) + total of daily rubric scores + punctuality + 6 modules × 5 + licence + conduct + bonus. "At risk" = more than two sessions missed in a row.

**Still to confirm:** the selection scoresheet weights (draft), rubric as a total or an average, and the module split across the three workshop weeks (see `DAY_MOD` in `index.html`).

For the developer notes on adding this as a tab in the main system, see `docs/DEVELOPER_HANDOVER.md`.
