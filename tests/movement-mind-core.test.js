const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../assets/movement-mind-core.js');

test('readiness combines positive signals, inverse stress and pain', () => {
  assert.equal(core.readinessScore({ energy: 5, sleep: 5, motivation: 5, stress: 1, pain: 0 }), 100);
  assert.equal(core.readinessScore({ energy: 3, sleep: 3, motivation: 3, stress: 3, pain: 0 }), 60);
  assert.equal(core.readinessScore({ energy: 3, sleep: 3, motivation: 3, stress: 3, pain: 3 }), 25);
  assert.equal(core.readinessScore(null), null);
});

test('attention prioritizes pain and renewal without hiding other signals', () => {
  const student = {
    relationshipStatus: 'active',
    checkins: [{ checkin_date: '2026-09-13', created_at: '2026-09-13T07:00:00Z', energy: 4, sleep: 4, motivation: 4, stress: 2, pain: 2 }],
    programs: [{ status: 'published', version: 1 }],
    studentProfile: { renewal_date: '2026-09-18', package_sessions: 8, used_sessions: 7 }
  };
  const signals = core.attentionSignals(student, '2026-09-13');
  assert.equal(signals[0].code, 'pain');
  assert.deepEqual(new Set(signals.map(signal => signal.code)), new Set(['pain', 'renewal', 'sessions-low']));
});

test('program validation enforces adaptation then exercise then dose', () => {
  const draft = core.blankProgramDraft('Maksimal kuvvet');
  draft.title = 'Kuvvet 01';
  let errors = core.validateProgramDraft(draft);
  assert.ok(errors.some(error => error.includes('egzersiz eksik')));
  assert.ok(errors.some(error => error.includes('doz eksik')));

  Object.assign(draft.days[0].exercises[0], {
    name: 'Back Squat',
    sets: 4,
    reps: '4–6',
    load_text: 'RIR 2'
  });
  errors = core.validateProgramDraft(draft);
  assert.deepEqual(errors, []);
});

test('next program day follows completed sessions for the same program', () => {
  const program = {
    id: 'p1',
    days: [
      { id: 'd2', day_order: 2 },
      { id: 'd1', day_order: 1 },
      { id: 'd3', day_order: 3 }
    ]
  };
  assert.equal(core.nextProgramDay(program, []).id, 'd1');
  assert.equal(core.nextProgramDay(program, [{ program_id: 'p1' }]).id, 'd2');
  assert.equal(core.nextProgramDay(program, [{ program_id: 'old' }, { program_id: 'p1' }, { program_id: 'p1' }]).id, 'd3');
  assert.equal(core.nextProgramDay(program, [{ program_id: 'p1' }, { program_id: 'p1' }, { program_id: 'p1' }]).id, 'd1');
});

test('progress summary uses the requested window and numeric RPE values', () => {
  const summary = core.progressSummary([
    { session_date: '2026-09-13', duration_min: 50, session_rpe: 7 },
    { session_date: '2026-09-01', duration_min: 40, session_rpe: 6 },
    { session_date: '2026-07-01', duration_min: 90, session_rpe: 10 }
  ], [
    { metric: 'Ağırlık', value: 80, measured_at: '2026-09-01T12:00:00Z' },
    { metric: 'Ağırlık', value: 79, measured_at: '2026-08-01T12:00:00Z' }
  ], 30, '2026-09-13');
  assert.equal(summary.sessionCount, 2);
  assert.equal(summary.duration, 90);
  assert.equal(summary.averageRpe, 6.5);
  assert.equal(summary.latestMeasurements.Ağırlık.value, 80);
});
