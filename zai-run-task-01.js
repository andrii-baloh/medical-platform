const { spawn } = require('node:child_process');
const fs = require('node:fs');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const base = 'C:/Users/orest/Desktop/PAPA/MedicalPlatform';
const userDir = `${base}/.tmp-zai-chrome`;
const port = 9227;
const prompt = fs.readFileSync(`${base}/ZAI_SITE_TASK_01.md`, 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pending = new Map(); let ws, id=0;
async function cdp(method, params={}){ const callId=++id; ws.send(JSON.stringify({id:callId, method, params})); return new Promise((resolve,reject)=>pending.set(callId,{resolve,reject})); }
async function evalJs(expression){ return await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); }
(async()=>{
 fs.mkdirSync(userDir,{recursive:true});
 const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${port}`,`--user-data-dir=${userDir}`,'https://chat.z.ai/'],{stdio:'ignore'});
 let ok=false;
 try{
  let endpoint; for(let i=0;i<80;i++){ try{ const tabs=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json()); endpoint=tabs.find(t=>t.type==='page')?.webSocketDebuggerUrl; if(endpoint) break; }catch{} await sleep(500); }
  if(!endpoint) throw new Error('No page endpoint');
  ws=new WebSocket(endpoint); ws.onmessage=e=>{const msg=JSON.parse(e.data); if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id); pending.delete(msg.id); msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}};
  await new Promise((res,rej)=>{ws.onopen=res; ws.onerror=rej}); await cdp('Runtime.enable'); await sleep(9000);
  const prep = await evalJs(`(() => ({ title: document.title, hasInput: !!document.querySelector('#chat-input'), signedIn: !document.body.innerText.includes('Sign in') }))()`);
  console.log('PREP', JSON.stringify(prep.result.value));
  if(!prep.result.value.hasInput) throw new Error('Z.ai input not available');
  const inject = await evalJs(`(() => {
    const ta = document.querySelector('#chat-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(prompt)});
    ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(prompt.slice(0,1))} }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    ta.focus();
    return { value: ta.value.length, sendExists: !!document.querySelector('#send-message-button'), sendDisabled: document.querySelector('#send-message-button')?.disabled ?? null };
  })()`);
  console.log('INJECT', JSON.stringify(inject.result.value));
  await sleep(2000);
  const sent = await evalJs(`(() => {
    const btn = document.querySelector('#send-message-button') || [...document.querySelectorAll('button')].reverse().find(b => b.type === 'submit' && !b.disabled);
    if (btn) { btn.click(); return { clicked: true, id: btn.id || '', text: btn.innerText || '', disabled: btn.disabled }; }
    const form = document.querySelector('#chat-input')?.closest('form');
    if (form) { form.requestSubmit(); return { clicked: false, submitted: true }; }
    return { clicked: false, submitted: false };
  })()`);
  console.log('SENT', JSON.stringify(sent.result.value));
  let lastLen = 0;
  for(let i=0;i<90;i++){
    await sleep(2000);
    const r = await evalJs(`(() => {
      const body=document.body.innerText;
      const send=document.querySelector('#send-message-button');
      return { len: body.length, tail: body.slice(-5000), disabled: send?.disabled ?? null, hasStop: /Stop|Остановить|停止/.test(body), waiting: /Thinking|思考|Generating|Continue/.test(body) };
    })()`);
    if(r.result.value.len !== lastLen){ console.log('PROGRESS', i, 'len', r.result.value.len, 'disabled', r.result.value.disabled, 'waiting', r.result.value.waiting); lastLen = r.result.value.len; }
    if(i > 12 && !r.result.value.hasStop && r.result.value.disabled === false && r.result.value.len > 5000) break;
    if(i > 25 && !r.result.value.hasStop && r.result.value.disabled === false && r.result.value.len > 2500) break;
  }
  const final = await evalJs(`(() => ({ url: location.href, title: document.title, text: document.body.innerText }))()`);
  fs.writeFileSync(`${base}/ZAI_SITE_TASK_01_RESPONSE.txt`, final.result.value.text, 'utf8');
  console.log('SAVED', `${base}/ZAI_SITE_TASK_01_RESPONSE.txt`, 'chars', final.result.value.text.length);
  ok=true;
 } finally { try{ws?.close()}catch{} child.kill(); }
 process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1)});
