const { spawn } = require('node:child_process');
const fs = require('node:fs');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const base = 'C:/Users/orest/Desktop/PAPA/MedicalPlatform';
const userDir = `${base}/.tmp-zai-existing-chat`;
const port = 9229;
const url = 'https://chat.z.ai/c/dd6a16f3-7f89-496d-8ad6-224b75e5f498';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pending = new Map(); let ws, id = 0;
async function cdp(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }
(async () => {
  fs.mkdirSync(userDir, { recursive: true });
  const child = spawn(chrome, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${port}`,`--user-data-dir=${userDir}`,url], { stdio: 'ignore' });
  try {
    let endpoint;
    for (let i=0;i<60;i++) { try { const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json()); endpoint = tabs.find(t=>t.type==='page')?.webSocketDebuggerUrl; if (endpoint) break; } catch {} await sleep(500); }
    ws = new WebSocket(endpoint);
    ws.onmessage = e => { const msg=JSON.parse(e.data); if (msg.id && pending.has(msg.id)) { const p=pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } };
    await new Promise((res, rej) => { ws.onopen=res; ws.onerror=rej; });
    await cdp('Runtime.enable');
    await sleep(9000);
    const r = await cdp('Runtime.evaluate', { expression: `(() => ({ title: document.title, url: location.href, body: document.body.innerText.slice(0,5000), hasInput: !!document.querySelector('#chat-input'), buttons: [...document.querySelectorAll('button')].map(b=>({id:b.id||'', text:b.innerText, aria:b.getAttribute('aria-label')||'', disabled:b.disabled})).slice(-10) }))()`, returnByValue: true });
    console.log(JSON.stringify(r.result.value, null, 2));
  } finally { try { ws?.close(); } catch {} child.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
