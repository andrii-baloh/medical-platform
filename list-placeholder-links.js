const fs = require('node:fs');
const html = fs.readFileSync('C:/Users/orest/Desktop/PAPA/MedicalPlatform/igor.html','utf8');
for (const m of html.matchAll(/<a\b[^>]*href=["']#["'][^>]*>([\s\S]*?)<\/a>/g)) {
  const before = html.slice(0, m.index);
  const line = before.split(/\r?\n/).length;
  const label = m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  console.log(`${line}: ${label}`);
}
