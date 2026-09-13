function createFakeSupabase(role = 'coach') {
  const date = new Date();
  const iso = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const coachId = '643514cd-cca8-41f3-b380-8eb6731ce4db';
  const studentId = 'aba586f0-5ebc-4ea6-98eb-4d30a1489ea4';
  const unlinkedStudentId = 'a9a3e421-d923-43d7-993d-92aefdd13203';
  let serial = 20;
  const rows = {
    profiles: [
      { id: coachId, full_name: 'Can', role: 'coach' },
      { id: studentId, full_name: 'Deniz Öğrenci', role: 'student' },
      { id: unlinkedStudentId, full_name: 'Ece Öğrenci', role: 'student' }
    ],
    coach_students: [{ student_id: studentId, coach_id: coachId, status: 'active', assigned_at: `${iso}T08:00:00Z` }],
    student_profiles: [{ student_id: studentId, main_goal: 'Temel kuvvet', weekly_sessions: 3, session_duration: 60, package_sessions: 12, used_sessions: 4, renewal_date: iso }],
    programs: [{ id: 'program-1', student_id: studentId, coach_id: coachId, version: 1, title: 'Kuvvet Temeli', target_adaptation: 'Temel kuvvet', hypothesis: 'Kontrollü yük artışı', status: 'published', created_at: `${iso}T08:00:00Z`, published_at: `${iso}T08:00:00Z` }],
    program_days: [{ id: 'day-1', program_id: 'program-1', day_order: 1, title: 'Tam Vücut A' }],
    program_exercises: [{ id: 'exercise-1', day_id: 'day-1', exercise_order: 1, name: 'Goblet Squat', adaptation: 'Kuvvet', sets: 3, reps: '8', load_text: 'RIR 2' }],
    checkins: [{ id: 'checkin-1', student_id: studentId, checkin_date: iso, energy: 4, sleep: 4, stress: 2, motivation: 4, pain: 0, note: 'İyi', created_at: `${iso}T07:00:00Z` }],
    sessions: [],
    measurements: [],
    coach_decisions: []
  };

  class Query {
    constructor(table) {
      this.table = table;
      this.operation = 'select';
      this.filters = [];
      this.orders = [];
      this.max = null;
      this.payload = null;
      this.returning = false;
      this.one = false;
    }

    select() { this.returning = true; return this; }
    insert(payload) { this.operation = 'insert'; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
    upsert(payload) { this.operation = 'upsert'; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
    update(payload) { this.operation = 'update'; this.payload = payload; return this; }
    delete() { this.operation = 'delete'; return this; }
    eq(field, value) { this.filters.push(row => row[field] === value); return this; }
    neq(field, value) { this.filters.push(row => row[field] !== value); return this; }
    in(field, values) { this.filters.push(row => values.includes(row[field])); return this; }
    gte(field, value) { this.filters.push(row => String(row[field] || '') >= String(value)); return this; }
    order(field, options = {}) { this.orders.push({ field, ascending: options.ascending !== false }); return this; }
    limit(value) { this.max = value; return this; }
    single() { this.one = true; return this; }
    maybeSingle() { this.one = true; return this; }
    then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }

    filtered() {
      let result = [...(rows[this.table] || [])].filter(row => this.filters.every(filter => filter(row)));
      for (const order of this.orders) {
        result.sort((a, b) => String(a[order.field] ?? '').localeCompare(String(b[order.field] ?? '')) * (order.ascending ? 1 : -1));
      }
      if (this.max !== null) result = result.slice(0, this.max);
      return result;
    }

    run() {
      if (this.operation === 'select') {
        const result = this.filtered();
        return { data: this.one ? (result[0] || null) : result, error: null };
      }
      if (this.operation === 'insert') {
        const created = this.payload.map(item => ({ ...item, id: item.id || `${this.table}-${++serial}`, created_at: item.created_at || new Date().toISOString() }));
        rows[this.table].push(...created);
        return { data: this.returning ? (this.one ? created[0] : created) : null, error: null };
      }
      if (this.operation === 'upsert') {
        const result = [];
        for (const item of this.payload) {
          const keys = this.table === 'checkins'
            ? ['student_id', 'checkin_date']
            : this.table === 'coach_students'
              ? ['coach_id', 'student_id']
              : ['student_id'];
          let existing = rows[this.table].find(row => keys.every(key => row[key] === item[key]));
          if (existing) Object.assign(existing, item, { created_at: existing.created_at || new Date().toISOString() });
          else {
            existing = { ...item, id: `${this.table}-${++serial}`, created_at: new Date().toISOString() };
            rows[this.table].push(existing);
          }
          result.push(existing);
        }
        return { data: this.returning ? (this.one ? result[0] : result) : null, error: null };
      }
      const targets = this.filtered();
      if (this.operation === 'update') targets.forEach(row => Object.assign(row, this.payload));
      if (this.operation === 'delete') rows[this.table] = rows[this.table].filter(row => !targets.includes(row));
      return { data: this.returning ? (this.one ? (targets[0] || null) : targets) : null, error: null };
    }
  }

  const userId = role === 'coach' ? coachId : studentId;
  const client = {
    from(table) { return new Query(table); },
    auth: {
      getSession: async () => ({ data: { session: { user: { id: userId, email: `${role}@example.com` } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      signOut: async () => ({ error: null })
    }
  };
  return { client, rows, coachId, studentId, unlinkedStudentId, iso };
}

module.exports = { createFakeSupabase };
