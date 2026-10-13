const fs = require('node:fs');
const base = 'C:/Users/orest/Desktop/PAPA/MedicalPlatform';
const port = 9231;
const url = 'https://chat.z.ai/c/dd6a16f3-7f89-496d-8ad6-224b75e5f498';
const prompt = fs.readFileSync(`${base}/ZAI_SITE_TASK_01_SHORT.md`, 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
async function cdp(method, params={}) {
  const callId = ++id;
  ws.send(JSON.stringify({ id: callId, method, params }));
  return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
}
async function evalJs(expression) { return await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); }
(async () => {
  let tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  let page = tabs.find(t => t.type === 'page') || tabs[0];
  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Page.navigate', { url });
  await sleep(10000);
  const state = await evalJs(`(() => ({ url: location.href, title: document.title, text: document.body.innerText.slice(0,1200), hasInput: !!document.querySelector('#chat-input'), signIn: document.body.innerText.includes('Sign in') || document.body.innerText.includes('Войти') }))()`);
  console.log('STATE', JSON.stringify(state.result.value, null, 2));
  if (!state.result.value.hasInput) throw new Error('No Z.ai input found');
  const inject = await evalJs(`(() => {
    const ta = document.querySelector('#chat-input');
    ta.scrollIntoView({ block: 'center' });
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(prompt)});
    ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'R' }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    ta.focus();
    return { value: ta.value.length, sendExists: !!document.querySelector('#send-message-button'), sendDisabled: document.querySelector('#send-message-button')?.disabled ?? null };
  })()`);
  console.log('INJECT', JSON.stringify(inject.result.value));
  await sleep(1500);
  const sent = await evalJs(`(() => {
    const btn = document.querySelector('#send-message-button') || [...document.querySelectorAll('button')].reverse().find(b => !b.disabled && (b.type === 'submit' || b.getAttribute('aria-label')?.toLowerCase().includes('send')));
    if (btn) { btn.click(); return { clicked: true, id: btn.id || '', disabled: btn.disabled, text: btn.innerText || '' }; }
    const form = document.querySelector('#chat-input')?.closest('form');
    if (form) { form.requestSubmit(); return { submitted: true }; }
    return { clicked: false, submitted: false };
  })()`);
  console.log('SENT', JSON.stringify(sent.result.value));
  let lastLen = 0;
  for (let i=0; i<90; i++) {
    await sleep(2000);
    const r = await evalJs(`(() => {
      const text = document.body.innerText;
      return { len: text.length, tail: text.slice(-3000), disabled: document.querySelector('#send-message-button')?.disabled ?? null, hasNoResponse: text.includes('No response'), hasStop: /Stop|Остановить|停止/.test(text) };
    })()`);
    const v = r.result.value;
    if (v.len !== lastLen) { console.log('PROGRESS', i, v.len, 'disabled', v.disabled, 'noResponse', v.hasNoResponse); lastLen = v.len; }
    if (v.hasNoResponse) break;
    if (i > 12 && !v.hasStop && v.len > 3500 && v.disabled === false) break;
    if (i > 30 && v.len > 2000) break;
  }
  const final = await evalJs(`(() => document.body.innerText)()`);
  fs.writeFileSync(`${base}/ZAI_SITE_TASK_01_VISIBLE_RESPONSE.txt`, final.result.value, 'utf8');
  console.log('SAVED', `${base}/ZAI_SITE_TASK_01_VISIBLE_RESPONSE.txt`, final.result.value.length);
  ws.close();
})().catch(e => { console.error(e); process.exit(1); });
