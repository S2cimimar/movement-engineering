const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../assets/movement-mind-core.js');
const { createFakeSupabase } = require('./helpers/fake-supabase.cjs');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'movement-mind-online.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const app = fs.readFileSync(path.join(root, 'assets/movement-mind-v1.js'), 'utf8');

async function waitFor(predicate, message, timeout = 2500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

async function createApp(role) {
  const { Window } = await import('happy-dom');
  const window = new Window({ url: 'https://s2cimimar.github.io/movement-engineering/movement-mind-online.html' });
  const fake = createFakeSupabase(role);
  window.document.write(html);
  window.MovementMindCore = core;
  window.supabase = { createClient: () => fake.client };
  window.console = console;
  window.eval(app);
  await waitFor(() => !window.document.getElementById(role === 'coach' ? 'coachApp' : 'studentApp').classList.contains('hidden'), `${role} app did not boot`);
  return { window, document: window.document, fake };
}

function submit(window, form) {
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

test('coach can navigate all five screens and publish an adaptation-led program', async () => {
  const { window, document, fake } = await createApp('coach');
  assert.equal(document.querySelectorAll('#coachNav [data-view]').length, 5);
  assert.match(document.getElementById('coachQueue').textContent, /Deniz Öğrenci/);

  document.querySelector('[data-view="coachProgram"]').click();
  document.getElementById('programTitle').value = 'Kuvvet V2';
  document.getElementById('programAdaptation').value = 'Maksimal kuvvet';
  document.getElementById('programAdaptation').dispatchEvent(new window.Event('input', { bubbles: true }));
  document.querySelector('[data-field="name"]').value = 'Back Squat';
  document.querySelector('[data-field="load_text"]').value = 'RIR 2';
  document.getElementById('addProgramDayButton').click();
  const secondDay = document.querySelectorAll('.builder-day')[1];
  secondDay.querySelector('[data-field="name"]').value = 'Romanian Deadlift';
  secondDay.querySelector('[data-field="load_text"]').value = 'RIR 2';
  submit(window, document.getElementById('programForm'));
  await waitFor(() => document.getElementById('programMessage').textContent.includes('Program v2 yayınlandı.'), 'program was not published');

  const published = fake.rows.programs.find(program => program.version === 2);
  assert.equal(published.status, 'published');
  assert.equal(fake.rows.program_days.filter(day => day.program_id === published.id).length, 2);
  assert.equal(fake.rows.program_exercises.at(-1).adaptation, 'Maksimal kuvvet');

  for (const view of ['coachToday', 'coachStudents', 'coachProgram', 'coachProgress', 'coachDecisions']) {
    document.querySelector(`[data-view="${view}"]`).click();
    assert.equal(document.getElementById(view).classList.contains('hidden'), false);
  }
  await window.happyDOM.abort();
});

test('coach can save progress data and a decision', async () => {
  const { window, document, fake } = await createApp('coach');
  document.querySelector('[data-view="coachProgress"]').click();
  await waitFor(() => !document.getElementById('coachReadinessChart').textContent.includes('skeleton'), 'progress did not load');

  document.getElementById('measurementMetric').value = 'Vücut ağırlığı';
  document.getElementById('measurementValue').value = '80';
  document.getElementById('measurementUnit').value = 'kg';
  submit(window, document.getElementById('measurementForm'));
  await waitFor(() => document.getElementById('measurementMessage').textContent.includes('Ölçüm kaydedildi.'), 'measurement was not saved');
  assert.equal(fake.rows.measurements.at(-1).value, 80);

  document.querySelector('[data-view="coachDecisions"]').click();
  document.getElementById('decisionReason').value = 'Doz iyi tolere edildi.';
  submit(window, document.getElementById('decisionForm'));
  await waitFor(() => document.getElementById('decisionMessage').textContent.includes('Karar kaydedildi.'), 'decision was not saved');
  assert.equal(fake.rows.coach_decisions.at(-1).decision_type, 'progress');
  await window.happyDOM.abort();
});

test('coach can link a student and manage the relationship status', async () => {
  const { window, document, fake } = await createApp('coach');
  document.querySelector('[data-view="coachStudents"]').click();
  document.getElementById('toggleLinkStudentButton').click();
  document.getElementById('studentLinkInput').value = fake.unlinkedStudentId;
  submit(window, document.getElementById('linkStudentForm'));
  await waitFor(() => document.getElementById('linkStudentMessage').textContent.includes('Öğrenci bağlandı.'), 'student was not linked');
  assert.equal(fake.rows.coach_students.find(row => row.student_id === fake.unlinkedStudentId).status, 'active');
  assert.match(document.getElementById('coachStudentList').textContent, /Ece Öğrenci/);

  document.querySelector(`[data-student="${fake.studentId}"]`).click();
  document.getElementById('relationshipStatusSelect').value = 'paused';
  submit(window, document.getElementById('studentRelationshipForm'));
  await waitFor(() => document.getElementById('globalNotice').textContent.includes('durumu güncellendi'), 'relationship status was not updated');
  assert.equal(fake.rows.coach_students.find(row => row.student_id === fake.studentId).status, 'paused');
  assert.equal(document.getElementById('saveStudentProfileButton').disabled, true);
  await window.happyDOM.abort();
});

test('student has four simple screens and can save check-in and session', async () => {
  const { window, document, fake } = await createApp('student');
  assert.equal(document.querySelectorAll('#studentNav [data-view]').length, 4);
  assert.match(document.getElementById('studentProgramBody').textContent, /Kuvvet Temeli/);

  document.querySelector('[data-view="studentCheckin"]').click();
  assert.equal(document.getElementById('studentLinkCode').value, fake.studentId);
  document.getElementById('checkinEnergy').value = '5';
  document.getElementById('checkinSleep').value = '4';
  document.getElementById('checkinStress').value = '2';
  document.getElementById('checkinMotivation').value = '5';
  document.getElementById('checkinPain').value = '0';
  submit(window, document.getElementById('checkinForm'));
  await waitFor(() => document.getElementById('checkinMessage').textContent.includes('kaydedildi'), 'check-in was not saved');
  assert.equal(fake.rows.checkins[0].energy, 5);

  document.querySelector('[data-view="studentProgram"]').click();
  document.getElementById('studentSessionDuration').value = '55';
  document.getElementById('studentSessionRpe').value = '7';
  submit(window, document.getElementById('studentSessionForm'));
  await waitFor(() => document.getElementById('studentSessionMessage').textContent.includes('Antrenman kaydedildi.'), 'session was not saved');
  assert.equal(fake.rows.sessions.at(-1).duration_min, 55);
  await window.happyDOM.abort();
});
