const { spawn } = require('node:child_process');
const fs = require('node:fs');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const userDir = 'C:/Users/orest/Desktop/PAPA/MedicalPlatform/.tmp-chrome-audit';
const port = 9223;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function cdp(method, params = {}) {
  const id = ++cdp.id;
  ws.send(JSON.stringify({ id, method, params }));
  return await new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
cdp.id = 0;
const pending = new Map();
let ws;
(async () => {
  fs.mkdirSync(userDir, { recursive: true });
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, 'about:blank'
  ], { stdio: 'ignore' });
  try {
    let endpoint;
    for (let i = 0; i < 40; i++) {
      try {
        const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
        endpoint = tabs.find(t => t.type === 'page')?.webSocketDebuggerUrl;
        if (endpoint) break;
      } catch {}
      await sleep(250);
    }
    if (!endpoint) throw new Error('Chrome page CDP endpoint did not start');
    ws = new WebSocket(endpoint);
    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    };
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    await cdp('Runtime.enable');
    await cdp('Page.navigate', { url: 'http://localhost:3000/' });
    await sleep(2500);
    const script = `(() => {
      const out = [];
      const add = (name, ok, detail='') => out.push({ name, ok, detail });
      const qs = s => document.querySelector(s);
      qs('[data-book]')?.click();
      add('booking opens modal', qs('#bookModal')?.classList.contains('open') === true, qs('#bookModal')?.className || 'missing');
      qs('[data-close]')?.click();
      add('booking modal closes', qs('#bookModal')?.classList.contains('open') === false, qs('#bookModal')?.className || 'missing');
      qs('.dept:not(.open)')?.click();
      add('department accordion opens', !!qs('.dept.open'), qs('.dept.open .d-title')?.textContent?.trim() || 'none');
      qs('.q-btn')?.click();
      add('FAQ opens', !!qs('.q.open'), qs('.q.open .q-btn')?.textContent?.trim() || 'none');
      const tab = document.querySelectorAll('.dtab')[1];
      tab?.click();
      add('doctor tab changes', tab?.classList.contains('act') === true, tab?.textContent?.trim() || 'missing');
      return { ok: out.every(x => x.ok), checks: out, url: location.href, title: document.title };
    })()`;
    const result = await cdp('Runtime.evaluate', { expression: script, returnByValue: true, awaitPromise: true });
    console.log(JSON.stringify(result.result.value, null, 2));
    process.exit(result.result.value.ok ? 0 : 1);
  } finally {
    try { ws && ws.close(); } catch {}
    child.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
