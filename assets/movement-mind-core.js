(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MovementMindCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function localDateISO(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dateAtNoon(value) {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysFromToday(value, today = localDateISO()) {
    const target = dateAtNoon(value);
    const origin = dateAtNoon(today);
    if (!target || !origin) return null;
    return Math.round((target.getTime() - origin.getTime()) / 86400000);
  }

  function readinessScore(checkin) {
    if (!checkin) return null;
    const positive = [checkin.energy, checkin.sleep, checkin.motivation]
      .map(Number)
      .filter(value => Number.isFinite(value) && value >= 1 && value <= 5);
    const stress = Number(checkin.stress);
    if (Number.isFinite(stress) && stress >= 1 && stress <= 5) positive.push(6 - stress);
    if (!positive.length) return null;
    const base = positive.reduce((sum, value) => sum + value, 0) / positive.length / 5 * 100;
    const painPenalty = [0, 5, 18, 35][clamp(Number(checkin.pain) || 0, 0, 3)];
    return Math.round(clamp(base - painPenalty, 0, 100));
  }

  function latestBy(items, field) {
    return [...(items || [])].sort((a, b) => String(b[field] || '').localeCompare(String(a[field] || '')))[0] || null;
  }

  function attentionSignals(student, today = localDateISO()) {
    const signals = [];
    const latestCheckin = latestBy(student.checkins, 'created_at');
    const latestProgram = [...(student.programs || [])]
      .filter(program => program.status === 'published')
      .sort((a, b) => Number(b.version) - Number(a.version))[0] || null;
    const profile = student.studentProfile || {};
    const relationshipStatus = student.relationshipStatus || 'active';

    if (relationshipStatus !== 'active') {
      signals.push({ level: 1, code: 'inactive', text: relationshipStatus === 'paused' ? 'İlişki donduruldu' : 'İlişki sona erdi' });
      return signals;
    }

    if (latestCheckin) {
      const score = readinessScore(latestCheckin);
      if (Number(latestCheckin.pain) >= 2) signals.push({ level: 3, code: 'pain', text: 'Ağrı sinyali yüksek' });
      else if (score !== null && score < 45) signals.push({ level: 3, code: 'readiness', text: `Hazır oluş ${score}` });
      else if (score !== null && score < 65) signals.push({ level: 2, code: 'readiness', text: `Hazır oluş ${score}` });

      const age = daysFromToday(latestCheckin.checkin_date, today);
      if (age !== null && age < -3) signals.push({ level: 2, code: 'stale-checkin', text: `${Math.abs(age)} gündür check-in yok` });
    } else {
      signals.push({ level: 2, code: 'no-checkin', text: 'Henüz check-in yok' });
    }

    const renewal = daysFromToday(profile.renewal_date, today);
    if (renewal !== null && renewal >= 0 && renewal <= 14) {
      signals.push({ level: renewal <= 7 ? 3 : 2, code: 'renewal', text: `Yenilemeye ${renewal} gün` });
    } else if (renewal !== null && renewal < 0) {
      signals.push({ level: 3, code: 'renewal-overdue', text: 'Yenileme tarihi geçti' });
    }

    const pack = Number(profile.package_sessions) || 0;
    const used = Number(profile.used_sessions) || 0;
    if (pack > 0 && Math.max(0, pack - used) <= 2) {
      signals.push({ level: 2, code: 'sessions-low', text: `${Math.max(0, pack - used)} ders kaldı` });
    }

    if (!latestProgram) signals.push({ level: 2, code: 'no-program', text: 'Yayınlanmış program yok' });
    return signals.sort((a, b) => b.level - a.level);
  }

  function attentionRank(student, today = localDateISO()) {
    return attentionSignals(student, today).reduce((sum, signal) => sum + signal.level, 0);
  }

  function blankExercise(adaptation = '') {
    return {
      adaptation,
      name: '',
      sets: 3,
      reps: '8–10',
      load_text: '',
      target_rir: null,
      rest_seconds: null,
      tempo: '',
      notes: ''
    };
  }

  function blankDay(order = 1, adaptation = '') {
    return { title: `Gün ${order}`, exercises: [blankExercise(adaptation)] };
  }

  function blankProgramDraft(adaptation = '') {
    return {
      title: '',
      target_adaptation: adaptation,
      hypothesis: '',
      days: [blankDay(1, adaptation)]
    };
  }

  function validateProgramDraft(draft) {
    const errors = [];
    if (!String(draft?.target_adaptation || '').trim()) errors.push('Hedef adaptasyonu yaz.');
    if (!String(draft?.title || '').trim()) errors.push('Program adını yaz.');
    if (!Array.isArray(draft?.days) || !draft.days.length) errors.push('En az bir gün ekle.');

    (draft?.days || []).forEach((day, dayIndex) => {
      if (!String(day.title || '').trim()) errors.push(`${dayIndex + 1}. günün adını yaz.`);
      if (!Array.isArray(day.exercises) || !day.exercises.length) {
        errors.push(`${dayIndex + 1}. güne en az bir egzersiz ekle.`);
        return;
      }
      day.exercises.forEach((exercise, exerciseIndex) => {
        const place = `${dayIndex + 1}. gün / ${exerciseIndex + 1}. egzersiz`;
        if (!String(exercise.adaptation || '').trim()) errors.push(`${place}: adaptasyon eksik.`);
        if (!String(exercise.name || '').trim()) errors.push(`${place}: egzersiz eksik.`);
        const sets = Number(exercise.sets);
        if (!Number.isInteger(sets) || sets < 1 || sets > 20) errors.push(`${place}: set 1–20 olmalı.`);
        if (!String(exercise.reps || '').trim()) errors.push(`${place}: tekrar veya süre eksik.`);
        if (!String(exercise.load_text || '').trim()) errors.push(`${place}: doz eksik.`);
      });
    });
    return errors;
  }

  function nextProgramDay(program, sessions) {
    const days = [...(program?.days || [])].sort((a, b) => Number(a.day_order) - Number(b.day_order));
    if (!days.length) return null;
    const completed = (sessions || []).filter(session => session.program_id === program.id).length;
    return days[completed % days.length];
  }

  function progressSummary(sessions, measurements, days = 30, today = localDateISO()) {
    const cutoff = dateAtNoon(today);
    if (cutoff) cutoff.setDate(cutoff.getDate() - Math.max(0, days - 1));
    const recentSessions = (sessions || []).filter(session => {
      const date = dateAtNoon(session.session_date);
      return date && cutoff && date >= cutoff;
    });
    const rpes = recentSessions.map(session => Number(session.session_rpe)).filter(Number.isFinite);
    const duration = recentSessions.reduce((sum, session) => sum + (Number(session.duration_min) || 0), 0);
    const latestMeasurements = {};
    [...(measurements || [])]
      .sort((a, b) => String(b.measured_at || '').localeCompare(String(a.measured_at || '')))
      .forEach(item => {
        if (!latestMeasurements[item.metric]) latestMeasurements[item.metric] = item;
      });
    return {
      sessionCount: recentSessions.length,
      averageRpe: rpes.length ? Math.round(rpes.reduce((sum, value) => sum + value, 0) / rpes.length * 10) / 10 : null,
      duration,
      latestMeasurements
    };
  }

  return {
    attentionRank,
    attentionSignals,
    blankDay,
    blankExercise,
    blankProgramDraft,
    daysFromToday,
    latestBy,
    localDateISO,
    nextProgramDay,
    progressSummary,
    readinessScore,
    validateProgramDraft
  };
});
