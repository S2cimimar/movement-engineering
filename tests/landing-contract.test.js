const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
test('public homepage contract',()=>{const html=read('index.html');assert.match(html,/movementmind\.com\.tr/);assert.doesNotMatch(html,/s2cimimar\.github\.io/i);assert.match(html,/movement-mind-online\.html/);assert.match(html,/Beden tekrar etmez\.<br>Yanıt verir\./);assert.match(html,/movement-mind-nutrition\.html/);assert.match(html,/\/blog\//);assert.match(html,/\/yaklasim\//);assert.match(html,/\/online-kocluk\//);assert.match(html,/movement-mind-anatomy\.jpg/);for(const term of ['Adaptasyon','Egzersiz','Doz','Yanıt','Karar'])assert.match(html,new RegExp(term));});
test('editorial pages contract',()=>{assert.match(read('blog/index.html'),/Programdan önce ne vardır\?/);assert.match(read('yaklasim/index.html'),/Hareketin<br>aklı\./);assert.match(read('blog/hareket-programdan-once/index.html'),/İyi program, geleceği bilen program değildir/);});
test('coaching application contract',()=>{const html=read('online-kocluk/index.html');assert.match(html,/coaching-application/);assert.match(html,/Başvuruyu gönder/);assert.match(html,/otomatik üyelik açmaz/i);});
