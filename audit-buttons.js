const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9444;
const userDataDir = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'mp-button-audit-' + Date.now());
const url = 'http://localhost:3000/';
const delay = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(target, options) { const res = await fetch(target, options); if (!res.ok) throw new Error(`${target} -> ${res.status}`); return res.json(); }
async function waitForDebug() { for (let i = 0; i < 60; i++) { try { return await getJson(`http://127.0.0.1:${port}/json/version`); } catch { await delay(250); } } throw new Error('Chrome remote debugging did not start'); }
class Cdp { constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.ws.onmessage = (event) => { const msg = JSON.parse(event.data); if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }; } open() { return new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; }); } send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); } close() { this.ws.close(); } }
(async () => {
  const proc = spawn(chrome, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${port}`,`--user-data-dir=${userDataDir}`,'--window-size=1440,1200','about:blank'], { stdio: 'ignore' });
  try {
    await waitForDebug();
    const page = await getJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await delay(3500);
    const expression = `(async () => {
      const delay = (ms) => new Promise(r => setTimeout(r, ms));
      const results = [];
      const add = (name, ok, detail = '') => results.push({ name, ok, detail });
      add('url is localhost', location.href.startsWith('http://localhost:3000/'), location.href);
      add('page title', document.title.includes('Норма'), document.title);
      add('booking modal exists', !!document.querySelector('#bookModal'), '');
      const bookButtons = Array.from(document.querySelectorAll('[data-book]'));
      add('booking buttons found', bookButtons.length > 0, String(bookButtons.length));
      const firstBook = bookButtons.find(b => /Записаться|Выбрать|Открыть каталог/.test(b.textContent)) || bookButtons[0];
      if (firstBook) { firstBook.click(); await delay(200); add('booking button opens modal', document.querySelector('#bookModal')?.classList.contains('open'), document.querySelector('#bookModal')?.getAttribute('aria-hidden') || 'missing'); document.querySelector('[data-close]')?.click(); await delay(80); }
      const tabs = Array.from(document.querySelectorAll('.dtab'));
      add('doctor tabs found', tabs.length >= 2, String(tabs.length));
      if (tabs[1]) { tabs[1].click(); await delay(80); add('doctor tab switches', tabs[1].classList.contains('act') && Array.from(document.querySelectorAll('.doc-pane')).some(p => p.classList.contains('on')), ''); }
      const dept = Array.from(document.querySelectorAll('#deptList .dept'))[1];
      if (dept) { dept.click(); await delay(80); add('department accordion opens', dept.classList.contains('open') && dept.nextElementSibling?.classList.contains('open'), dept.textContent.trim().slice(0, 40)); } else add('department accordion found', false, 'not found');
      const faq = document.querySelector('#faqList .q-btn');
      if (faq) { faq.click(); await delay(80); add('FAQ accordion opens', faq.closest('.q')?.classList.contains('open'), faq.textContent.trim().slice(0, 60)); } else add('FAQ accordion found', false, 'not found');
      const planButton = document.querySelector('.plan-btn:not(.act)');
      if (planButton) { planButton.click(); await delay(80); add('tariff toggle works', planButton.classList.contains('act'), planButton.textContent.trim()); } else add('tariff toggle present', true, 'not present after integration rewrite');
      const ctaTel = document.querySelector('#ctaTel'), ctaForm = document.querySelector('#ctaForm');
      if (ctaTel && ctaForm) { ctaTel.value = '+7 (999) 111-22-33'; ctaTel.dispatchEvent(new Event('input', { bubbles: true })); ctaForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await delay(120); add('CTA phone form submits to toast', !!document.querySelector('#toasts .toast'), document.querySelector('#toasts .toast')?.textContent.trim() || 'no toast'); } else add('CTA phone form found', false, 'missing');
      const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(Boolean);
      const badLinks = links.filter(h => h === '#' || h === 'javascript:void(0)');
      add('no placeholder links', badLinks.length === 0, badLinks.join(', '));
      return results;
    })()`;
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    const audit = result.result.value;
    const bad = audit.filter(x => !x.ok);
    console.log(JSON.stringify({ ok: bad.length === 0, audit, bad }, null, 2));
    cdp.close();
  } finally { proc.kill(); try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {} }
})().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
