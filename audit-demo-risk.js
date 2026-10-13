const fs = require('fs');
const s = fs.readFileSync('igor.html','utf8');
const terms = ['врачей онлайн','let online = 208','setInterval(()=>{ online','Электронные рецепты','больничные','Лицензия Л041','перезвонит в течение 15 минут','Рецепт отправлен','реальные профили','без лимитов','первый ответ от 5 минут','координатор'];
for (const term of terms) {
  const i = s.indexOf(term);
  if (i >= 0) console.log('FOUND', term, '\n' + s.slice(Math.max(0,i-120), i+term.length+160).replace(/\n/g,' '));
}
