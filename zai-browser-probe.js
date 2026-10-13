const { spawn } = require('node:child_process');
const fs = require('node:fs');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const userDir = 'C:/Users/orest/Desktop/PAPA/MedicalPlatform/.tmp-zai-chrome';
const port = 9225;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pending = new Map();
let ws, id = 0;
async function cdp(method, params = {}) {
  const callId = ++id;
  ws.send(JSON.stringify({ id: callId, method, params }));
  return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
}
(async () => {
  fs.mkdirSync(userDir, { recursive: true });
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, 'https://chat.z.ai/'
  ], { stdio: 'ignore' });
  try {
    let endpoint;
    for (let i = 0; i < 60; i++) {
      try {
        const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
        endpoint = tabs.find(t => t.type === 'page')?.webSocketDebuggerUrl;
        if (endpoint) break;
      } catch {}
      await sleep(500);
    }
    if (!endpoint) throw new Error('No page endpoint');
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
    await sleep(8000);
    const expr = `(() => ({
      title: document.title,
      url: location.href,
      body: document.body.innerText.slice(0, 3000),
      fields: [...document.querySelectorAll('textarea,input,[contenteditable="true"]')].slice(0,20).map((el,i)=>({i, tag: el.tagName, type: el.type || '', role: el.getAttribute('role') || '', aria: el.getAttribute('aria-label') || '', placeholder: el.getAttribute('placeholder') || '', text: (el.innerText || el.value || '').slice(0,100)})),
      buttons: [...document.querySelectorAll('button')].slice(0,30).map((el,i)=>({i, text: el.innerText.slice(0,80), aria: el.getAttribute('aria-label') || ''}))
    }))()`;
    const result = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    console.log(JSON.stringify(result.result.value, null, 2));
  } finally {
    try { ws && ws.close(); } catch {}
    child.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
