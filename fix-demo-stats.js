const fs = require('node:fs');
const path = 'C:/Users/orest/Desktop/PAPA/MedicalPlatform/igor.html';
let html = fs.readFileSync(path, 'utf8');
let changed = 0;
function replaceRe(re, to, label) {
  if (!re.test(html)) throw new Error('Block not found: ' + label);
  html = html.replace(re, to);
  changed += 1;
}
replaceRe(
  /\s*<div class="hstat"><b class="count" data-to="4218">0<\/b><span>врачей в сети<\/span><\/div>\s*<div class="hstat"><b><span class="count" data-to="11">0<\/span> мин<\/b><span>среднее ожидание<\/span><\/div>\s*<div class="hstat"><b class="count" data-to="4\.9" data-dec="1">0<\/b><span>рейтинг пациентов<\/span><\/div>/,
  '\n        <div class="hstat"><b>Демо</b><span>стенд для заказчика</span></div>\n        <div class="hstat"><b>24/7</b><span>доступ к кабинету</span></div>\n        <div class="hstat"><b>4,9</b><span>демо-рейтинг каталога</span></div>',
  'hero static stats'
);
replaceRe(
  /\s*const b = heroStats\[0\]\.querySelector\("b"\); if \(b\) b\.textContent = String\(doctors\.length\);\s*const s = heroStats\[0\]\.querySelector\("span:last-child"\); if \(s\) s\.textContent = "врачей в каталоге";\s*}\s*if \(heroStats\[1\]\) heroStats\[1\]\.innerHTML = '<b>24\/7<\/b><span>доступ к кабинету<\/span>';\s*if \(heroStats\[2\]\) heroStats\[2\]\.innerHTML = `<b>\$\{avg\.toFixed\(1\)\}<\/b><span>средний рейтинг каталога<\/span>`;/,
  '\n      heroStats[0].innerHTML = `<b>${doctors.length}</b><span>демо-врача в каталоге</span>`;\n    }\n    if (heroStats[1]) heroStats[1].innerHTML = \'<b>24/7</b><span>доступ к кабинету</span>\';\n    if (heroStats[2]) heroStats[2].innerHTML = `<b>${avg.toFixed(1).replace(\'.\', \',\')}</b><span>демо-рейтинг каталога</span>`;',
  'hero dynamic stats'
);
replaceRe(
  /\s*<div class="metric"><b class="count" data-to="4218">0<\/b><span>врачей с проверенными дипломами<\/span><\/div>\s*<div class="metric"><b><span class="count" data-to="96">0<\/span>%<\/b><span>пациентов возвращаются повторно<\/span><\/div>\s*<div class="metric"><b><span class="count" data-to="11">0<\/span> мин<\/b><span>средний ответ врача на запрос<\/span><\/div>\s*<div class="metric"><b>24\/7<\/b><span>и ни одной очереди — вообще<\/span><\/div>/,
  '\n      <div class="metric"><b>4</b><span>демо-профиля врачей в каталоге</span></div>\n      <div class="metric"><b>LiveKit</b><span>заготовка защищённой видеосвязи</span></div>\n      <div class="metric"><b>11 мин</b><span>пример слота ожидания в демо</span></div>\n      <div class="metric"><b>24/7</b><span>доступ к личному кабинету</span></div>',
  'quote metrics'
);
fs.writeFileSync(path, html, 'utf8');
console.log(`updated ${changed} blocks`);
