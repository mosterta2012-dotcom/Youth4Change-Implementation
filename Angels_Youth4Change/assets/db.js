// =====================================================================
// Youth4Change data layer.
// LIVE mode  → Supabase (when config.js has a URL + anon key)
// DEMO mode  → sample data kept in this browser (localStorage)
// Every page (staff app, application form, feedback form) uses window.Y4C.
// =====================================================================
(function () {
  var cfg = window.Y4C_CONFIG || {};
  var live = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  var sb = live ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  // ---------- shared helpers ----------
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function parseSAID(raw) {
    var s = String(raw || '').replace(/\s/g, '');
    if (!/^\d{13}$/.test(s)) return { ok: false };
    var yy = +s.slice(0, 2), mm = +s.slice(2, 4), dd = +s.slice(4, 6), now = new Date();
    var year = yy > now.getFullYear() % 100 ? 1900 + yy : 2000 + yy;
    var dob = new Date(year, mm - 1, dd);
    if (dob.getMonth() !== mm - 1 || dob.getDate() !== dd) return { ok: false };
    var sum = 0;
    for (var i = 0; i < 13; i++) { var d = +s[12 - i]; if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; }
    var age = now.getFullYear() - year;
    if (now.getMonth() < mm - 1 || (now.getMonth() === mm - 1 && now.getDate() < dd)) age--;
    return { ok: sum % 10 === 0, age: age, sex: +s.slice(6, 10) >= 5000 ? 'Male' : 'Female' };
  }
  function baseUrl() {
    if (cfg.PUBLIC_BASE_URL) return cfg.PUBLIC_BASE_URL.replace(/\/?$/, '/');
    return location.href.replace(/[^/]*([?#].*)?$/, '');
  }
  function check(res) { if (res.error) throw new Error(res.error.message); return res.data; }

  // =================================================================
  // LIVE (Supabase)
  // =================================================================
  var Live = {
    getUser: async function () { var r = await sb.auth.getUser(); return r.data && r.data.user; },
    signIn: async function (email, password) { check(await sb.auth.signInWithPassword({ email: email, password: password })); },
    signOut: async function () { await sb.auth.signOut(); },
    isStaff: async function () { var r = check(await sb.rpc('y4c_is_staff')); return !!r; },
    intakes: async function () { return check(await sb.from('y4c_intakes').select('*').order('cal_year').order('cohort')); },
    updateIntake: async function (id, patch) { check(await sb.from('y4c_intakes').update(patch).eq('id', id)); },
    applications: async function (intakeId) { return check(await sb.from('y4c_applications').select('*').eq('intake_id', intakeId).order('created_at')); },
    updateApplication: async function (id, patch) { check(await sb.from('y4c_applications').update(patch).eq('id', id)); },
    participants: async function (intakeId) { return check(await sb.from('y4c_participants').select('*').eq('intake_id', intakeId).order('full_name')); },
    addParticipant: async function (row) { return check(await sb.from('y4c_participants').insert(row).select().single()); },
    updateParticipant: async function (id, patch) { check(await sb.from('y4c_participants').update(patch).eq('id', id)); },
    sessions: async function (intakeId) { return check(await sb.from('y4c_sessions').select('*').eq('intake_id', intakeId).order('day_no')); },
    saveSession: async function (intakeId, dayNo, patch) {
      var row = Object.assign({ intake_id: intakeId, day_no: dayNo }, patch);
      return check(await sb.from('y4c_sessions').upsert(row, { onConflict: 'intake_id,day_no' }).select().single());
    },
    scores: async function (sessionIds) {
      if (!sessionIds.length) return [];
      return check(await sb.from('y4c_scores').select('*').in('session_id', sessionIds));
    },
    saveScore: async function (sessionId, participantId, patch) {
      var row = Object.assign({ session_id: sessionId, participant_id: participantId, updated_at: new Date().toISOString() }, patch);
      check(await sb.from('y4c_scores').upsert(row, { onConflict: 'session_id,participant_id' }));
    },
    feedback: async function (intakeId) { return check(await sb.from('y4c_feedback').select('*').eq('intake_id', intakeId).order('created_at')); },
    checklist: async function (intakeId) { return check(await sb.from('y4c_checklist').select('*').eq('intake_id', intakeId)); },
    setChecklist: async function (intakeId, list, key, done) {
      check(await sb.from('y4c_checklist').upsert({ intake_id: intakeId, list: list, item_key: key, done: done, done_at: done ? new Date().toISOString() : null }, { onConflict: 'intake_id,list,item_key' }));
    },
    uploadDoc: async function (file, kind) {
      var ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
      var path = 'applications/' + uuid() + '/' + kind + '.' + ext;
      check(await sb.storage.from('y4c-documents').upload(path, file, { contentType: file.type || undefined, upsert: false }));
      return path;
    },
    docUrl: async function (path) {
      var r = check(await sb.storage.from('y4c-documents').createSignedUrl(path, 300));
      return r.signedUrl;
    },
    submitApplication: async function (payload) { return check(await sb.rpc('y4c_submit_application', { p: payload })); },
    submitFeedback: async function (payload) { check(await sb.rpc('y4c_submit_feedback', { p: payload })); }
  };

  // =================================================================
  // DEMO (localStorage)
  // =================================================================
  var KEY = 'y4c_demo_v1';
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.intakes) return s; } catch (e) {}
    var s2 = seed(); save(s2); return s2;
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function rnd(seedN) { var x = Math.sin(seedN * 9301 + 49297) * 10000; return x - Math.floor(x); }

  function seed() {
    var s = { intakes: [], applications: [], participants: [], sessions: [], scores: [], feedback: [], checklist: [] };
    var mk = function (o) { var r = Object.assign({ id: uuid(), places: 20, app_counter: 0, created_at: new Date().toISOString() }, o); s.intakes.push(r); return r; };
    var y1 = mk({ programme_year: 1, cal_year: 2026, cohort: 'Q4', town: 'Kenhardt', town_code: 'KEN', municipality: 'Kenhardt Municipality', camp_places: 5, status: 'completed' });
    var q1 = mk({ programme_year: 2, cal_year: 2027, cohort: 'Q1', town: 'Kenhardt', town_code: 'KEN', municipality: 'Kenhardt Municipality', week1_start: '2027-01-25', week2_start: '2027-02-15', week3_start: '2027-02-22', applications_close: '2027-01-18', camp_places: 10, intern: 'Alyssa', status: 'recruiting' });
    mk({ programme_year: 2, cal_year: 2027, cohort: 'Q2', town: 'Gariep', town_code: 'GAR', week1_start: '2027-03-22', week2_start: '2027-04-19', week3_start: '2027-04-26', applications_close: '2027-03-15', camp_places: 10, intern: 'Uchenay', status: 'planning' });
    mk({ programme_year: 2, cal_year: 2027, cohort: 'Q3', town: 'Wegdraai', town_code: 'WEG', week1_start: '2027-05-24', week2_start: '2027-06-21', week3_start: '2027-07-19', applications_close: '2027-05-17', camp_places: 10, intern: 'Uchenay', status: 'planning' });
    mk({ programme_year: 2, cal_year: 2027, cohort: 'Q4', town: 'Topline', town_code: 'TOP', week1_start: '2027-08-23', week2_start: '2027-09-13', week3_start: '2027-10-18', applications_close: '2027-08-16', camp_places: 10, intern: 'Uchenay', status: 'planning' });

    // Year 1 Kenhardt cohort (sample, completed)
    var PEOPLE = ['Aaliyah Adams', 'Bradley Beukes', 'Carmen Cloete', 'Dewald Dirkse', 'Elize Engelbrecht', 'Fabian Fortuin', 'Gabriella Goliath', 'Hendrik Haarhoff', 'Imke Isaacs', 'Jade Jantjies', 'Keenan Klaasen', 'Lindiwe Links', 'Marco Maasdorp', 'Nadia Nero', 'Oscar Olivier', 'Precious Pienaar', 'Quinton Rooi', 'Ruth September', 'Stefan Steenkamp', 'Tasneem Titus'];
    var MODS = ['Career Development', 'Career Development', 'Soft Skills Mastery', 'Soft Skills Mastery', 'Soft Skills Mastery', 'Jobs of the Future (Drones)', 'Jobs of the Future (Drones)', 'Jobs of the Future (Drones)', 'Intro to Electronics & RE', 'Intro to Electronics & RE', 'Entrepreneur Bootcamp', 'Entrepreneur Bootcamp', 'Entrepreneur Bootcamp', 'Entrepreneur Bootcamp', 'Sport4Change'];
    var parts = PEOPLE.map(function (n, i) {
      var p = { id: uuid(), intake_id: y1.id, application_id: null, full_name: n, id_number: i === 0 ? '0201015800083' : null, phone: null,
        punctuality: 3 + Math.floor(rnd(i + 11) * 2.99), licence_points: [0, 0, 5, 5, 10, 12, 15][Math.floor(rnd(i + 3) * 7)],
        conduct_behaviour: 2 + Math.floor(rnd(i + 23) * 3.99), conduct_teamwork: 2 + Math.floor(rnd(i + 29) * 3.99),
        bonus_pitch: rnd(i * 17) < 0.18, bonus_business: rnd(i * 17 + 1) < 0.18, bonus_peers: rnd(i * 17 + 2) < 0.18, bonus_job: rnd(i * 17 + 3) < 0.18,
        intervention: i === 6 ? '1st — one-on-one' : 'None', camp_selected: false, created_at: new Date().toISOString() };
      s.participants.push(p); return p;
    });
    for (var d = 1; d <= 15; d++) {
      var sess = { id: uuid(), intake_id: y1.id, day_no: d, session_date: null, facilitator: '[Facilitator]', module: MODS[d - 1] };
      s.sessions.push(sess);
      parts.forEach(function (p, i) {
        var absent = (i === 6 && d >= 7 && d <= 9) || (i === 13 && d >= 9 && d <= 10) || rnd(i * 31 + d) < 0.06;
        var base = 2 + Math.floor(rnd(i + 7) * 3.99);
        var sc = Math.max(0, Math.min(5, base + (rnd(i * 13 + d * 7) < 0.3 ? -1 : rnd(i * 5 + d) < 0.2 ? 1 : 0)));
        s.scores.push({ id: uuid(), session_id: sess.id, participant_id: p.id, present: !absent, score: absent ? null : sc, note: '' });
      });
    }
    [[9, 10, 'More practical drone time please'], [8, 9, ''], [10, 10, 'Loved the career expo'], [7, 8, 'Start a bit later in the morning'], [9, 9, ''], [8, 8, '']].forEach(function (f, k) {
      s.feedback.push({ id: uuid(), intake_id: y1.id, first_name: PEOPLE[k].split(' ')[0], surname: PEOPLE[k].split(' ')[1], gender: k % 2 ? 'Male' : 'Female', area: 'Kenhardt', rating_content: f[0], rating_facilitator: f[1], improve: f[2], additional: '', declaration: true, created_at: new Date().toISOString() });
    });

    // Year 2 Q1 Kenhardt sample applications
    var APPS = [
      ['Chantel Booysen', '0104150212083', 'Female', 'Grade 12 / Matric', 'No', 'Verified', 'Shortlisted', 4, 4, 'Municipal account', 'I want to gain skills so I can start my own small catering business in Kenhardt and help support my family.'],
      ['Jacobus Visagie', '9808225338081', 'Male', 'Grade 11', 'No', 'Verified', 'Screened', 3, 4, 'Bank statement', 'I finished school but could not get work. This programme will help me with CV skills and confidence for interviews.'],
      ['Lerato Mokoena', '0211300654086', 'Female', 'Diploma / Certificate', 'No', 'Verified', 'Shortlisted', 5, 4, 'Municipal account', 'I studied office administration and want practical work-readiness training to find a job close to home.'],
      ['Shaun Coetzee', '9503115109087', 'Male', 'Grade 10', 'Yes', 'Pending', 'New', null, null, 'Bank statement', 'I work part-time on a farm and want to learn new skills for a better future.'],
      ['Anelisa Ntsoane', '0006040871084', 'Female', 'Grade 12 / Matric', 'No', 'Verified', 'Screened', 4, 3, 'Municipal account', 'Youth4Change can help me build skills and meet other young people who want to change our town.'],
      ['Ricardo Swartz', '8902245219082', 'Male', 'Grade 12 / Matric', 'No', 'Verified', 'New', null, null, 'Municipal account', 'I want to learn and grow my skills.'],
      ['Bianca Pieterse', '0309120234089', 'Female', 'Grade 11', 'No', 'Rejected', 'New', null, null, 'Affidavit', 'I want to improve myself and get a job.'],
      ['Aaliyah Adams', '0201015800083', 'Female', 'Grade 12 / Matric', 'No', 'Verified', 'New', null, null, 'Bank statement', 'I enjoyed the programme last year and want to do it again.']
    ];
    APPS.forEach(function (a, k) {
      var pid = parseSAID(a[1]);
      q1.app_counter++;
      s.applications.push({ id: uuid(), intake_id: q1.id, ref: 'Y4C-27Q1-KEN-' + String(q1.app_counter).padStart(3, '0'), full_name: a[0], id_number: a[1],
        age: pid.age || (k === 5 ? 37 : 25), gender: a[2], phone: '060 000 01' + String(k + 1).padStart(2, '0'), email: a[0].split(' ')[0].toLowerCase() + '@example.co.za',
        municipality: 'Kenhardt Municipality', town: 'Kenhardt', qualification: a[3], employed: a[4], motivation: a[10], poa_type: a[9],
        id_file_path: 'demo/ID_' + a[0].split(' ')[1] + '.pdf', poa_file_path: 'demo/' + (a[9] === 'Affidavit' ? 'Affidavit_' : 'POA_') + a[0].split(' ')[1] + '.pdf',
        criteria_understood: true, decl_true: true, decl_consent: true, previous_participant: a[1] === '0201015800083',
        doc_status: a[5], status: a[6], panel_motivation: a[7], panel_interview: a[8], panel_comment: '', created_at: '2026-12-0' + Math.min(9, k + 1) + 'T09:00:00Z' });
    });
    return s;
  }

  function tbl(name) { return load()[name]; }
  function patchRow(name, id, patch) { var s = load(); s[name].forEach(function (r) { if (r.id === id) Object.assign(r, patch); }); save(s); }
  var delay = function (v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 30); }); };
  var by = function (k, v) { return function (r) { return r[k] === v; }; };

  var Demo = {
    getUser: async function () { return { email: 'demo@angels' }; },
    signIn: async function () {}, signOut: async function () {}, isStaff: async function () { return true; },
    intakes: async function () { return delay(tbl('intakes').slice()); },
    updateIntake: async function (id, patch) { patchRow('intakes', id, patch); },
    applications: async function (iid) { return delay(tbl('applications').filter(by('intake_id', iid))); },
    updateApplication: async function (id, patch) { patchRow('applications', id, patch); },
    participants: async function (iid) { return delay(tbl('participants').filter(by('intake_id', iid)).sort(function (a, b) { return a.full_name.localeCompare(b.full_name); })); },
    addParticipant: async function (row) {
      var s = load();
      if (row.application_id && s.participants.some(function (p) { return p.application_id === row.application_id; })) throw new Error('Already a participant');
      var r = Object.assign({ id: uuid(), punctuality: 0, licence_points: 0, conduct_behaviour: null, conduct_teamwork: null, bonus_pitch: false, bonus_business: false, bonus_peers: false, bonus_job: false, intervention: 'None', camp_selected: false, created_at: new Date().toISOString() }, row);
      s.participants.push(r); save(s); return r;
    },
    updateParticipant: async function (id, patch) { patchRow('participants', id, patch); },
    sessions: async function (iid) { return delay(tbl('sessions').filter(by('intake_id', iid)).sort(function (a, b) { return a.day_no - b.day_no; })); },
    saveSession: async function (iid, dayNo, patch) {
      var s = load(), r = s.sessions.filter(function (x) { return x.intake_id === iid && x.day_no === dayNo; })[0];
      if (r) Object.assign(r, patch); else { r = Object.assign({ id: uuid(), intake_id: iid, day_no: dayNo }, patch); s.sessions.push(r); }
      save(s); return r;
    },
    scores: async function (ids) { return delay(tbl('scores').filter(function (r) { return ids.indexOf(r.session_id) >= 0; })); },
    saveScore: async function (sid, pid, patch) {
      var s = load(), r = s.scores.filter(function (x) { return x.session_id === sid && x.participant_id === pid; })[0];
      if (r) Object.assign(r, patch); else s.scores.push(Object.assign({ id: uuid(), session_id: sid, participant_id: pid, present: null, score: null, note: '' }, patch));
      save(s);
    },
    feedback: async function (iid) { return delay(tbl('feedback').filter(by('intake_id', iid))); },
    checklist: async function (iid) { return delay(tbl('checklist').filter(by('intake_id', iid))); },
    setChecklist: async function (iid, list, key, done) {
      var s = load(), r = s.checklist.filter(function (x) { return x.intake_id === iid && x.list === list && x.item_key === key; })[0];
      if (r) r.done = done; else s.checklist.push({ intake_id: iid, list: list, item_key: key, done: done });
      save(s);
    },
    uploadDoc: async function (file, kind) { return 'demo/' + kind + '_' + file.name; },
    docUrl: async function () { return null; },
    submitApplication: async function (p) {
      var s = load(), i = s.intakes.filter(by('id', p.intake_id))[0];
      if (!i || i.status !== 'recruiting') throw new Error('Applications for this intake are not open');
      if (!/^\d{13}$/.test(p.id_number)) throw new Error('ID number must be 13 digits');
      i.app_counter++;
      var ref = 'Y4C-' + String(i.cal_year).slice(2) + i.cohort + '-' + i.town_code + '-' + String(i.app_counter).padStart(3, '0');
      var prev = s.participants.some(function (x) { return x.id_number === p.id_number && x.intake_id !== i.id; });
      s.applications.push(Object.assign({ id: uuid(), ref: ref, previous_participant: prev, doc_status: p.poa_type === 'Affidavit' ? 'Rejected' : 'Pending', status: 'New', panel_motivation: null, panel_interview: null, panel_comment: '', created_at: new Date().toISOString() }, p));
      save(s); return ref;
    },
    submitFeedback: async function (p) {
      var s = load(); s.feedback.push(Object.assign({ id: uuid(), created_at: new Date().toISOString() }, p)); save(s);
    },
    resetDemo: function () { localStorage.removeItem(KEY); }
  };

  window.Y4C = Object.assign({ mode: live ? 'live' : 'demo', parseSAID: parseSAID, baseUrl: baseUrl, uuid: uuid }, live ? Live : Demo);
})();
