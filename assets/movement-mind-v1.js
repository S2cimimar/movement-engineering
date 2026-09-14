(function () {
  'use strict';

  const SUPABASE_URL = 'https://cxyqzkouezfvxwfvzcsz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_X1zcEZSF1oz6Dlu-MI36lA_KkiQay8j';
  const APP_URL = 'https://movementmind.com.tr/movement-mind-online.html';
  const core = window.MovementMindCore;
  const $ = id => document.getElementById(id);

  if (!window.supabase || !core) {
    const authMessage = $('authMessage');
    authMessage.textContent = 'Uygulama bileşenleri yüklenemedi. Sayfayı yenile.';
    authMessage.classList.remove('hidden');
    authMessage.dataset.tone = 'bad';
    return;
  }

  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const state = {
    user: null,
    profile: null,
    coachStudents: [],
    selectedStudentId: null,
    programDraft: core.blankProgramDraft(),
    coachRecords: new Map(),
    studentData: null,
    bootId: 0
  };

  const decisionNames = {
    progress: 'Dozu artır',
    maintain: 'Koru',
    reduce: 'Dozu azalt',
    change: 'Uyaranı değiştir',
    reassess: 'Yeniden değerlendir'
  };

  const performanceNames = { up: 'Yukarı', same: 'Aynı', down: 'Aşağı' };

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function displayName(profile, fallback = 'Hesap') {
    const value = String(profile?.full_name || fallback).trim();
    return value || fallback;
  }

  function shortName(student) {
    return displayName(student?.profile, `Öğrenci ${String(student?.id || '').slice(0, 6)}`);
  }

  function formatDate(value, options = {}) {
    if (!value) return '—';
    const plainDate = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
    const date = new Date(plainDate ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: options.year === false ? undefined : 'numeric'
    }).format(date);
  }

  function relativeCheckin(value) {
    const diff = core.daysFromToday(value);
    if (diff === 0) return 'Bugün';
    if (diff === -1) return 'Dün';
    if (diff !== null && diff < 0) return `${Math.abs(diff)} gün önce`;
    return formatDate(value);
  }

  function numberOrNull(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(value || '').trim());
  }

  function showMessage(element, text, tone = 'bad') {
    if (!element) return;
    element.textContent = text;
    element.dataset.tone = tone;
    element.classList.remove('hidden');
  }

  function clearMessage(element) {
    if (!element) return;
    element.textContent = '';
    element.classList.add('hidden');
    delete element.dataset.tone;
  }

  function errorMessage(error, fallback) {
    console.error(error);
    return error?.message ? `${fallback}: ${error.message}` : fallback;
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      if (busyText) button.textContent = busyText;
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
      delete button.dataset.label;
    }
    button.disabled = busy;
  }

  function throwIfError(result) {
    if (result?.error) throw result.error;
    return result?.data || [];
  }

  function isoDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return core.localDateISO(date);
  }

  function renderStats(element, items) {
    element.innerHTML = items.map(item => `
      <div class="stat">
        <div class="label">${esc(item.label)}</div>
        <strong>${esc(item.value)}</strong>
        <div class="micro">${esc(item.note || '')}</div>
      </div>`).join('');
  }

  function renderEmpty(element, text) {
    element.innerHTML = `<div class="empty">${esc(text)}</div>`;
  }

  function latestProgram(programs) {
    return [...(programs || [])]
      .filter(program => program.status === 'published')
      .sort((a, b) => Number(b.version) - Number(a.version))[0] || null;
  }

  function latestCheckin(checkins) {
    return core.latestBy(checkins || [], 'created_at');
  }

  function setSignedOut() {
    state.user = null;
    state.profile = null;
    state.studentData = null;
    state.coachStudents = [];
    state.coachRecords.clear();
    $('landingHero').classList.remove('hidden');
    $('authView').classList.remove('hidden');
    $('appShell').classList.add('hidden');
    $('coachApp').classList.add('hidden');
    $('studentApp').classList.add('hidden');
  }

  async function boot(session) {
    if (!session?.user) return setSignedOut();
    const bootId = ++state.bootId;
    clearMessage($('globalNotice'));

    const profileResult = await db.from('profiles')
      .select('id,full_name,role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (bootId !== state.bootId) return;
    if (profileResult.error || !profileResult.data) {
      setSignedOut();
      showMessage($('authMessage'), errorMessage(profileResult.error, 'Profil okunamadı. Hesap kurulumu eksik olabilir.'));
      return;
    }

    state.user = session.user;
    state.profile = profileResult.data;
    $('accountName').textContent = displayName(state.profile, session.user.email);
    $('landingHero').classList.add('hidden');
    $('authView').classList.add('hidden');
    $('appShell').classList.remove('hidden');

    if (state.profile.role === 'coach') {
      $('accountRole').textContent = 'KOÇ ALANI';
      $('coachApp').classList.remove('hidden');
      $('studentApp').classList.add('hidden');
      setView('coachNav', 'coachToday');
      await loadCoachDashboard();
    } else if (state.profile.role === 'student') {
      $('accountRole').textContent = 'ÖĞRENCİ ALANI';
      $('studentApp').classList.remove('hidden');
      $('coachApp').classList.add('hidden');
      $('studentLinkCode').value = session.user.id;
      setView('studentNav', 'studentToday');
      await loadStudentData(true);
    } else {
      showMessage($('globalNotice'), 'Bu hesap için geçerli bir rol bulunamadı.');
    }
  }

  function setView(navId, viewId) {
    const nav = $(navId);
    if (!nav) return;
    if (navId === 'coachNav' && ['coachProgram', 'coachProgress', 'coachDecisions'].includes(viewId)) {
      const current = selectedStudent();
      if (!current || current.relationshipStatus !== 'active') {
        state.selectedStudentId = state.coachStudents.find(student => student.relationshipStatus === 'active')?.id || null;
        renderStudentSelectors();
      }
    }
    nav.querySelectorAll('[data-view]').forEach(button => {
      button.setAttribute('aria-selected', String(button.dataset.view === viewId));
    });
    const root = navId === 'coachNav' ? $('coachApp') : $('studentApp');
    root.querySelectorAll(':scope > .view').forEach(view => view.classList.toggle('hidden', view.id !== viewId));

    if (viewId === 'coachStudents') renderCoachStudents();
    if (viewId === 'coachProgram') renderCoachProgram();
    if (viewId === 'coachProgress') loadCoachProgress();
    if (viewId === 'coachDecisions') loadCoachDecisions();
    if (viewId === 'studentToday') renderStudentToday();
    if (viewId === 'studentProgram') renderStudentProgram();
    if (viewId === 'studentProgress') renderStudentProgress();
    if (viewId === 'studentCheckin') fillTodayCheckin();
  }

  async function loadCoachDashboard(options = {}) {
    const refreshButton = $('refreshCoachButton');
    setBusy(refreshButton, true, 'Yükleniyor');
    clearMessage($('globalNotice'));
    $('coachQueue').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';

    try {
      const relationships = throwIfError(await db.from('coach_students')
        .select('student_id,status,assigned_at')
        .eq('coach_id', state.user.id)
        .order('assigned_at', { ascending: false }));

      if (!relationships.length) {
        state.coachStudents = [];
        state.selectedStudentId = null;
        renderCoachToday();
        renderStudentSelectors();
        renderCoachStudents();
        return;
      }

      const ids = relationships.map(item => item.student_id);
      const [profilesResult, studentProfilesResult, programsResult, checkinsResult, sessionsResult] = await Promise.all([
        db.from('profiles').select('id,full_name,role').in('id', ids),
        db.from('student_profiles').select('*').in('student_id', ids),
        db.from('programs').select('id,student_id,coach_id,version,title,target_adaptation,hypothesis,status,created_at,published_at').in('student_id', ids).order('version', { ascending: false }),
        db.from('checkins').select('id,student_id,checkin_date,energy,sleep,stress,motivation,pain,note,created_at').in('student_id', ids).gte('checkin_date', isoDaysAgo(60)).order('created_at', { ascending: false }),
        db.from('sessions').select('id,student_id,program_id,session_date,duration_min,session_rpe,performance,note,created_at').in('student_id', ids).gte('session_date', isoDaysAgo(120)).order('session_date', { ascending: false })
      ]);

      const profiles = throwIfError(profilesResult);
      const studentProfiles = throwIfError(studentProfilesResult);
      const programs = throwIfError(programsResult);
      const checkins = throwIfError(checkinsResult);
      const sessions = throwIfError(sessionsResult);

      state.coachStudents = relationships.map(relationship => ({
        id: relationship.student_id,
        relationshipStatus: relationship.status,
        assignedAt: relationship.assigned_at,
        profile: profiles.find(profile => profile.id === relationship.student_id) || null,
        studentProfile: studentProfiles.find(profile => profile.student_id === relationship.student_id) || null,
        programs: programs.filter(program => program.student_id === relationship.student_id),
        checkins: checkins.filter(checkin => checkin.student_id === relationship.student_id),
        sessions: sessions.filter(session => session.student_id === relationship.student_id)
      }));

      const keep = options.keepStudentId || state.selectedStudentId;
      state.selectedStudentId = state.coachStudents.some(student => student.id === keep)
        ? keep
        : (state.coachStudents.find(student => student.relationshipStatus === 'active') || state.coachStudents[0]).id;
      state.coachRecords.clear();
      renderCoachToday();
      renderStudentSelectors();
      renderCoachStudents();
      renderCoachProgram();
    } catch (error) {
      showMessage($('globalNotice'), errorMessage(error, 'Koç verileri yüklenemedi'));
    } finally {
      setBusy(refreshButton, false);
    }
  }

  function renderCoachToday() {
    const students = state.coachStudents;
    const today = core.localDateISO();
    const active = students.filter(student => student.relationshipStatus === 'active');
    const checkinsToday = active.filter(student => student.checkins.some(checkin => checkin.checkin_date === today));
    const attention = active.filter(student => core.attentionSignals(student, today).some(signal => signal.level >= 2));
    const sessionsToday = active.reduce((sum, student) => sum + student.sessions.filter(session => session.session_date === today).length, 0);

    renderStats($('coachTodayStats'), [
      { label: 'Aktif', value: active.length, note: 'öğrenci' },
      { label: 'Check-in', value: checkinsToday.length, note: 'bugün' },
      { label: 'Dikkat', value: attention.length, note: 'sinyal' },
      { label: 'Seans', value: sessionsToday, note: 'bugün' }
    ]);

    const queue = active
      .map(student => ({ student, signals: core.attentionSignals(student, today), rank: core.attentionRank(student, today) }))
      .filter(item => item.signals.some(signal => signal.level >= 2))
      .sort((a, b) => b.rank - a.rank);

    $('queueCount').textContent = String(queue.length);
    if (!queue.length) renderEmpty($('coachQueue'), students.length ? 'Bugün belirgin bir sinyal yok.' : 'Henüz bağlı öğrenci yok.');
    else {
      $('coachQueue').innerHTML = queue.map(item => {
        const lead = item.signals[0];
        return `<button class="queue-row" type="button" data-student="${esc(item.student.id)}">
          <div class="between"><strong>${esc(shortName(item.student))}</strong><span class="severity" data-level="${lead.level}">${esc(lead.text)}</span></div>
          <div class="micro">${esc(item.signals.slice(1, 3).map(signal => signal.text).join(' · '))}</div>
        </button>`;
      }).join('');
    }

    const recent = active.flatMap(student => student.checkins.map(checkin => ({ student, checkin })))
      .sort((a, b) => String(b.checkin.created_at).localeCompare(String(a.checkin.created_at)))
      .slice(0, 8);
    if (!recent.length) renderEmpty($('coachRecentCheckins'), 'Henüz check-in yok.');
    else {
      $('coachRecentCheckins').innerHTML = recent.map(({ student, checkin }) => {
        const score = core.readinessScore(checkin);
        return `<button class="list-row" type="button" data-student="${esc(student.id)}">
          <div class="between"><strong>${esc(shortName(student))}</strong><span class="severity" data-level="${score !== null && score < 45 ? 3 : score !== null && score < 65 ? 2 : 1}">${score ?? '—'}</span></div>
          <div class="micro">${esc(relativeCheckin(checkin.checkin_date))}${checkin.note ? ` · ${esc(checkin.note)}` : ''}</div>
        </button>`;
      }).join('');
    }
  }

  function renderStudentSelectors() {
    const activeStudents = state.coachStudents.filter(student => student.relationshipStatus === 'active');
    ['programStudentSelect', 'progressStudentSelect', 'decisionStudentSelect'].forEach(id => {
      const select = $(id);
      const current = state.selectedStudentId;
      select.innerHTML = activeStudents.length
        ? activeStudents.map(student => `<option value="${esc(student.id)}">${esc(shortName(student))}</option>`).join('')
        : '<option value="">Aktif öğrenci yok</option>';
      select.value = activeStudents.some(student => student.id === current) ? current : (activeStudents[0]?.id || '');
      select.disabled = !activeStudents.length;
    });
  }

  function setSelectedStudent(id) {
    if (!id || !state.coachStudents.some(student => student.id === id)) return;
    const changed = state.selectedStudentId !== id;
    state.selectedStudentId = id;
    if (changed) resetProgramDraft();
    ['programStudentSelect', 'progressStudentSelect', 'decisionStudentSelect'].forEach(selectId => {
      const select = $(selectId);
      if ([...select.options].some(option => option.value === id)) select.value = id;
    });
    renderCoachStudents();
    renderCoachProgram();
  }

  function selectedStudent() {
    return state.coachStudents.find(student => student.id === state.selectedStudentId) || null;
  }

  function renderCoachStudents() {
    const list = $('coachStudentList');
    const search = $('studentSearch').value.trim().toLocaleLowerCase('tr-TR');
    const filter = $('studentFilter').value;
    let students = [...state.coachStudents];
    if (search) students = students.filter(student => shortName(student).toLocaleLowerCase('tr-TR').includes(search));
    if (filter === 'attention') students = students.filter(student => core.attentionSignals(student).some(signal => signal.level >= 2));
    else if (filter !== 'all') students = students.filter(student => student.relationshipStatus === filter);

    if (!students.length) renderEmpty(list, state.coachStudents.length ? 'Bu filtrede öğrenci yok.' : 'Henüz bağlı öğrenci yok.');
    else {
      list.innerHTML = students.map(student => {
        const signals = core.attentionSignals(student);
        const lead = signals[0];
        return `<button class="student-row" type="button" data-student="${esc(student.id)}" aria-current="${student.id === state.selectedStudentId}">
          <span><strong>${esc(shortName(student))}</strong><span class="micro">${esc(student.studentProfile?.main_goal || latestProgram(student.programs)?.target_adaptation || 'Hedef girilmedi')}</span></span>
          <span class="severity" data-level="${lead?.level || 1}">${esc(lead?.text || 'Dengede')}</span>
        </button>`;
      }).join('');
    }
    renderCoachStudentDetail();
  }

  function renderCoachStudentDetail() {
    const container = $('coachStudentDetail');
    const student = selectedStudent();
    if (!student) return renderEmpty(container, 'Bir öğrenci seç.');
    const profile = student.studentProfile || {};
    const program = latestProgram(student.programs);
    const checkin = latestCheckin(student.checkins);
    const canWrite = student.relationshipStatus === 'active';

    container.innerHTML = `
      <div class="between">
        <div><div class="label">ÖĞRENCİ DOSYASI</div><h3>${esc(shortName(student))}</h3></div>
        <span class="tag">${esc(student.relationshipStatus)}</span>
      </div>
      <div class="grid two spacer">
        <div class="signal ${program ? 'good' : 'warn'}"><span class="micro">PROGRAM</span><br>${program ? `${esc(program.title)} · v${esc(program.version)}` : 'Yok'}</div>
        <div class="signal ${checkin && Number(checkin.pain) < 2 ? 'good' : 'warn'}"><span class="micro">CHECK-IN</span><br>${checkin ? `${core.readinessScore(checkin) ?? '—'} · ${esc(relativeCheckin(checkin.checkin_date))}` : 'Yok'}</div>
      </div>
      <form id="studentRelationshipForm" class="form-grid spacer">
        <label class="field"><span>İlişki durumu</span><select id="relationshipStatusSelect">
          <option value="active" ${student.relationshipStatus === 'active' ? 'selected' : ''}>Aktif</option>
          <option value="paused" ${student.relationshipStatus === 'paused' ? 'selected' : ''}>Donduruldu</option>
          <option value="ended" ${student.relationshipStatus === 'ended' ? 'selected' : ''}>Bitti</option>
        </select></label>
        <div class="actions field-end"><button id="saveRelationshipButton" class="ghost" type="submit">Durumu kaydet</button></div>
        <div id="relationshipMessage" class="notice hidden wide" role="status"></div>
      </form>
      <form id="studentProfileForm" class="form-grid spacer">
        <label class="field"><span>Ana hedef</span><input id="profileMainGoal" value="${esc(profile.main_goal)}" placeholder="Ana hedef"></label>
        <label class="field"><span>İkincil hedef</span><input id="profileSecondaryGoal" value="${esc(profile.secondary_goal)}" placeholder="İkincil hedef"></label>
        <label class="field"><span>Haftalık seans</span><input id="profileWeeklySessions" type="number" min="0" max="14" value="${esc(profile.weekly_sessions ?? '')}"></label>
        <label class="field"><span>Seans süresi · dk</span><input id="profileSessionDuration" type="number" min="0" max="300" value="${esc(profile.session_duration ?? '')}"></label>
        <label class="field"><span>Ekipman</span><input id="profileEquipment" value="${esc(profile.equipment)}" placeholder="Salon, ev, TRX…"></label>
        <label class="field"><span>Antrenman yaşı</span><input id="profileTrainingAge" value="${esc(profile.training_age)}" placeholder="Örn. 2 yıl"></label>
        <label class="field"><span>Başlangıç</span><input id="profileStartDate" type="date" value="${esc(profile.start_date)}"></label>
        <label class="field"><span>Yenileme</span><input id="profileRenewalDate" type="date" value="${esc(profile.renewal_date)}"></label>
        <label class="field"><span>Paket ders</span><input id="profilePackageSessions" type="number" min="0" value="${esc(profile.package_sessions ?? 0)}"></label>
        <label class="field"><span>Kullanılan</span><input id="profileUsedSessions" type="number" min="0" value="${esc(profile.used_sessions ?? 0)}"></label>
        <label class="field wide"><span>Klinik sınırlar</span><textarea id="profileClinicalConstraints">${esc(profile.clinical_constraints)}</textarea></label>
        <label class="field wide"><span>Yaşam sınırları</span><textarea id="profileLifeConstraints">${esc(profile.life_constraints)}</textarea></label>
        <label class="field wide"><span>Koç notu</span><textarea id="profileCoachNotes">${esc(profile.coach_notes)}</textarea></label>
        <div class="actions wide">
          <button id="saveStudentProfileButton" class="btn" type="submit" ${canWrite ? '' : 'disabled'}>Dosyayı kaydet</button>
          <button class="ghost" type="button" data-open-view="coachProgram" ${canWrite ? '' : 'disabled'}>Program</button>
          <button class="ghost" type="button" data-open-view="coachProgress" ${canWrite ? '' : 'disabled'}>Gelişim</button>
          <button class="ghost" type="button" data-open-view="coachDecisions" ${canWrite ? '' : 'disabled'}>Kararlar</button>
        </div>
        <div id="studentProfileMessage" class="notice hidden wide" role="status"></div>
      </form>`;

    $('studentRelationshipForm').addEventListener('submit', saveRelationshipStatus);
    $('studentProfileForm').addEventListener('submit', saveStudentProfile);
    container.querySelectorAll('[data-open-view]').forEach(button => button.addEventListener('click', () => setView('coachNav', button.dataset.openView)));
  }

  async function saveRelationshipStatus(event) {
    event.preventDefault();
    const student = selectedStudent();
    if (!student) return;
    const button = $('saveRelationshipButton');
    const message = $('relationshipMessage');
    const status = $('relationshipStatusSelect').value;
    clearMessage(message);
    setBusy(button, true, 'Kaydediliyor');
    try {
      throwIfError(await db.from('coach_students')
        .update({ status })
        .eq('coach_id', state.user.id)
        .eq('student_id', student.id));
      await loadCoachDashboard({ keepStudentId: student.id });
      showMessage($('globalNotice'), 'Öğrenci durumu güncellendi.', 'good');
    } catch (error) {
      showMessage(message, errorMessage(error, 'Öğrenci durumu güncellenemedi'));
    } finally {
      setBusy($('saveRelationshipButton'), false);
    }
  }

  async function linkStudent(event) {
    event.preventDefault();
    const studentId = $('studentLinkInput').value.trim();
    const button = $('linkStudentButton');
    const message = $('linkStudentMessage');
    clearMessage(message);
    if (!isUuid(studentId)) return showMessage(message, 'Geçerli bir bağlantı kodu gir.');
    if (studentId === state.user.id) return showMessage(message, 'Kendi hesabını öğrenci olarak bağlayamazsın.');
    setBusy(button, true, 'Bağlanıyor');
    try {
      throwIfError(await db.from('coach_students').upsert({
        coach_id: state.user.id,
        student_id: studentId,
        status: 'active'
      }, { onConflict: 'coach_id,student_id' }));

      const profileResult = await db.from('profiles').select('id,role').eq('id', studentId).maybeSingle();
      if (profileResult.error || profileResult.data?.role !== 'student') {
        await db.from('coach_students')
          .delete()
          .eq('coach_id', state.user.id)
          .eq('student_id', studentId);
        throw new Error('Bu kod etkin bir öğrenci hesabına ait değil.');
      }

      $('studentLinkInput').value = '';
      await loadCoachDashboard({ keepStudentId: studentId });
      showMessage(message, 'Öğrenci bağlandı.', 'good');
    } catch (error) {
      showMessage(message, errorMessage(error, 'Öğrenci bağlanamadı'));
    } finally {
      setBusy(button, false);
    }
  }

  async function copyStudentLinkCode() {
    const input = $('studentLinkCode');
    const message = $('studentLinkCodeMessage');
    clearMessage(message);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(input.value);
      else {
        input.focus();
        input.select();
        if (!document.execCommand?.('copy')) throw new Error('Kopyalama desteklenmiyor.');
      }
      showMessage(message, 'Bağlantı kodu kopyalandı.', 'good');
    } catch (error) {
      showMessage(message, 'Kod seçildi; elle kopyalayabilirsin.');
      input.focus();
      input.select();
    }
  }

  async function saveStudentProfile(event) {
    event.preventDefault();
    const student = selectedStudent();
    if (!student || student.relationshipStatus !== 'active') return;
    const button = $('saveStudentProfileButton');
    const message = $('studentProfileMessage');
    clearMessage(message);
    setBusy(button, true, 'Kaydediliyor');
    const payload = {
      student_id: student.id,
      main_goal: $('profileMainGoal').value.trim() || null,
      secondary_goal: $('profileSecondaryGoal').value.trim() || null,
      weekly_sessions: numberOrNull($('profileWeeklySessions').value),
      session_duration: numberOrNull($('profileSessionDuration').value),
      equipment: $('profileEquipment').value.trim() || null,
      training_age: $('profileTrainingAge').value.trim() || null,
      start_date: $('profileStartDate').value || null,
      renewal_date: $('profileRenewalDate').value || null,
      package_sessions: numberOrNull($('profilePackageSessions').value) || 0,
      used_sessions: numberOrNull($('profileUsedSessions').value) || 0,
      clinical_constraints: $('profileClinicalConstraints').value.trim() || null,
      life_constraints: $('profileLifeConstraints').value.trim() || null,
      coach_notes: $('profileCoachNotes').value.trim() || null,
      updated_at: new Date().toISOString()
    };

    try {
      throwIfError(await db.from('student_profiles').upsert(payload, { onConflict: 'student_id' }));
      await loadCoachDashboard({ keepStudentId: student.id });
      showMessage($('studentProfileMessage'), 'Öğrenci dosyası kaydedildi.', 'good');
    } catch (error) {
      showMessage(message, errorMessage(error, 'Öğrenci dosyası kaydedilemedi'));
    } finally {
      setBusy($('saveStudentProfileButton'), false);
    }
  }

  function syncProgramDraftFromDom() {
    state.programDraft.title = $('programTitle').value.trim();
    state.programDraft.target_adaptation = $('programAdaptation').value.trim();
    state.programDraft.hypothesis = $('programHypothesis').value.trim();
    state.programDraft.days = [...$('programDays').querySelectorAll('.builder-day')].map(dayElement => ({
      title: dayElement.querySelector('[data-day-title]').value.trim(),
      exercises: [...dayElement.querySelectorAll('.builder-exercise')].map(exerciseElement => ({
        adaptation: exerciseElement.querySelector('[data-field="adaptation"]').value.trim(),
        name: exerciseElement.querySelector('[data-field="name"]').value.trim(),
        sets: numberOrNull(exerciseElement.querySelector('[data-field="sets"]').value),
        reps: exerciseElement.querySelector('[data-field="reps"]').value.trim(),
        load_text: exerciseElement.querySelector('[data-field="load_text"]').value.trim(),
        target_rir: null,
        rest_seconds: null,
        tempo: '',
        notes: ''
      }))
    }));
  }

  function renderProgramDays() {
    $('programDays').innerHTML = state.programDraft.days.map((day, dayIndex) => `
      <article class="builder-day" data-day-index="${dayIndex}">
        <div class="between">
          <label class="field grow"><span>Gün ${dayIndex + 1}</span><input data-day-title value="${esc(day.title)}" placeholder="Gün adı"></label>
          <button class="icon-button" type="button" data-action="remove-day" aria-label="Günü kaldır" ${state.programDraft.days.length === 1 ? 'disabled' : ''}>×</button>
        </div>
        ${day.exercises.map((exercise, exerciseIndex) => `
          <div class="builder-exercise" data-exercise-index="${exerciseIndex}">
            <div class="dose-grid">
              <label class="field"><span>Adaptasyon</span><input data-field="adaptation" list="adaptationOptions" value="${esc(exercise.adaptation)}" placeholder="Amaç"></label>
              <label class="field"><span>Egzersiz</span><input data-field="name" value="${esc(exercise.name)}" placeholder="Hareket"></label>
              <label class="field"><span>Set</span><input data-field="sets" type="number" min="1" max="20" value="${esc(exercise.sets ?? '')}"></label>
              <label class="field"><span>Tekrar / süre</span><input data-field="reps" value="${esc(exercise.reps)}" placeholder="8–10"></label>
              <label class="field dose-field"><span>Doz / yük</span><input data-field="load_text" value="${esc(exercise.load_text)}" placeholder="RIR 2 · 40 kg"></label>
              <button class="icon-button" type="button" data-action="remove-exercise" aria-label="Egzersizi kaldır" ${day.exercises.length === 1 ? 'disabled' : ''}>×</button>
            </div>
          </div>`).join('')}
        <div class="actions"><button class="ghost" type="button" data-action="add-exercise">+ Egzersiz</button></div>
      </article>`).join('');
  }

  function resetProgramDraft() {
    state.programDraft = core.blankProgramDraft();
    $('programTitle').value = '';
    $('programAdaptation').value = '';
    $('programHypothesis').value = '';
    renderProgramDays();
  }

  function renderCoachProgram() {
    const student = selectedStudent();
    const active = student?.relationshipStatus === 'active';
    renderProgramDays();
    ['programTitle', 'programAdaptation', 'programHypothesis', 'publishProgramButton'].forEach(id => { $(id).disabled = !active; });
    $('addProgramDayButton').disabled = !active;
    if (!active) $('programDays').querySelectorAll('input,button').forEach(element => { element.disabled = true; });
    renderProgramHistory(student);
  }

  function renderProgramHistory(student) {
    const element = $('programHistory');
    if (!student) return renderEmpty(element, 'Aktif bir öğrenci seç.');
    const programs = [...student.programs].sort((a, b) => Number(b.version) - Number(a.version));
    if (!programs.length) return renderEmpty(element, 'Henüz program yok.');
    element.innerHTML = programs.map(program => `
      <div class="history-item">
        <div class="between"><strong>${esc(program.title)}</strong><span class="tag">v${esc(program.version)} · ${esc(program.status)}</span></div>
        <div class="micro">${esc(program.target_adaptation || 'Adaptasyon yazılmadı')} · ${esc(formatDate(program.published_at || program.created_at))}</div>
        ${program.hypothesis ? `<p class="small muted">${esc(program.hypothesis)}</p>` : ''}
      </div>`).join('');
  }

  async function publishProgram(event) {
    event.preventDefault();
    const student = selectedStudent();
    const message = $('programMessage');
    clearMessage(message);
    if (!student || student.relationshipStatus !== 'active') return showMessage(message, 'Aktif bir öğrenci seç.');
    syncProgramDraftFromDom();
    const validation = core.validateProgramDraft(state.programDraft);
    if (validation.length) return showMessage(message, validation[0]);

    const button = $('publishProgramButton');
    setBusy(button, true, 'Yayınlanıyor');
    let createdProgramId = null;
    let published = false;

    try {
      const latestResult = await db.from('programs')
        .select('version')
        .eq('student_id', student.id)
        .order('version', { ascending: false })
        .limit(1);
      const versions = throwIfError(latestResult);
      const version = (Number(versions[0]?.version) || 0) + 1;

      const programResult = await db.from('programs').insert({
        student_id: student.id,
        coach_id: state.user.id,
        version,
        title: state.programDraft.title,
        target_adaptation: state.programDraft.target_adaptation,
        hypothesis: state.programDraft.hypothesis || null,
        status: 'draft'
      }).select('id,version').single();
      if (programResult.error) throw programResult.error;
      createdProgramId = programResult.data.id;

      const dayResult = await db.from('program_days').insert(state.programDraft.days.map((day, index) => ({
        program_id: createdProgramId,
        day_order: index + 1,
        title: day.title
      }))).select('id,day_order');
      const createdDays = throwIfError(dayResult);

      const exercisePayload = state.programDraft.days.flatMap((day, dayIndex) => {
        const createdDay = createdDays.find(item => Number(item.day_order) === dayIndex + 1);
        if (!createdDay) throw new Error('Program günü oluşturulamadı.');
        return day.exercises.map((exercise, exerciseIndex) => ({
          day_id: createdDay.id,
          exercise_order: exerciseIndex + 1,
          name: exercise.name,
          adaptation: exercise.adaptation,
          sets: Number(exercise.sets),
          reps: exercise.reps,
          load_text: exercise.load_text,
          target_rir: exercise.target_rir,
          rest_seconds: exercise.rest_seconds,
          tempo: exercise.tempo || null,
          notes: exercise.notes || null
        }));
      });
      throwIfError(await db.from('program_exercises').insert(exercisePayload));

      const publishResult = await db.from('programs').update({
        status: 'published',
        published_at: new Date().toISOString()
      }).eq('id', createdProgramId).eq('coach_id', state.user.id).select('id').single();
      if (publishResult.error) throw publishResult.error;
      published = true;

      const archiveResult = await db.from('programs').update({ status: 'archived' })
        .eq('student_id', student.id)
        .eq('coach_id', state.user.id)
        .eq('status', 'published')
        .neq('id', createdProgramId);
      if (archiveResult.error) console.warn('Önceki programlar arşivlenemedi', archiveResult.error);

      resetProgramDraft();
      await loadCoachDashboard({ keepStudentId: student.id });
      showMessage($('programMessage'), `Program v${version} yayınlandı.`, 'good');
    } catch (error) {
      if (createdProgramId && !published) {
        const cleanup = await db.from('programs').delete().eq('id', createdProgramId).eq('coach_id', state.user.id);
        if (cleanup.error) console.error('Eksik taslak temizlenemedi', cleanup.error);
      }
      showMessage(message, errorMessage(error, published ? 'Program yayınlandı; ekran yenilenemedi' : 'Program yayınlanamadı'), published ? 'good' : 'bad');
    } finally {
      setBusy($('publishProgramButton'), false);
    }
  }

  async function fetchProgramBundle(studentId) {
    const programResult = await db.from('programs')
      .select('id,student_id,coach_id,version,title,target_adaptation,hypothesis,status,created_at,published_at')
      .eq('student_id', studentId)
      .eq('status', 'published')
      .order('version', { ascending: false })
      .limit(1);
    const programs = throwIfError(programResult);
    const program = programs[0];
    if (!program) return null;

    const days = throwIfError(await db.from('program_days')
      .select('id,program_id,day_order,title')
      .eq('program_id', program.id)
      .order('day_order', { ascending: true }));
    const dayIds = days.map(day => day.id);
    const exercises = dayIds.length
      ? throwIfError(await db.from('program_exercises')
        .select('id,day_id,exercise_order,name,adaptation,sets,reps,load_text,target_rir,rest_seconds,tempo,notes')
        .in('day_id', dayIds)
        .order('exercise_order', { ascending: true }))
      : [];
    program.days = days.map(day => ({ ...day, exercises: exercises.filter(exercise => exercise.day_id === day.id) }));
    return program;
  }

  async function loadCoachRecordSet(studentId, force = false) {
    if (!studentId) return null;
    if (!force && state.coachRecords.has(studentId)) return state.coachRecords.get(studentId);
    const [measurementsResult, sessionsResult, checkinsResult, decisionsResult, program] = await Promise.all([
      db.from('measurements').select('id,student_id,measured_at,metric,value,unit,note').eq('student_id', studentId).order('measured_at', { ascending: false }),
      db.from('sessions').select('id,student_id,program_id,session_date,duration_min,session_rpe,performance,note,created_at').eq('student_id', studentId).order('session_date', { ascending: false }).limit(100),
      db.from('checkins').select('id,student_id,checkin_date,energy,sleep,stress,motivation,pain,note,created_at').eq('student_id', studentId).order('created_at', { ascending: false }).limit(60),
      db.from('coach_decisions').select('id,student_id,coach_id,decision_date,decision_type,reason,next_hypothesis,program_version,outcome,created_at').eq('student_id', studentId).eq('coach_id', state.user.id).order('created_at', { ascending: false }).limit(100),
      fetchProgramBundle(studentId)
    ]);
    const records = {
      measurements: throwIfError(measurementsResult),
      sessions: throwIfError(sessionsResult),
      checkins: throwIfError(checkinsResult),
      decisions: throwIfError(decisionsResult),
      program
    };
    state.coachRecords.set(studentId, records);
    return records;
  }

  function renderReadinessChart(element, checkins) {
    const values = [...(checkins || [])]
      .sort((a, b) => String(a.checkin_date).localeCompare(String(b.checkin_date)))
      .slice(-14)
      .map(checkin => ({ checkin, score: core.readinessScore(checkin) }))
      .filter(item => item.score !== null);
    if (!values.length) return renderEmpty(element, 'Henüz yeterli check-in yok.');
    element.innerHTML = values.map(item => `
      <div class="chart-bar" data-low="${item.score < 50}" style="height:${Math.max(3, item.score)}%" title="${esc(formatDate(item.checkin.checkin_date))}: ${item.score}">
        <span>${esc(String(item.checkin.checkin_date).slice(8, 10))}</span>
      </div>`).join('');
  }

  function renderSessionList(element, sessions, limit = 8) {
    const rows = (sessions || []).slice(0, limit);
    if (!rows.length) return renderEmpty(element, 'Henüz seans kaydı yok.');
    element.innerHTML = rows.map(session => `
      <div class="history-item">
        <div class="between"><strong>${esc(formatDate(session.session_date))}</strong><span class="tag">RPE ${esc(session.session_rpe ?? '—')}</span></div>
        <div class="micro">${session.duration_min != null ? `${esc(session.duration_min)} dk` : 'Süre yok'}${session.performance ? ` · ${esc(performanceNames[session.performance] || session.performance)}` : ''}</div>
        ${session.note ? `<div class="small muted">${esc(session.note)}</div>` : ''}
      </div>`).join('');
  }

  function renderMeasurementList(element, measurements) {
    if (!(measurements || []).length) return renderEmpty(element, 'Henüz ölçüm yok.');
    element.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Tarih</th><th>Ölçüm</th><th>Değer</th><th>Not</th></tr></thead>
      <tbody>${measurements.map(item => `<tr>
        <td>${esc(formatDate(item.measured_at))}</td>
        <td>${esc(item.metric)}</td>
        <td><strong>${esc(item.value)} ${esc(item.unit || '')}</strong></td>
        <td class="muted">${esc(item.note || '—')}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  async function loadCoachProgress() {
    const student = selectedStudent();
    if (!student) {
      renderStats($('coachProgressStats'), [{ label: 'Durum', value: '—', note: 'Aktif öğrenci yok' }]);
      renderEmpty($('coachReadinessChart'), 'Aktif bir öğrenci seç.');
      renderEmpty($('coachSessionList'), 'Aktif bir öğrenci seç.');
      renderEmpty($('coachMeasurementList'), 'Aktif bir öğrenci seç.');
      return;
    }
    $('coachReadinessChart').innerHTML = '<div class="skeleton"></div>';
    try {
      const records = await loadCoachRecordSet(student.id);
      const summary = core.progressSummary(records.sessions, records.measurements);
      const readiness = core.readinessScore(latestCheckin(records.checkins));
      renderStats($('coachProgressStats'), [
        { label: 'Seans', value: summary.sessionCount, note: 'son 30 gün' },
        { label: 'Süre', value: summary.duration, note: 'dakika' },
        { label: 'Ort. RPE', value: summary.averageRpe ?? '—', note: 'son 30 gün' },
        { label: 'Hazır oluş', value: readiness ?? '—', note: 'son check-in' }
      ]);
      renderReadinessChart($('coachReadinessChart'), records.checkins);
      renderSessionList($('coachSessionList'), records.sessions);
      renderMeasurementList($('coachMeasurementList'), records.measurements);
    } catch (error) {
      showMessage($('globalNotice'), errorMessage(error, 'Gelişim verileri yüklenemedi'));
    }
  }

  async function saveMeasurement(event) {
    event.preventDefault();
    const student = selectedStudent();
    if (!student) return;
    const button = $('saveMeasurementButton');
    const message = $('measurementMessage');
    clearMessage(message);
    setBusy(button, true, 'Kaydediliyor');
    try {
      const measuredAt = new Date(`${$('measurementDate').value}T12:00:00`).toISOString();
      throwIfError(await db.from('measurements').insert({
        student_id: student.id,
        measured_at: measuredAt,
        metric: $('measurementMetric').value.trim(),
        value: Number($('measurementValue').value),
        unit: $('measurementUnit').value.trim() || null,
        note: $('measurementNote').value.trim() || null
      }));
      $('measurementForm').reset();
      $('measurementDate').value = core.localDateISO();
      state.coachRecords.delete(student.id);
      await loadCoachProgress();
      showMessage(message, 'Ölçüm kaydedildi.', 'good');
    } catch (error) {
      showMessage(message, errorMessage(error, 'Ölçüm kaydedilemedi'));
    } finally {
      setBusy(button, false);
    }
  }

  async function saveCoachSession(event) {
    event.preventDefault();
    const student = selectedStudent();
    if (!student) return;
    const button = $('saveCoachSessionButton');
    const message = $('coachSessionMessage');
    clearMessage(message);
    setBusy(button, true, 'Kaydediliyor');
    try {
      const records = await loadCoachRecordSet(student.id);
      throwIfError(await db.from('sessions').insert({
        student_id: student.id,
        program_id: records.program?.id || null,
        session_date: $('coachSessionDate').value,
        duration_min: numberOrNull($('coachSessionDuration').value),
        session_rpe: numberOrNull($('coachSessionRpe').value),
        performance: $('coachSessionPerformance').value || null,
        note: $('coachSessionNote').value.trim() || null
      }));
      $('coachSessionForm').reset();
      $('coachSessionDate').value = core.localDateISO();
      state.coachRecords.delete(student.id);
      await loadCoachDashboard({ keepStudentId: student.id });
      await loadCoachProgress();
      showMessage(message, 'Seans kaydedildi.', 'good');
    } catch (error) {
      showMessage(message, errorMessage(error, 'Seans kaydedilemedi'));
    } finally {
      setBusy(button, false);
    }
  }

  function renderDecisionList(decisions) {
    const element = $('decisionList');
    if (!decisions?.length) return renderEmpty(element, 'Henüz karar kaydı yok.');
    element.innerHTML = decisions.map(decision => `
      <div class="history-item" data-decision="${esc(decision.id)}">
        <div class="between"><strong>${esc(decisionNames[decision.decision_type] || decision.decision_type)}</strong><span class="tag">${esc(formatDate(decision.decision_date))}</span></div>
        <p class="small">${esc(decision.reason)}</p>
        ${decision.next_hypothesis ? `<div class="signal"><span class="micro">SONRAKİ HİPOTEZ</span><br>${esc(decision.next_hypothesis)}</div>` : ''}
        <label class="field spacer"><span>Sonuç</span><textarea data-decision-outcome>${esc(decision.outcome || '')}</textarea></label>
        <div class="actions"><button class="ghost" type="button" data-save-decision-outcome>Sonucu kaydet</button></div>
      </div>`).join('');
  }

  async function loadCoachDecisions() {
    const student = selectedStudent();
    if (!student) return renderEmpty($('decisionList'), 'Aktif bir öğrenci seç.');
    $('decisionList').innerHTML = '<div class="skeleton"></div>';
    try {
      const records = await loadCoachRecordSet(student.id);
      renderDecisionList(records.decisions);
    } catch (error) {
      showMessage($('globalNotice'), errorMessage(error, 'Kararlar yüklenemedi'));
    }
  }

  async function saveDecision(event) {
    event.preventDefault();
    const student = selectedStudent();
    if (!student) return;
    const button = $('saveDecisionButton');
    const message = $('decisionMessage');
    clearMessage(message);
    setBusy(button, true, 'Kaydediliyor');
    try {
      const records = await loadCoachRecordSet(student.id);
      throwIfError(await db.from('coach_decisions').insert({
        student_id: student.id,
        coach_id: state.user.id,
        decision_date: $('decisionDate').value,
        decision_type: $('decisionType').value,
        reason: $('decisionReason').value.trim(),
        next_hypothesis: $('decisionHypothesis').value.trim() || null,
        program_version: records.program?.version || latestProgram(student.programs)?.version || null
      }));
      $('decisionForm').reset();
      $('decisionDate').value = core.localDateISO();
      state.coachRecords.delete(student.id);
      await loadCoachDecisions();
      showMessage(message, 'Karar kaydedildi.', 'good');
    } catch (error) {
      showMessage(message, errorMessage(error, 'Karar kaydedilemedi'));
    } finally {
      setBusy(button, false);
    }
  }

  async function saveDecisionOutcome(button) {
    const item = button.closest('[data-decision]');
    const student = selectedStudent();
    if (!item || !student) return;
    setBusy(button, true, 'Kaydediliyor');
    try {
      const result = await db.from('coach_decisions').update({
        outcome: item.querySelector('[data-decision-outcome]').value.trim() || null
      }).eq('id', item.dataset.decision).eq('coach_id', state.user.id);
      throwIfError(result);
      state.coachRecords.delete(student.id);
      await loadCoachDecisions();
    } catch (error) {
      showMessage($('globalNotice'), errorMessage(error, 'Karar sonucu kaydedilemedi'));
    } finally {
      setBusy(button, false);
    }
  }

  async function loadStudentData(force = false) {
    if (!force && state.studentData) return state.studentData;
    clearMessage($('globalNotice'));
    try {
      const studentId = state.user.id;
      const [program, checkinsResult, sessionsResult, measurementsResult] = await Promise.all([
        fetchProgramBundle(studentId),
        db.from('checkins').select('id,student_id,checkin_date,energy,sleep,stress,motivation,pain,note,created_at').eq('student_id', studentId).order('created_at', { ascending: false }).limit(60),
        db.from('sessions').select('id,student_id,program_id,session_date,duration_min,session_rpe,performance,note,created_at').eq('student_id', studentId).order('session_date', { ascending: false }).limit(100),
        db.from('measurements').select('id,student_id,measured_at,metric,value,unit,note').eq('student_id', studentId).order('measured_at', { ascending: false })
      ]);
      state.studentData = {
        program,
        checkins: throwIfError(checkinsResult),
        sessions: throwIfError(sessionsResult),
        measurements: throwIfError(measurementsResult)
      };
      renderStudentToday();
      renderStudentProgram();
      renderStudentProgress();
      fillTodayCheckin();
      return state.studentData;
    } catch (error) {
      showMessage($('globalNotice'), errorMessage(error, 'Öğrenci verileri yüklenemedi'));
      return null;
    }
  }

  function renderProgramDay(day) {
    if (!day) return '<div class="empty">Program günü yok.</div>';
    return `<article class="program-day">
      <div class="program-day-head"><div><div class="label">GÜN ${esc(day.day_order)}</div><h3>${esc(day.title)}</h3></div></div>
      ${day.exercises?.length ? day.exercises.map(exercise => `
        <div class="exercise-row">
          <div><div class="exercise-adaptation">${esc(exercise.adaptation || 'Adaptasyon')}</div><strong>${esc(exercise.name)}</strong></div>
          <div class="exercise-dose">${esc(exercise.sets ?? '—')} × ${esc(exercise.reps || '—')}<br>${esc(exercise.load_text || '')}</div>
        </div>`).join('') : '<div class="empty">Bu güne egzersiz eklenmemiş.</div>'}
    </article>`;
  }

  function renderStudentToday() {
    const data = state.studentData;
    if (!data) return;
    const summary = core.progressSummary(data.sessions, data.measurements);
    const checkin = latestCheckin(data.checkins);
    const readiness = core.readinessScore(checkin);
    const nextDay = core.nextProgramDay(data.program, data.sessions);
    renderStats($('studentTodayStats'), [
      { label: 'Hazır oluş', value: readiness ?? '—', note: checkin ? relativeCheckin(checkin.checkin_date) : 'check-in yok' },
      { label: 'Seans', value: summary.sessionCount, note: 'son 30 gün' },
      { label: 'Süre', value: summary.duration, note: 'dakika' },
      { label: 'Program', value: data.program ? `v${data.program.version}` : '—', note: data.program?.target_adaptation || 'yayın yok' }
    ]);
    $('studentTodayWorkout').innerHTML = data.program
      ? `<h3>${esc(data.program.title)}</h3>${renderProgramDay(nextDay)}<div class="actions"><button class="ghost" type="button" data-student-open="studentProgram">Programı aç</button></div>`
      : '<div class="empty">Henüz yayınlanmış program yok.</div>';
    $('studentLatestCheckin').innerHTML = checkin
      ? `<div class="between"><h3>${readiness ?? '—'} / 100</h3><span class="tag">${esc(relativeCheckin(checkin.checkin_date))}</span></div>
         <div class="metric-grid spacer"><div class="metric"><span class="micro">ENERJİ</span><strong>${esc(checkin.energy ?? '—')}</strong></div><div class="metric"><span class="micro">UYKU</span><strong>${esc(checkin.sleep ?? '—')}</strong></div><div class="metric"><span class="micro">AĞRI</span><strong>${esc(checkin.pain ?? '—')}</strong></div></div>
         ${checkin.note ? `<div class="signal">${esc(checkin.note)}</div>` : ''}`
      : '<div class="empty">Bugün check-in yapmadın.</div><div class="actions"><button class="ghost" type="button" data-student-open="studentCheckin">Check-in yap</button></div>';
    $('studentToday').querySelectorAll('[data-student-open]').forEach(button => button.addEventListener('click', () => setView('studentNav', button.dataset.studentOpen)));
  }

  function renderStudentProgram() {
    const data = state.studentData;
    const element = $('studentProgramBody');
    const button = $('saveStudentSessionButton');
    if (!data) return;
    if (!data.program) {
      renderEmpty(element, 'Henüz yayınlanmış program yok.');
      button.disabled = true;
      return;
    }
    button.disabled = false;
    element.innerHTML = `<div class="card">
      <div class="between"><div><div class="label">HEDEF ADAPTASYON</div><h2>${esc(data.program.title)}</h2></div><span class="tag">v${esc(data.program.version)}</span></div>
      <p>${esc(data.program.target_adaptation || '—')}</p>
      ${data.program.hypothesis ? `<div class="signal">${esc(data.program.hypothesis)}</div>` : ''}
      <div class="spacer"></div>
      ${data.program.days?.length ? data.program.days.map(renderProgramDay).join('') : '<div class="empty">Program günleri henüz eklenmemiş.</div>'}
    </div>`;
  }

  function renderStudentProgress() {
    const data = state.studentData;
    if (!data) return;
    const summary = core.progressSummary(data.sessions, data.measurements);
    const readiness = core.readinessScore(latestCheckin(data.checkins));
    renderStats($('studentProgressStats'), [
      { label: 'Seans', value: summary.sessionCount, note: 'son 30 gün' },
      { label: 'Süre', value: summary.duration, note: 'dakika' },
      { label: 'Ort. RPE', value: summary.averageRpe ?? '—', note: 'son 30 gün' },
      { label: 'Hazır oluş', value: readiness ?? '—', note: 'son check-in' }
    ]);
    renderReadinessChart($('studentReadinessChart'), data.checkins);
    renderSessionList($('studentSessionList'), data.sessions);
    renderMeasurementList($('studentMeasurementList'), data.measurements);
  }

  function fillTodayCheckin() {
    const data = state.studentData;
    if (!data) return;
    const today = data.checkins.find(checkin => checkin.checkin_date === core.localDateISO());
    $('checkinEnergy').value = today?.energy ?? '';
    $('checkinSleep').value = today?.sleep ?? '';
    $('checkinStress').value = today?.stress ?? '';
    $('checkinMotivation').value = today?.motivation ?? '';
    $('checkinPain').value = today?.pain ?? '';
    $('checkinNote').value = today?.note ?? '';
  }

  async function saveCheckin(event) {
    event.preventDefault();
    const button = $('saveCheckinButton');
    const message = $('checkinMessage');
    clearMessage(message);
    setBusy(button, true, 'Kaydediliyor');
    try {
      const payload = {
        student_id: state.user.id,
        checkin_date: core.localDateISO(),
        energy: Number($('checkinEnergy').value),
        sleep: Number($('checkinSleep').value),
        stress: Number($('checkinStress').value),
        motivation: Number($('checkinMotivation').value),
        pain: Number($('checkinPain').value),
        note: $('checkinNote').value.trim() || null
      };
      throwIfError(await db.from('checkins').upsert(payload, { onConflict: 'student_id,checkin_date' }));
      state.studentData = null;
      await loadStudentData(true);
      showMessage(message, 'Bugünün check-in’i kaydedildi.', 'good');
    } catch (error) {
      showMessage(message, errorMessage(error, 'Check-in kaydedilemedi'));
    } finally {
      setBusy(button, false);
    }
  }

  async function saveStudentSession(event) {
    event.preventDefault();
    const data = state.studentData;
    if (!data?.program) return;
    const button = $('saveStudentSessionButton');
    const message = $('studentSessionMessage');
    clearMessage(message);
    setBusy(button, true, 'Kaydediliyor');
    try {
      throwIfError(await db.from('sessions').insert({
        student_id: state.user.id,
        program_id: data.program.id,
        session_date: core.localDateISO(),
        duration_min: numberOrNull($('studentSessionDuration').value),
        session_rpe: numberOrNull($('studentSessionRpe').value),
        performance: $('studentSessionPerformance').value || null,
        note: $('studentSessionNote').value.trim() || null
      }));
      $('studentSessionForm').reset();
      state.studentData = null;
      await loadStudentData(true);
      showMessage(message, 'Antrenman kaydedildi.', 'good');
    } catch (error) {
      showMessage(message, errorMessage(error, 'Antrenman kaydedilemedi'));
    } finally {
      setBusy(button, false);
    }
  }

  function bindEvents() {
    $('authForm').addEventListener('submit', async event => {
      event.preventDefault();
      const email = $('authEmail').value.trim();
      const button = $('magicLinkButton');
      const message = $('authMessage');
      clearMessage(message);
      if (!email) return showMessage(message, 'E-posta adresini yaz.');
      setBusy(button, true, 'Gönderiliyor');
      const result = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: APP_URL } });
      setBusy(button, false);
      if (result.error) return showMessage(message, errorMessage(result.error, 'Bağlantı gönderilemedi'));
      showMessage(message, 'Giriş bağlantısı gönderildi.', 'good');
    });

    $('logoutButton').addEventListener('click', async () => {
      setBusy($('logoutButton'), true, 'Çıkılıyor');
      const result = await db.auth.signOut();
      if (result.error) {
        setBusy($('logoutButton'), false);
        showMessage($('globalNotice'), errorMessage(result.error, 'Çıkış yapılamadı'));
        return;
      }
      location.assign(APP_URL);
    });

    ['coachNav', 'studentNav'].forEach(navId => {
      $(navId).addEventListener('click', event => {
        const button = event.target.closest('[data-view]');
        if (button) setView(navId, button.dataset.view);
      });
    });

    $('refreshCoachButton').addEventListener('click', () => loadCoachDashboard({ keepStudentId: state.selectedStudentId }));
    $('toggleLinkStudentButton').addEventListener('click', () => {
      const form = $('linkStudentForm');
      form.classList.toggle('hidden');
      clearMessage($('linkStudentMessage'));
      if (!form.classList.contains('hidden')) $('studentLinkInput').focus();
    });
    $('cancelLinkStudentButton').addEventListener('click', () => {
      $('linkStudentForm').classList.add('hidden');
      $('linkStudentForm').reset();
      $('studentLinkInput').value = '';
      clearMessage($('linkStudentMessage'));
    });
    $('linkStudentForm').addEventListener('submit', linkStudent);
    $('studentSearch').addEventListener('input', renderCoachStudents);
    $('studentFilter').addEventListener('change', renderCoachStudents);
    ['coachQueue', 'coachRecentCheckins', 'coachStudentList'].forEach(id => {
      $(id).addEventListener('click', event => {
        const target = event.target.closest('[data-student]');
        if (!target) return;
        setSelectedStudent(target.dataset.student);
        setView('coachNav', 'coachStudents');
      });
    });

    ['programStudentSelect', 'progressStudentSelect', 'decisionStudentSelect'].forEach(id => {
      $(id).addEventListener('change', event => {
        setSelectedStudent(event.target.value);
        if (id === 'progressStudentSelect') loadCoachProgress();
        if (id === 'decisionStudentSelect') loadCoachDecisions();
      });
    });

    $('programAdaptation').addEventListener('input', () => {
      const previous = state.programDraft.target_adaptation;
      const next = $('programAdaptation').value.trim();
      state.programDraft.target_adaptation = next;
      $('programDays').querySelectorAll('[data-field="adaptation"]').forEach(input => {
        if (!input.value.trim() || input.value.trim() === previous) input.value = next;
      });
    });

    $('addProgramDayButton').addEventListener('click', () => {
      syncProgramDraftFromDom();
      state.programDraft.days.push(core.blankDay(state.programDraft.days.length + 1, state.programDraft.target_adaptation));
      renderProgramDays();
    });

    $('programDays').addEventListener('click', event => {
      const action = event.target.closest('[data-action]');
      if (!action) return;
      syncProgramDraftFromDom();
      const dayElement = action.closest('[data-day-index]');
      const dayIndex = Number(dayElement?.dataset.dayIndex);
      if (action.dataset.action === 'add-exercise') {
        state.programDraft.days[dayIndex].exercises.push(core.blankExercise(state.programDraft.target_adaptation));
      }
      if (action.dataset.action === 'remove-day' && state.programDraft.days.length > 1) {
        state.programDraft.days.splice(dayIndex, 1);
      }
      if (action.dataset.action === 'remove-exercise') {
        const exerciseElement = action.closest('[data-exercise-index]');
        const exerciseIndex = Number(exerciseElement?.dataset.exerciseIndex);
        if (state.programDraft.days[dayIndex].exercises.length > 1) state.programDraft.days[dayIndex].exercises.splice(exerciseIndex, 1);
      }
      renderProgramDays();
    });

    $('programForm').addEventListener('submit', publishProgram);
    $('measurementForm').addEventListener('submit', saveMeasurement);
    $('coachSessionForm').addEventListener('submit', saveCoachSession);
    $('decisionForm').addEventListener('submit', saveDecision);
    $('decisionList').addEventListener('click', event => {
      const button = event.target.closest('[data-save-decision-outcome]');
      if (button) saveDecisionOutcome(button);
    });
    $('checkinForm').addEventListener('submit', saveCheckin);
    $('studentSessionForm').addEventListener('submit', saveStudentSession);
    $('copyStudentLinkCodeButton').addEventListener('click', copyStudentLinkCode);
  }

  async function init() {
    bindEvents();
    const today = core.localDateISO();
    $('measurementDate').value = today;
    $('coachSessionDate').value = today;
    $('decisionDate').value = today;
    renderProgramDays();

    db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setSignedOut();
      else if (session?.user && session.user.id !== state.user?.id) setTimeout(() => boot(session), 0);
    });

    const result = await db.auth.getSession();
    if (result.error) {
      showMessage($('authMessage'), errorMessage(result.error, 'Oturum okunamadı'));
      return;
    }
    if (result.data.session) await boot(result.data.session);
    else setSignedOut();
  }

  init();
})();
