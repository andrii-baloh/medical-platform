const fs = require('node:fs');
const html = fs.readFileSync('C:/Users/orest/Desktop/PAPA/MedicalPlatform/fetched-root.html', 'utf8');
const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/g)].map(m => m[1]);
const internal = [...new Set(hrefs.filter(h => h.startsWith('/') && !h.startsWith('//')))];
(async () => {
  const results = [];
  for (const href of internal) {
    const url = new URL(href, 'http://localhost:3000').toString();
    let status = 0, ok = false, finalUrl = url, error = '';
    try {
      const res = await fetch(url, { redirect: 'follow' });
      status = res.status;
      ok = res.status < 400;
      finalUrl = res.url;
    } catch (e) {
      error = e && e.message ? e.message : String(e);
    }
    results.push({ href, status, ok, finalUrl, error });
  }
  const bad = results.filter(r => !r.ok);
  console.log(JSON.stringify({ ok: bad.length === 0, checked: results.length, results, bad }, null, 2));
  process.exit(bad.length ? 1 : 0);
})();
