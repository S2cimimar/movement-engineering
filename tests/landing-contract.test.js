'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('public landing uses the production domain', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/movementmind\.com\.tr\/">/);
  assert.doesNotMatch(html, /s2cimimar\.github\.io/i);
});

test('public landing exposes the live coaching app', () => {
  assert.match(html, /href="\/movement-mind-online\.html"/);
  assert.match(html, /Adaptasyonu programın önüne koyan sade koçluk sistemi\./);
});

test('public landing keeps the nutrition tool reachable', () => {
  assert.match(html, /href="\/movement-mind-nutrition\.html"/);
});

test('public landing carries the Movement Mind decision sequence', () => {
  for (const phrase of ['Hedef adaptasyon', 'Egzersiz', 'Doz', 'Geri bildirim', 'Karar']) {
    assert.ok(html.includes(phrase), `${phrase} eksik`);
  }
});
