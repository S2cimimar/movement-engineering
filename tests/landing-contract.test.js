const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('public homepage uses production domain and core navigation', () => {
  const html = read('index.html');
  assert.match(html, /https:\/\/movementmind\.com\.tr\//);
  assert.doesNotMatch(html, /s2cimimar\.github\.io/i);
  assert.match(html, /movement-mind-online\.html/);
  assert.match(html, /Beden tekrar etmez\.<br>Yanıt verir\./);
  assert.match(html, /movement-mind-nutrition\.html/);
  assert.match(html, /\/blog\//);
  assert.match(html, /\/yaklasim\//);
  assert.match(html, /\/online-kocluk\//);
  assert.match(html, /assets\/movement-mind-anatomy\.jpg/);
});

test('public homepage keeps Movement Mind decision sequence', () => {
  const html = read('index.html');
  for (const term of ['Adaptasyon', 'Egzersiz', 'Doz', 'Yanıt', 'Karar']) assert.match(html, new RegExp(term));
});

test('blog and approach preserve the editorial thesis', () => {
  const blog = read('blog/index.html');
  const approach = read('yaklasim/index.html');
  const essay = read('blog/hareket-programdan-once/index.html');
  assert.match(blog, /Programdan önce ne vardır\?/);
  assert.match(approach, /Hareketin<br>aklı\./);
  assert.match(essay, /İyi program, geleceği bilen program değildir/);
});

test('online coaching page contains a controlled application form', () => {
  const html = read('online-kocluk/index.html');
  assert.match(html, /coaching-application/);
  assert.match(html, /Başvuruyu gönder/);
  assert.match(html, /otomatik üyelik açmaz/i);
});
