"""Browser QA for the immersive mouse-only frontend; secrets remain in process/tab memory."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from launch import environment_config, bootstrap_fragment
from urllib.request import urlopen
import argparse,json,re,time
ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:4173/';KEY='moonlit-tankard-save-v1'
parser=argparse.ArgumentParser();parser.add_argument('--skip-ai',action='store_true');args=parser.parse_args()
config=environment_config();report={'checks':[],'failures':[],'browserErrors':[],'realAI':{},'screenshots':[]}
def safe(value):
 text=str(value)
 if config['key']:text=text.replace(config['key'],'[REDACTED]')
 return re.sub(r'#bootstrap=[^\s\"\']+','#bootstrap=[REDACTED]',text)
def check(name,ok=True):
 if not ok:raise AssertionError(name)
 report['checks'].append(name);print('PASS '+name,flush=True)
def stage(name,fn):
 try:fn()
 except Exception as e:report['failures'].append({'stage':name,'error':safe(e)});print('FAIL '+name+': '+safe(e),flush=True)
def ready(page):page.wait_for_selector('#loading',state='detached',timeout=25000)
def state(page):return page.evaluate('(k)=>JSON.parse(localStorage.getItem(k))',KEY)
def shot(page,name):
 (ROOT/'screenshots').mkdir(exist_ok=True);page.screenshot(path=str(ROOT/'screenshots'/name));report['screenshots'].append(name)
def close(page):
 button=page.locator('[data-action="close-modal"]')
 if button.count():button.first.click()
def settings(page):page.locator('[data-action="panel"][data-panel="settings"]').click()
def step(page,seconds):
 for _ in range(int(seconds//10)):page.clock.run_for(10000)
 if seconds%10:page.clock.run_for(int(seconds%10*1000))
def until(page,expression,seconds=35):
 for _ in range(seconds):
  if page.evaluate(expression):return
  page.clock.run_for(1000)
 raise AssertionError('Clock wait exhausted: '+expression)
def visit(page,name):
 close(page);page.locator(f'[data-action="visit"][data-panel="{name}"]').click();until(page,"!!document.querySelector('#modal-root .modal')",20)
def fixture(page,body):
 raw=page.evaluate("""async body=>{const e=await import('./src/engine.js'),v=await import('./src/storage.js');const s=e.createGame();new Function('s','e',body)(s,e);return v.publicSave(s);}""",body)
 # Leave the running app first: its pagehide handler saves its current state.
 page.goto(BASE+'assets/index.html',wait_until='networkidle');page.evaluate('(raw)=>localStorage.setItem("moonlit-tankard-save-v1",raw)',raw);page.goto(BASE,wait_until='networkidle');ready(page)
BUSY="""s.phase='open';s.arrivalIn=999;s.staff[0].x=790;s.staff[0].y=185;s.staff[0].job={kind:'order',table:'t4',stage:'prepare',remaining:999};Object.assign(s.tables[3],{status:'preparing',worker:'qingya',patience:999,order:{drink:'tea',quantity:1,paid:false},guest:{id:4,variant:0,party:1,x:1005,y:730,path:[]}});s.player.x=420;s.player.y=570;"""
try:
 with urlopen(BASE,timeout=3) as response:check('localhost static preview responds',response.status==200)
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='chrome',headless=True)
  context=browser.new_context(viewport={'width':1600,'height':1000},accept_downloads=True)
  page=context.new_page();page.on('pageerror',lambda e:report['browserErrors'].append(safe(e)))
  page.goto(BASE+bootstrap_fragment(config),wait_until='networkidle');ready(page)
  def ai_flow():
   check('one-time environment fragment removed',page.evaluate('location.hash')=='')
   settings(page);check('environment key reaches settings in tab memory',page.locator('#api-key').input_value()==config['key']);page.locator('#auto-ai').uncheck();page.locator('[data-action="save-settings"]').click()
   if config['key'] and not args.skip_ai:
    start=time.monotonic();page.locator('[data-action="test-connection"]').click();page.wait_for_function("document.querySelector('#connection-result')?.textContent.startsWith('连接成功')",timeout=45000);report['realAI']['connectionSeconds']=round(time.monotonic()-start,2);check('real model connection succeeds')
   close(page)
   page.locator('[data-kind="staff"][data-id="qingya"]').click();page.wait_for_selector('#dialogue-root .dialogue-box',timeout=25000)
   check('walking to staff opens a scene dialogue without a fullscreen modal',page.locator('#modal-root').inner_html()=='')
   if config['key'] and not args.skip_ai:
    for prompt in ['请记住：店主喜欢不太甜的青柠饮品，以后推荐要考虑这个偏好。','我刚才让你记住的饮品偏好是什么？']:
     before=len(state(page)['staff'][0]['conversation']);page.locator('#chat-input').fill(prompt);page.locator('#chat-send').click();page.wait_for_function("n=>JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).staff[0].conversation.length>n+1",arg=before,timeout=45000)
    w=state(page)['staff'][0];check('real model remembers and recalls the player preference',bool(w['memories']) and any(t in w['conversation'][-1]['text'] for t in ['青柠','甜']));report['realAI']['verifiedFlows']=['connection','player-dialogue','memory-recall'];report['realAI']['model']=config['model'];shot(page,'immersive-ai-dialogue.png')
   close(page)
  stage('real AI connection and embodied dialogue',ai_flow)
  # All subsequent movement and business tests use browser time, with automatic AI off.
  page.clock.install()
  def facilities():
   fixture(page,'');step(page,.3)
   b=page.locator('#world').bounding_box();check('world canvas covers the viewport',b['width']==1600 and b['height']==1000)
   before=state(page)['player'];page.mouse.click(800,600);step(page,4);after=state(page)['player'];check('ground mouse click moves the human player',abs(before['x']-after['x'])+abs(before['y']-after['y'])>20)
   visit(page,'staff');page.locator('[data-action="hire"][data-staff="tuantuan"]').click();check('walking to hire station recruits employee',len(state(page)['staff'])==2 and state(page)['gold']==180);close(page)
   visit(page,'stock');page.locator('[data-action="restock"][data-drink="ale"]').click();check('walking to inventory purchases stock',state(page)['stock']['ale']==18 and state(page)['gold']==144);close(page)
   visit(page,'upgrade');page.locator('[data-action="upgrade"][data-upgrade="bar"]').click();check('walking to upgrade station buys equipment',state(page)['upgrades']['bar']==1 and state(page)['gold']==24);close(page)
   visit(page,'menu');page.locator('[data-action="menu-toggle"][data-drink="tea"]').click();check('walking to ledger changes menu',not state(page)['menu']['tea']);close(page)
   visit(page,'events');check('walking to event station opens activity panel',page.locator('[data-action="start-event"]').count()>0);close(page)
   shot(page,'immersive-day.png');page.locator('[data-action="lighting"]').click();step(page,.2);shot(page,'immersive-night.png');page.set_viewport_size({'width':1280,'height':800});step(page,.3);check('1280x800 stays within viewport',page.evaluate('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight'));shot(page,'immersive-1280.png');page.set_viewport_size({'width':1600,'height':1000})
  stage('mouse movement and facilities',facilities)
  def manual():
   fixture(page,BUSY+"Object.assign(s.tables[0],{status:'waiting',patience:999,order:{drink:'ale',quantity:1,paid:false},guest:{id:1,variant:0,party:1,x:315,y:495,path:[]}});")
   page.locator('[data-kind="table"][data-id="t1"]').click();until(page,"!!document.querySelector('[data-action=player-work]')",8);page.locator('[data-action="player-work"]').click();until(page,"!!JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).player.carrying",40)
   carrying=state(page);check('human walks to bar, consumes stock and prepares a drink',carrying['player']['job']['stage']=='carry' and carrying['stock']['ale']==11)
   page.reload(wait_until='networkidle');ready(page);check('reload preserves carried drink and table ownership',state(page)['player']['carrying']==carrying['player']['carrying'] and state(page)['tables'][0]['worker']=='player')
   page.locator('[data-kind="table"][data-id="t1"]').click();until(page,"JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).stats.served>0",25);check('clicking table carries and delivers the prepared order',state(page)['player']['completed']==1 and state(page)['player']['carrying'] is None)
   fixture(page,BUSY+"Object.assign(s.tables[0],{status:'dirty',patience:100,order:{drink:'ale',quantity:1,paid:true},guest:null});")
   page.locator('[data-kind="table"][data-id="t1"]').click();until(page,"!!document.querySelector('[data-action=player-clean]')",8);page.locator('[data-action="player-clean"]').click();step(page,8);check('human cleans a dirty table',state(page)['tables'][0]['status']=='empty' and state(page)['player']['completed']==1)
   page.locator('#pause').click();step(page,.3);paused=state(page)['elapsed'];step(page,3);check('pause freezes the business clock',state(page)['elapsed']==paused)
   settings(page)
   snapshot=state(page);page.locator('#import-file').set_input_files({'name':'broken.json','mimeType':'application/json','buffer':b'{"version":1,"day":1}'})
   until(page,"document.querySelector('#toast').textContent.includes('存档无效')",4);check('invalid import preserves the current save',state(page)['gold']==snapshot['gold'] and state(page)['elapsed']==snapshot['elapsed'])
   with page.expect_download() as download:page.locator('[data-action="export"]').click()
   exported=Path(download.value.path()).read_text(encoding='utf8');check('exported save excludes credentials',not config['key'] or config['key'] not in exported);check('persistent local storage excludes credentials',not config['key'] or not page.evaluate('(key)=>Object.values(localStorage).some(v=>v.includes(key))',config['key']));close(page)
   fixture(page,"delete s.player;s.gold=222;s.staff[0].x=790;s.staff[0].y=215;");check('legacy version-one save migrates to a human player',state(page)['gold']==222 and state(page)['player']['id']=='player' and state(page)['staff'][0]['y']!=215)
  stage('manual service, save and legacy migration',manual)
  # Real autonomous dialogue runs in a separate unaccelerated tab.
  def natural_ai():
   if not config['key'] or args.skip_ai:report['realAI']['naturalSkipped']='No configured key or --skip-ai';return
   natural=context.new_page();natural.on('pageerror',lambda e:report['browserErrors'].append(safe(e)));natural.goto(BASE+bootstrap_fragment(config),wait_until='networkidle');ready(natural)
   settings(natural);natural.locator('#auto-ai').check();natural.locator('[data-action="save-settings"]').click();close(natural)
   fixture(natural,"s.phase='open';s.elapsed=110;s.arrivalIn=999;s.staff.push(e.createEmployee('tuantuan',1));Object.assign(s.staff[0],{x:768,y:600,path:[],job:null});Object.assign(s.staff[1],{x:820,y:600,path:[],job:null});")
   natural.wait_for_function("()=>{const s=JSON.parse(localStorage.getItem('moonlit-tankard-save-v1'));return s.staff.every(w=>w.conversation.some(m=>m.kind==='colleague'))}",timeout=65000)
   check('nearby idle coworkers naturally exchange two real model replies',state(natural)['staff'][0]['relationships'].get('tuantuan',0)>=1);report['realAI'].setdefault('verifiedFlows',[]).append('natural-colleague');shot(natural,'immersive-colleagues.png')
   fixture(natural,"s.phase='open';s.arrivalIn=999;Object.assign(s.staff[0],{x:790,y:185,path:[],job:null});Object.assign(s.tables[0],{status:'arriving',patience:999,order:{drink:'citrus',quantity:1,paid:false},guest:{id:1,variant:0,party:1,x:315,y:495,path:[]}});")
   natural.wait_for_function("()=>JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).staff[0].conversation.some(m=>m.kind==='guest')",timeout=65000);check('an onsite customer request triggers a natural real model reply');report['realAI']['verifiedFlows'].append('natural-customer');natural.close()
  stage('natural colleague and customer AI',natural_ai)
  def full_day():
   offline_context=browser.new_context(viewport={'width':1440,'height':960});offline=offline_context.new_page();offline.clock.install();offline.on('pageerror',lambda e:report['browserErrors'].append(safe(e)));offline.goto(BASE,wait_until='networkidle');ready(offline);offline.locator('[data-action="business"]').click();offline.locator('[data-action="speed"][data-speed="3"]').click()
   for i in range(7):offline.clock.run_for(30000);print(f'Full-day clock chunk {i+1}/7.',flush=True)
   full=state(offline);check('full business day settles once with autonomous service',full['phase']=='closed' and full['summary']['served']>0 and len(full['history'])==1);report['fullDay']={k:full['summary'][k] for k in ['served','revenue','tips','wages','profit']};shot(offline,'immersive-summary.png');offline.locator('[data-action="next-day"]').click();check('next day resets business and retains progression',state(offline)['day']==2 and state(offline)['stats']['served']==0);offline_context.close()
  stage('full browser-clock business day',full_day)
  gallery=context.new_page();gallery.goto(BASE+'assets/index.html',wait_until='networkidle');check('art gallery includes human player and all eight sources',gallery.locator('img').count()==8);gallery.close();check('no JavaScript runtime errors',not report['browserErrors']);context.close();browser.close()
except Exception as error:report['failures'].append({'stage':'setup or final verification','error':safe(error)});print('QA FAILED: '+safe(error),flush=True)
finally:
 report['passed']=not report['failures'];(ROOT/'docs'/'qa-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'passed':report['passed'],'checks':len(report['checks']),'failures':report['failures'],'realAI':report['realAI']},ensure_ascii=False),flush=True)
if not report['passed']:raise SystemExit(1)
