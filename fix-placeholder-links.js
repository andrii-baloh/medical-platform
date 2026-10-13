const fs = require('node:fs');
const path = 'C:/Users/orest/Desktop/PAPA/MedicalPlatform/igor.html';
const backup = 'C:/Users/orest/Desktop/PAPA/MedicalPlatform/igor.backup-before-placeholder-links-20261012.html';
fs.copyFileSync(path, backup);
let text = fs.readFileSync(path, 'utf8');
const replacements = [
  ['<a class="logo" href="#">', '<a class="logo" href="/">'],
  ['<a href="#">Врачам</a>', '<a href="/doctor">Врачам</a>'],
  ['<a href="#">Клиникам</a>', '<a href="/support">Клиникам</a>'],
  ['<a href="#">Контакты</a>', '<a href="/support">Контакты</a>'],
  ['<a href="#">Лицензия</a>', '<a href="/documents">Лицензия</a>'],
  ['<a href="#">Политика конфиденциальности</a>', '<a href="/documents">Политика конфиденциальности</a>'],
  ['<a href="#">Пользовательское соглашение</a>', '<a href="/documents">Пользовательское соглашение</a>'],
  ['<a href="#">Оферта</a>', '<a href="/documents">Оферта</a>'],
];
for (const [from, to] of replacements) {
  if (!text.includes(from)) throw new Error(`Missing link pattern: ${from}`);
  text = text.replace(from, to);
}
fs.writeFileSync(path, text, 'utf8');
console.log('PATCHED placeholder links');
console.log(`BACKUP ${backup}`);
