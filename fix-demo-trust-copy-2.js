const fs = require('fs');
const path = 'igor.html';
const backup = 'igor.backup-before-demo-trust-copy-2-20261012.html';
let s = fs.readFileSync(path, 'utf8');
if (!fs.existsSync(backup)) fs.writeFileSync(backup, s, 'utf8');
const replacements = [
  ['<span class="tb-r">Защищённая медицинская платформа</span>', '<span class="tb-r">Проверка клиентского сценария</span>'],
  ['<span class="tb-r">Москва <b id="nowTime">--:--</b> · врачей онлайн: <b id="docsOnline">—</b></span>', '<span class="tb-r">Москва <b id="nowTime">--:--</b> · режим: <b id="docsOnline">демо</b></span>'],
  ['<div class="kicker">Телемедицина · защищённая платформа · 24/7</div>', '<div class="kicker">Демо телемедицинской платформы · заказчику</div>'],
  ['<h1>Забота, которая <em>всегда</em> на&nbsp;связи<svg class="ecg h1wave" data-cycles="1" data-w="140" data-h="44" viewBox="0 0 140 44" aria-hidden="true"><path class="e-base"/><path class="e-run"/></svg></h1>', '<h1>Понятный путь пациента <em>от выбора врача до видеоприёма</em><svg class="ecg h1wave" data-cycles="1" data-w="140" data-h="44" viewBox="0 0 140 44" aria-hidden="true"><path class="e-base"/><path class="e-run"/></svg></h1>'],
  ['<p class="hero-sub">Выберите врача, свободное время и профиль пациента. Видеоприём, медицинские документы и заключения доступны в одном защищённом кабинете.</p>', '<p class="hero-sub">Демонстрационная версия показывает будущий клиентский сценарий: выбор специалиста, свободного времени, видеоприём и личный кабинет пациента. Реальные врачи и документы будут подключены после настройки сервиса.</p>'],
  ['<p class="pc-note" id="priceNote">Всё включено — без лимитов на количество консультаций.</p>', '<p class="pc-note" id="priceNote">Демо-тариф для обсуждения модели доступа. Финальные условия утверждаются заказчиком.</p>'],
  ['<li><svg class="icon"><use href="#i-check"/></svg>Безлимитные приёмы терапевта и педиатра — в любое время суток</li>', '<li><svg class="icon"><use href="#i-check"/></svg>Пример подписки для регулярных онлайн-консультаций</li>'],
  ['<li><svg class="icon"><use href="#i-check"/></svg>Электронные рецепты и больничные листы с 2022 года — легально</li>', '<li><svg class="icon"><use href="#i-check"/></svg>Макет раздела документов без выпуска реальных рецептов и больничных</li>'],
  ['<li><svg class="icon"><use href="#i-check"/></svg>Результаты анализов с комментарием врача человеческим языком</li>', '<li><svg class="icon"><use href="#i-check"/></svg>Место для комментариев врача к анализам после подключения реальных специалистов</li>'],
  ['<li><svg class="icon"><use href="#i-check"/></svg>−20% на специалистов узкого профиля</li>', '<li><svg class="icon"><use href="#i-check"/></svg>Пример условий для специалистов узкого профиля</li>'],
  ['<li><svg class="icon"><use href="#i-check"/></svg>Приоритетная запись: первый ответ от 5 минут</li>', '<li><svg class="icon"><use href="#i-check"/></svg>Пример приоритетной записи без гарантии времени ответа</li>'],
  ['<p class="cta-note">Нажимая кнопку, вы соглашаетесь с политикой обработки персональных данных. Никакого спама — только один звонок.</p>', '<p class="cta-note">Демо-форма показывает будущий сценарий согласия на обработку данных. До запуска реальные обращения не обрабатываются.</p>'],
  ["const showOnline = () => $('#docsOnline').textContent = online;\nshowOnline();\nsetInterval(()=>{ online += Math.floor(Math.random()*7) - 3; online = Math.max(180, online); showOnline(); }, 8000);", "const showOnline = () => { const el = $('#docsOnline'); if (el) el.textContent = 'демо'; };\nshowOnline();"],
  ['<span class="d-meta">${ru(d.cnt)} врачей · от ${d.price} ₽</span>', '<span class="d-meta">демо-направление · от ${d.price} ₽</span>'],
  ['<div><b><svg class="icon"><use href="#i-star"/></svg>${d.rate.toFixed(1)}</b><span>из ${d.revs} приёмов</span></div>', '<div><b><svg class="icon"><use href="#i-star"/></svg>${d.rate.toFixed(1)}</b><span>демо-рейтинг</span></div>'],
  ["solo:   {price:690,  per:'≈ 23 ₽ в день', note:'Всё включено — без лимитов на количество консультаций.'},", "solo:   {price:690,  per:'пример расчёта', note:'Демо-тариф для обсуждения модели доступа. Финальные условия утверждаются заказчиком.'},"],
  ["family: {price:1190, per:'298 ₽ на человека · до 4 близких', note:'Одна карта на всю семью: педиатр для детей, терапевт — для родителей.'}", "family: {price:1190, per:'пример семейного доступа', note:'Макет семейного кабинета: роли, профили и сценарии будут уточнены перед запуском.'}"]
];
let missed = [];
for (const [oldText, newText] of replacements) {
  if (!s.includes(oldText)) missed.push(oldText);
  s = s.replace(oldText, newText);
}
fs.writeFileSync(path, s, 'utf8');
console.log(JSON.stringify({ backup, replacements: replacements.length, missed: missed.map(x => x.slice(0, 160)) }, null, 2));
