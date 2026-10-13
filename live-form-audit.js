const { spawn } = require('node:child_process');
const fs = require('node:fs');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const userDir = 'C:/Users/orest/Desktop/PAPA/MedicalPlatform/.tmp-chrome-audit-forms';
const port = 9224;
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
      qs('#mTel').value = '+7 (999) 111-22-33';
      qs('#mTel').dispatchEvent(new Event('input', { bubbles: true }));
      qs('#bookForm')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      add('booking submit toast', document.body.textContent.includes('Демо-заявка собрана'), qs('#toasts')?.textContent?.trim() || 'missing');
      add('booking modal closes after submit', qs('#bookModal')?.classList.contains('open') === false, qs('#bookModal')?.className || 'missing');
      qs('#ctaTel').value = '+7 (999) 222-33-44';
      qs('#ctaTel').dispatchEvent(new Event('input', { bubbles: true }));
      qs('#ctaForm')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      add('callback submit toast', document.body.textContent.includes('Демо-заявка принята'), qs('#toasts')?.textContent?.trim() || 'missing');
      return { ok: out.every(x => x.ok), checks: out, title: document.title };
    })()`;
    const result = await cdp('Runtime.evaluate', { expression: script, returnByValue: true, awaitPromise: true });
    console.log(JSON.stringify(result.result.value, null, 2));
    process.exit(result.result.value.ok ? 0 : 1);
  } finally {
    try { ws && ws.close(); } catch {}
    child.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
