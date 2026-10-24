"""Independent party-loop browser QA. Credentials stay in process and tab memory."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from launch import environment_config, bootstrap_fragment
from urllib.request import urlopen
import argparse, json, re, time

ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:4173/'
KEY='moonlit-tankard-save-v1'
config=environment_config()
parser=argparse.ArgumentParser()
parser.add_argument('--skip-ai',action='store_true')
parser.add_argument('--screenshots-only',action='store_true',help='Recapture actual UI states without model calls or overwriting QA results')
args=parser.parse_args()
report={'checks':[],'failures':[],'browserErrors':[],'screenshots':[],'realAI':{},'fixturePolicy':'Only initial conditions, pending genuine deliveries and boundary times are prepared. Final service, reward and settlement outcomes run through the real animation loop.'}

def safe(value):
    text=str(value)
    if config['key']:text=text.replace(config['key'],'[REDACTED]')
    return re.sub(r'#bootstrap=[^\s\"\']+','#bootstrap=[REDACTED]',text)

def check(name,ok=True):
    if not ok:raise AssertionError(name)
    report['checks'].append(name)
    print('PASS '+name,flush=True)

def stage(name,fn):
    try:fn()
    except Exception as error:
        report['failures'].append({'stage':name,'error':safe(error)})
        print('FAIL '+name+': '+safe(error),flush=True)

def ready(page):page.wait_for_selector('#loading',state='detached',timeout=25000)
def state(page):return page.evaluate('(k)=>JSON.parse(localStorage.getItem(k))',KEY)
def tick(page,seconds):
    while seconds>0:
        step=min(seconds,10);page.clock.run_for(round(step*1000));seconds-=step
def until(page,expression,seconds=40):
    for _ in range(seconds):
        if page.evaluate(expression):return
        tick(page,1)
    raise AssertionError('Clock wait exhausted: '+expression)
def close(page):
    buttons=page.locator('[data-action="close-modal"]')
    if buttons.count():buttons.first.click()
def shot(page,name):
    name='party-'+name+'.png'
    (ROOT/'screenshots').mkdir(exist_ok=True)
    page.screenshot(path=str(ROOT/'screenshots'/name),animations='disabled')
    report['screenshots'].append(name)
def visit(page,panel):
    close(page)
    page.locator(f'[data-action="visit"][data-panel="{panel}"]').first.click()
    until(page,"!!document.querySelector('#modal-root .modal')",25)
    tick(page,2.2) # Persist the completed walk before assertions read the save.
def fixture(page,body='',existing=False,legacy=False):
    raw=page.evaluate("""async ({body,existing,legacy,key})=>{
      const e=await import('./src/engine.js'),v=await import('./src/storage.js');
      const s=existing?JSON.parse(localStorage.getItem(key)):e.createGame();
      new Function('s','e',body)(s,e);
      const raw=legacy?JSON.stringify(s):v.publicSave(s);v.parseGame(raw);return raw;
    }""",{'body':body,'existing':existing,'legacy':legacy,'key':KEY})
    # pagehide saves the old app before this write, never after it.
    page.goto(BASE+'assets/index.html',wait_until='networkidle')
    page.evaluate('([key,raw])=>localStorage.setItem(key,raw)',[KEY,raw])
    page.goto(BASE,wait_until='networkidle');ready(page)

DELIVERY="""
 s.phase='open';s.paused=false;s.arrivalIn=999;
 for(const w of s.staff){w.job=null;w.path=[];w.chatWith=null;}
 for(const t of s.tables){t.status='empty';t.worker=null;t.order=null;t.guest=null;}
 const t=s.tables[0],w=s.staff[0];s.stock.ale--;
 Object.assign(t,{status:'preparing',worker:w.id,patience:140,order:{drink:'ale',quantity:1,paid:false},guest:{id:++s.guestSeq,variant:0,party:1,x:t.x-105,y:t.y+25,path:[]}});
 Object.assign(w,{x:t.x,y:t.y+100,path:[],job:{kind:'order',table:t.id,stage:'deliver',remaining:0}});
 s.player.interaction=null;s.player.target=null;s.player.path=[];s.player.job=null;s.player.carrying=null;
