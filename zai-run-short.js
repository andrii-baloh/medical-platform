const { spawn } = require('node:child_process');
const fs = require('node:fs');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const base = 'C:/Users/orest/Desktop/PAPA/MedicalPlatform';
const userDir = `${base}/.tmp-zai-chrome-short`;
const port = 9228;
const prompt = fs.readFileSync(`${base}/ZAI_SITE_TASK_01_SHORT.md`, 'utf8');
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
  ws=new WebSocket(endpoint); ws.onmessage=e=>{const msg=JSON.parse(e.data); if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id); pending.delete(msg.id); msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}};
  await new Promise((res,rej)=>{ws.onopen=res; ws.onerror=rej}); await cdp('Runtime.enable'); await sleep(9000);
  await evalJs(`(() => { const ta=document.querySelector('#chat-input'); const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; setter.call(ta, ${JSON.stringify(prompt)}); ta.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'R'})); ta.dispatchEvent(new Event('change',{bubbles:true})); ta.focus(); return true; })()`);
  await sleep(1500);
  await evalJs(`(() => { const btn=document.querySelector('#send-message-button') || [...document.querySelectorAll('button')].reverse().find(b=>b.type==='submit'&&!b.disabled); btn?.click(); return {clicked:!!btn, id:btn?.id||'', disabled:btn?.disabled??null}; })()`);
  let last=0; for(let i=0;i<75;i++){ await sleep(2000); const r=await evalJs(`(() => ({ len: document.body.innerText.length, text: document.body.innerText, disabled: document.querySelector('#send-message-button')?.disabled ?? null, hasStop:/Stop|停止/.test(document.body.innerText) }))()`); if(r.result.value.len!==last){ console.log('PROGRESS', i, r.result.value.len, r.result.value.disabled); last=r.result.value.len; } if(i>12 && !r.result.value.hasStop && r.result.value.len>1200) break; }
  const final=await evalJs(`(() => document.body.innerText)()`);
  fs.writeFileSync(`${base}/ZAI_SITE_TASK_01_SHORT_RESPONSE.txt`, final.result.value, 'utf8');
  console.log('SAVED chars', final.result.value.length); ok=true;
 } finally { try{ws?.close()}catch{} child.kill(); }
 process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1)});
