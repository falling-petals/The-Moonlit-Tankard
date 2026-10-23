"""Targeted post-review browser checks; does not replace the full QA report."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from launch import environment_config,bootstrap_fragment
import json,re
ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:4173/';KEY='moonlit-tankard-save-v1';config=environment_config()
report={'checks':[],'failures':[],'browserErrors':[],'screenshots':[],'realAI':{}}
def safe(e):return str(e).replace(config['key'],'[REDACTED]') if config['key'] else str(e)
def check(name,ok=True):
 if not ok:raise AssertionError(name)
 report['checks'].append(name);print('PASS '+name,flush=True)
def ready(p):p.wait_for_selector('#loading',state='detached',timeout=25000)
def state(p):return p.evaluate('(k)=>JSON.parse(localStorage.getItem(k))',KEY)
def tick(p,n):p.clock.run_for(int(n*1000))
def fixture(p,body):
 raw=p.evaluate("""async body=>{const e=await import('./src/engine.js'),v=await import('./src/storage.js');const s=e.createGame();new Function('s','e',body)(s,e);return v.publicSave(s);}""",body)
 p.goto(BASE+'assets/index.html',wait_until='networkidle');p.evaluate('(v)=>localStorage.setItem("moonlit-tankard-save-v1",v)',raw);p.goto(BASE,wait_until='networkidle');ready(p)
def close(p):p.locator('[data-action="close-modal"]').first.click()
def shot(p,name):p.screenshot(path=str(ROOT/'screenshots'/name));report['screenshots'].append(name)
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(channel='chrome',headless=True);ctx=browser.new_context(viewport={'width':1600,'height':1000});p=ctx.new_page();p.on('pageerror',lambda e:report['browserErrors'].append(safe(e)));p.clock.install();p.goto(BASE,wait_until='networkidle');ready(p)
  fixture(p,"s.phase='open';s.arrivalIn=999;Object.assign(s.staff[0],{x:768,y:600});Object.assign(s.player,{x:686,y:600,interaction:{kind:'staff',id:'qingya'}});Object.assign(s.tables[0],{status:'waiting',patience:999,order:{drink:'ale',quantity:1,paid:false},guest:{id:1,variant:0,party:1,x:315,y:495,path:[]}});")
  p.wait_for_selector('#dialogue-root .dialogue-box');tick(p,4);s=state(p);check('reloaded staff interaction restores dialogue and prevents order assignment',s['staff'][0]['job'] is None and s['tables'][0]['worker'] is None)
  close(p);tick(p,3);s=state(p);check('closing restored dialogue releases staff to take waiting orders',s['staff'][0]['job'] is not None and s['tables'][0]['worker']=='qingya')
  fixture(p,"Object.assign(s.staff[0],{x:768,y:600});Object.assign(s.player,{x:768,y:800});")
  p.locator('[data-kind="staff"][data-id="qingya"]').click();tick(p,4);p.wait_for_selector('#dialogue-root .dialogue-box');s=state(p);distance=((s['player']['x']-s['staff'][0]['x'])**2+(s['player']['y']-s['staff'][0]['y'])**2)**.5;check('approaching staff leaves 50 to 100 pixels personal space',50<=distance<=100);report['approachDistance']=distance;close(p)
  p.locator('[data-action="panel"][data-panel="settings"]').click();p.locator('#api-key').fill('qa-in-memory-fake-key');p.locator('#auto-ai').uncheck();p.locator('[data-action="save-settings"]').click();close(p)
  p.evaluate("""()=>{const original=window.fetch;window.__qaDelayed={started:0,aborted:0};window.fetch=(url,options={})=>{if(!String(url).endsWith('/chat/completions'))return original(url,options);window.__qaDelayed.started++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({speech:'DELAYED_REPLY_MUST_NOT_APPEAR',memory:'DELAYED_MEMORY_MUST_NOT_APPEAR',suggestion:null})}}]}),{status:200,headers:{'content-type':'application/json'}})),10000);options.signal?.addEventListener('abort',()=>{clearTimeout(timer);window.__qaDelayed.aborted++;reject(new DOMException('Aborted','AbortError'));},{once:true});});};}""")
  p.locator('[data-kind="staff"][data-id="qingya"]').click();tick(p,1);p.wait_for_selector('#dialogue-root .dialogue-box');p.locator('#chat-input').fill('测试取消延迟回应');p.locator('#chat-send').click();tick(p,.3);check('test-only delayed fetch starts',p.evaluate('window.__qaDelayed.started')==1);close(p);tick(p,12);s=state(p);check('closing dialogue aborts delayed request',p.evaluate('window.__qaDelayed.aborted')==1);check('aborted response cannot write dialogue or memory',not any('DELAYED_' in str(w['conversation'])+str(w['memories']) for w in s['staff']))
  # New unaccelerated tab: acquire one real, contextual reply for the updated portrait.
  visual=ctx.new_page();visual.on('pageerror',lambda e:report['browserErrors'].append(safe(e)));visual.goto(BASE+bootstrap_fragment(config),wait_until='networkidle');ready(visual)
  visual.locator('[data-action="panel"][data-panel="settings"]').click();visual.locator('#auto-ai').uncheck();visual.locator('[data-action="save-settings"]').click();close(visual)
  fixture(visual,"Object.assign(s.staff[0],{x:768,y:520});Object.assign(s.player,{x:768,y:700});")
  visual.locator('[data-kind="staff"][data-id="qingya"]').click();visual.wait_for_selector('#dialogue-root .dialogue-box',timeout=12000)
  if config['key']:
   before=len(state(visual)['staff'][0]['conversation']);visual.locator('#chat-input').fill('请记住，店主喜欢不太甜的青柠饮品。今天一起慢慢照看小店吧。');visual.locator('#chat-send').click();visual.wait_for_function("n=>JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).staff[0].conversation.length>n+1",arg=before,timeout=45000);check('updated dialogue screenshot contains one real model response');report['realAI']={'model':config['model'],'calls':1}
  shot(visual,'immersive-ai-dialogue.png');close(visual)
  visual.clock.install();fixture(visual,"s.staff.push(e.createEmployee('tuantuan',1));Object.assign(s.staff[0],{x:790,y:185});Object.assign(s.staff[1],{x:1080,y:365});Object.assign(s.player,{x:768,y:710});");tick(visual,.4);shot(visual,'immersive-day.png');visual.locator('[data-action="lighting"]').click();tick(visual,.3);shot(visual,'immersive-night.png');visual.set_viewport_size({'width':1280,'height':800});tick(visual,.4);shot(visual,'immersive-1280.png');visual.set_viewport_size({'width':1600,'height':1000})
  fixture(visual,"s.staff.push(e.createEmployee('tuantuan',1));Object.assign(s.staff[0],{x:740,y:580,bubble:'刚才那桌想要清爽些，我把青柠备好了。',bubbleUntil:Date.now()+30000});Object.assign(s.staff[1],{x:850,y:590});Object.assign(s.player,{x:768,y:780});");tick(visual,.4);shot(visual,'immersive-colleagues.png');report['colleagueScreenshot']='Layout fixture with representative text; real colleague exchange was verified in qa-report.json.'
  check('no JavaScript runtime errors in review flows',not report['browserErrors']);ctx.close();browser.close()
except Exception as e:report['failures'].append(safe(e));print('FAIL '+safe(e),flush=True)
finally:
 report['passed']=not report['failures'];(ROOT/'docs'/'qa-review-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'passed':report['passed'],'checks':len(report['checks']),'failures':report['failures']},ensure_ascii=False),flush=True)
if not report['passed']:raise SystemExit(1)