"""

if args.screenshots_only:
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='chrome',headless=True)
        context=browser.new_context(viewport={'width':1600,'height':1000})
        page=context.new_page();page.clock.install();page.goto(BASE,wait_until='networkidle');ready(page)
        fixture(page);visit(page,'recipes');page.locator('[data-action="draw-recipe"]').click();tick(page,.6);shot(page,'recipe-reveal')
        page.locator('[data-action="close-draw"]').first.click();close(page)
        visit(page,'night');page.locator('[data-action="set-strategy"][data-strategy="premium"]').click();tick(page,.6);shot(page,'strategy')
        page.locator('[data-action="start-party"]').click();close(page);page.locator('[data-action="business"]').click()
        fixture(page,"s.elapsed=299.5;s.arrivalIn=999;",existing=True);tick(page,3);shot(page,'active')
        for _ in range(3):fixture(page,DELIVERY,existing=True);tick(page,2.5)
        shot(page,'combo')
        fixture(page,"s.phase='open';s.elapsed=119.5;s.arrivalIn=999;");tick(page,3);shot(page,'cameo')
        print(json.dumps({'screenshots':report['screenshots'],'modelCalls':0},ensure_ascii=False),flush=True)
        context.close();browser.close()
    raise SystemExit(0)

try:
    with urlopen(BASE,timeout=3) as response:check('localhost static preview responds',response.status==200)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='chrome',headless=True)
        ctx=browser.new_context(viewport={'width':1600,'height':1000},accept_downloads=True)
        page=ctx.new_page()
        page.on('pageerror',lambda error:report['browserErrors'].append(safe(error)))
        page.goto(BASE+bootstrap_fragment(config),wait_until='networkidle');ready(page)

        def real_ai():
            check('bootstrap fragment is immediately removed',page.evaluate('location.hash')=='')
            page.locator('[data-action="panel"][data-panel="settings"]').click()
            check('environment model key stays in tab settings',page.locator('#api-key').input_value()==config['key'])
            page.locator('#auto-ai').uncheck();page.locator('[data-action="save-settings"]').click();close(page)
            if args.skip_ai or not config['key']:
                report['realAI']['skipped']='Explicit --skip-ai or no configured environment key';return
            fixture(page,"Object.assign(s.staff[0],{x:768,y:520});Object.assign(s.player,{x:768,y:700});")
            page.locator('[data-kind="staff"][data-id="qingya"]').click()
            page.wait_for_selector('#dialogue-root .dialogue-box',timeout=15000)
            page.evaluate("""()=>{window.__partyStream=[];new MutationObserver(()=>{const el=document.querySelector('#dialogue-reply');if(el?.classList.contains('dialogue-reply-stream')&&el.textContent!=='…')window.__partyStream.push({text:el.textContent,time:performance.now(),busy:document.querySelector('#chat-send').disabled});}).observe(document.querySelector('#dialogue-reply'),{childList:true,subtree:true,characterData:true});}""")
            requests=[]
            def inspect_response(response):
                if response.url.endswith('/chat/completions'):
                    requests.append({'status':response.status,'eventStream':'text/event-stream' in response.headers.get('content-type','')})
            page.on('response',inspect_response)
            before=len(state(page)['staff'][0]['conversation']);start=time.monotonic()
            page.locator('#chat-input').fill('请把这个新偏好写进长期记忆：店主喜欢不太甜的青柠饮品。用一句话回应我，今晚也一起把小店照顾好。')
            page.locator('#chat-send').click()
            page.wait_for_function("n=>JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).staff[0].conversation.length>n+1",arg=before,timeout=50000)
            updates=page.evaluate('window.__partyStream');worker=state(page)['staff'][0]
            check('real model responds using HTTP SSE',bool(requests) and requests[-1]['status']==200 and requests[-1]['eventStream'])
            check('partial DOM speech appears before final persisted reply',len(set(item['text'] for item in updates))>=2 and any(item['busy'] for item in updates))
            check('final real reply stores new memory',bool(worker['memories']) and any('青柠' in text or '甜' in text for text in worker['memories']))
            check('final dialogue exits streaming state',not page.locator('#dialogue-reply').evaluate('(el)=>el.classList.contains("dialogue-reply-stream")'))
            report['realAI']={'model':config['model'],'calls':len(requests),'elapsedSeconds':round(time.monotonic()-start,2),'partialUpdates':len(updates),'memoryItems':len(worker['memories']),'sse':True}
            shot(page,'ai-streamed-memory');close(page)
            check('credentials never enter persistent localStorage',not page.evaluate('(key)=>Object.values(localStorage).some(value=>value.includes(key))',config['key']))
        stage('real model SSE and persistent memory',real_ai)
        page.clock.install()

        def recipes():
            fixture(page);tick(page,.3)
            check('new game starts with 30 inspiration',state(page)['progression']['inspiration']==30 and page.locator('#inspiration').inner_text()=='30')
            visit(page,'recipes')
            check('recipe panel requires actual walk to ledger',state(page)['player']['interaction']=={'kind':'station','id':'ledger'})
            page.locator('[data-action="draw-recipe"]').click();tick(page,.3)
            check('draw costs 10 inspiration and opens result reveal',state(page)['progression']['inspiration']==20 and page.locator('#draw-root .draw-reveal').count()==1)
            shot(page,'recipe-reveal')
            page.locator('[data-action="close-draw"]').first.click()
            recipe=state(page)['progression']['collection'][0]
            page.locator(f'[data-action="equip-recipe"][data-recipe="{recipe}"]').click();tick(page,.3)
            check('drawn recipe equips through actual UI',state(page)['progression']['equipped']==recipe)
            details=page.evaluate("""async()=>{const p=await import('./src/progression.js'),s=JSON.parse(localStorage.getItem('moonlit-tankard-save-v1'));const r=p.RECIPES[s.progression.equipped];return {recipe:r,drink:p.drinkInfo(s,r.base)};}""")
            visit(page,'menu');check('equipped recipe changes visible menu and actual drinkInfo',details['drink']['name']==details['recipe']['name'] and details['recipe']['name'] in page.locator('#modal-root').inner_text())
            close(page)
        stage('inspiration recipe draw reveal equip and menu',recipes)

        def strategy_party():
            fixture(page);visit(page,'night')
            page.locator('[data-action="set-strategy"][data-strategy="premium"]').click()
            check('premium strategy selected in ready phase',state(page)['progression']['strategy']=='premium')
            page.locator('[data-action="set-strategy"][data-strategy="quick"]').click()
            check('quick strategy selected in ready phase',state(page)['progression']['strategy']=='quick')
            page.locator('[data-action="set-strategy"][data-strategy="premium"]').click();shot(page,'strategy')
            gold=state(page)['gold'];page.locator('[data-action="start-party"]').click()
            scheduled=state(page)
            check('party charges exactly 60 gold and schedules at 300s',scheduled['gold']==gold-60 and scheduled['progression']['party']['status']=='scheduled' and scheduled['progression']['party']['startAt']==300)
            close(page);page.locator('[data-action="business"]').click();tick(page,.3)
            visit(page,'night');check('night strategy cannot change while open',all(page.locator('[data-action="set-strategy"]').nth(i).is_disabled() for i in range(2)));close(page)
            fixture(page,"s.elapsed=299.5;s.arrivalIn=999;",existing=True);tick(page,3)
            check('scheduled party activates via real frame loop',state(page)['progression']['party']['status']=='active' and '派对' in page.locator('#live-event').inner_text())
            shot(page,'active')
            before=state(page)['stats']['served']
            service_revenue=[]
            for _ in range(3):
                previous_revenue=state(page)['stats']['revenue']
                fixture(page,DELIVERY,existing=True);tick(page,2.5)
                service_revenue.append(state(page)['stats']['revenue']-previous_revenue)
            three=state(page)
            check('three real delivered orders count toward party and combo',three['stats']['served']==before+3 and three['progression']['party']['served']==3 and three['progression']['combo']['count']==3)
            check('combo HUD displays actual 3 chain and 10 percent income effect',page.locator('#combo-count').inner_text()=='3' and '+10%' in page.locator('#combo-effect').inner_text())
            check('third actual service earns more from combo',service_revenue[2]>service_revenue[0])
            shot(page,'combo')
            # Compare actual arrival scheduling with the achieved chain against a
            # zero-chain control, sharing the same pre-arrival RNG and clock.
            snapshot='Object.assign(s,'+json.dumps(three,ensure_ascii=True)+');s.arrivalIn=0;'
            fixture(page,snapshot+"s.progression.combo.count=0;s.progression.combo.tier=0;s.progression.combo.expiresAt=0;");tick(page,2.5)
            control_interval=state(page)['arrivalIn']
            fixture(page,snapshot);tick(page,2.5)
            check('achieved 3 combo speeds real deterministic arrival scheduling',state(page)['arrivalIn']<control_interval)
            fixture(page,'Object.assign(s,'+json.dumps(three,ensure_ascii=True)+');');tick(page,2.2)
            inspiration=three['progression']['inspiration'];fixture(page,"s.elapsed=419.5;s.arrivalIn=999;",existing=True);tick(page,3)
            completed=state(page)
            check('party completes with exactly 12 inspiration reward',completed['progression']['party']['status']=='complete' and completed['progression']['party']['rewarded'] and completed['progression']['inspiration']==inspiration+12)
            page.reload(wait_until='networkidle');ready(page);tick(page,3)
            check('party reward cannot repeat after reload',state(page)['progression']['inspiration']==inspiration+12)
            report['party']={'served':three['progression']['party']['served'],'completionReward':12,'goldCost':60,'combo':three['progression']['combo']['count']}
        stage('strategy party combo and once-only completion reward',strategy_party)

        def cameo():
            fixture(page,"s.phase='open';s.elapsed=119.5;s.arrivalIn=999;")
            tick(page,3)
            check('fictional Jensen automatically arrives at 120s',state(page)['progression']['cameo']['status']=='active' and '黄仁勋' in page.locator('#live-event').inner_text())
            shot(page,'cameo')
            initial=state(page);fixture(page,DELIVERY,existing=True);tick(page,2.5);served=state(page)
            bill=served['stats']['revenue']-initial['stats']['revenue'];tips=served['stats']['tips']-initial['stats']['tips']
            check('genuine served drink revenue is deferred into cameo pot',bill>0 and served['progression']['cameo']['pot']==bill and served['gold']-initial['gold']==tips)
            page.reload(wait_until='networkidle');ready(page);tick(page,2.5)
            check('reload preserves unpaid cameo pot without payout',state(page)['progression']['cameo']['pot']==bill and not state(page)['progression']['cameo']['paid'])
            fixture(page,"s.elapsed=179.5;s.arrivalIn=999;",existing=True);tick(page,3);paid=state(page)
            check('180s cameo exit pays real bill exactly once',paid['progression']['cameo']['paid'] and paid['gold']==initial['gold']+bill+tips and paid['stats']['revenue']==bill and len([event for event in paid['events'] if event['type']=='cameo-paid'])==1)
            page.reload(wait_until='networkidle');ready(page);tick(page,3)
            check('settled cameo cannot pay again after reload',state(page)['gold']==paid['gold'] and state(page)['stats']['revenue']==bill)
            check('cameo UI contains no corn theme','玉米' not in page.locator('body').inner_text())
            report['cameo']={'bill':bill,'tip':tips,'paidGold':paid['gold'],'revenueCountedOnce':True}
        stage('automatic cameo real pending receipts payout and reload',cameo)

        def manual_resume():
            fixture(page,"s.phase='open';s.arrivalIn=999;s.staff[0].job={kind:'order',table:'t4',stage:'prepare',remaining:999};s.staff[0].x=790;s.staff[0].y=185;Object.assign(s.tables[3],{status:'preparing',worker:'qingya',patience:999,order:{drink:'tea',quantity:1,paid:false},guest:{id:4,variant:0,party:1,x:1005,y:730,path:[]}});Object.assign(s.tables[0],{status:'waiting',patience:999,order:{drink:'ale',quantity:1,paid:false},guest:{id:1,variant:0,party:1,x:315,y:495,path:[]}});s.player.x=420;s.player.y=570;")
            page.locator('[data-kind="table"][data-id="t1"]').click();until(page,"!!document.querySelector('[data-action=player-work]')",10)
            page.locator('[data-action="player-work"]').click()
            until(page,"document.querySelector('#player-status').textContent.includes('正在调饮')",20)
            # A facility visit is a real mouse action that takes the owner away.
            page.locator('[data-action="visit"][data-panel="recipes"]').first.click();tick(page,3)
            suspended=state(page)
            check('walking away keeps consumed stock and suspended preparation',bool(suspended['player']['job']) and suspended['player']['job'].get('suspended') and suspended['stock']['ale']==11)
            remaining=suspended['player']['job']['remaining'];page.reload(wait_until='networkidle');ready(page);tick(page,3)
            restored=state(page)
            check('reload retains exact suspended work and ingredients',restored['player']['job']['remaining']==remaining and restored['stock']['ale']==11 and restored['tables'][0]['worker']=='player')
            close(page);page.locator('[data-action="resume-player"]').first.click()
            until(page,"!!JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).player.carrying",40)
            check('resuming finishes same drink without consuming stock again',state(page)['stock']['ale']==11 and bool(state(page)['player']['carrying']))
        stage('manual work suspend reload and resume',manual_resume)

        def migration():
            fixture(page,"s.gold=222;s.phase='open';s.elapsed=40;delete s.progression;delete s.player;",legacy=True)
            migrated=state(page)
            check('old v1 save preserves gold and phase while adding progression',migrated['gold']==222 and migrated['phase']=='open' and migrated['progression']['inspiration']==30 and migrated['player']['id']=='player')
        stage('old v1 migration',migration)

        def full_day():
            offline_ctx=browser.new_context(viewport={'width':1600,'height':1000})
            offline=offline_ctx.new_page();offline.on('pageerror',lambda error:report['browserErrors'].append(safe(error)))
            offline.clock.install();offline.goto(BASE,wait_until='networkidle');ready(offline)
            offline.locator('[data-action="business"]').click();offline.locator('[data-action="speed"][data-speed="3"]').click()
            for index in range(7):tick(offline,30);print(f'Full real-frame day {index+1}/7',flush=True)
            settled=state(offline)
            check('full actual animation-loop day closes and settles once',settled['phase']=='closed' and settled['summary']['served']>0 and len(settled['history'])==1 and settled['lastSettledDay']==1)
            before=settled['gold'];tick(offline,5);check('closed day does not charge wages twice',state(offline)['gold']==before)
            shot(offline,'full-day-summary')
            report['fullDay']=settled['summary']
            offline.locator('[data-action="next-day"]').click();tick(offline,.3)
            next_day=state(offline)
            check('next day retains permanent currency and resets daily counters',next_day['day']==2 and next_day['stats']['served']==0 and next_day['progression']['combo']['count']==0 and next_day['progression']['cameo']['status']=='waiting' and next_day['progression']['inspiration']==settled['progression']['inspiration'])
            offline_ctx.close()
        stage('full actual frame-loop day and next-day',full_day)

        gallery=ctx.new_page();gallery.goto(BASE+'assets/index.html',wait_until='networkidle')
        def gallery_check():
            manifest=json.loads((ROOT/'assets'/'manifest.json').read_text(encoding='utf8'))
            frames=sum(len(asset.get('frames',[])) for asset in manifest['assets'].values())
            check('art gallery exposes 9 source images and 96 manifest frames',gallery.locator('img').count()==9 and frames==96)
        stage('art gallery',gallery_check)
        gallery.close()
        stage('no runtime errors',lambda:check('no JavaScript runtime errors',not report['browserErrors']))
        ctx.close();browser.close()
except Exception as error:
    report['failures'].append({'stage':'setup or final verification','error':safe(error)})
    print('FAIL setup: '+safe(error),flush=True)
finally:
    report['passed']=not report['failures']
    (ROOT/'docs'/'qa-party-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'passed':report['passed'],'checks':len(report['checks']),'failures':report['failures'],'realAI':report['realAI']},ensure_ascii=False),flush=True)
if not report['passed']:raise SystemExit(1)
