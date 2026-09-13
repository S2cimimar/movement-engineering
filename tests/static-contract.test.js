const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'movement-mind-online.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets/movement-mind-v1.js'), 'utf8');

test('all static element lookups exist and IDs are unique', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML contains duplicate IDs');

  const lookups = [...app.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
  const dynamicIds = [...app.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const declaredIds = new Set([...ids, ...dynamicIds]);
  const missing = [...new Set(lookups)].filter(id => !declaredIds.has(id));
  assert.deepEqual(missing, [], `Missing static IDs: ${missing.join(', ')}`);
});

test('coach and student v1 navigation contracts are present', () => {
  for (const view of ['coachToday', 'coachStudents', 'coachProgram', 'coachProgress', 'coachDecisions']) {
    assert.match(html, new RegExp(`data-view="${view}"`));
    assert.match(html, new RegExp(`id="${view}"`));
  }
  for (const view of ['studentToday', 'studentProgram', 'studentProgress', 'studentCheckin']) {
    assert.match(html, new RegExp(`data-view="${view}"`));
    assert.match(html, new RegExp(`id="${view}"`));
  }
});

test('browser dependency is pinned and no privileged Supabase key is embedded', () => {
  assert.match(html, /@supabase\/supabase-js@2\.116\.0/);
  assert.doesNotMatch(html + app, /service_role|sb_secret_/i);
  assert.match(app, /sb_publishable_/);
});

test('application uses the existing Supabase schema contract', () => {
  for (const table of [
    'profiles', 'coach_students', 'student_profiles', 'programs', 'program_days',
    'program_exercises', 'checkins', 'measurements', 'sessions', 'coach_decisions'
  ]) assert.match(app, new RegExp(`from\\('${table}'\\)`));
});
