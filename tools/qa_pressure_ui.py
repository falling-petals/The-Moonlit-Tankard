from pathlib import Path
from playwright.sync_api import sync_playwright
import json,sys
sys.stdout.reconfigure(encoding="utf-8")
ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:4173/';KEY='moonlit-tankard-save-v1'
report={'errors':[],'checks':[]};(ROOT/'screenshots').mkdir(exist_ok=True)
def fixture(page,body):
 raw=page.evaluate("""async body=>{const e=await import('./src/engine.js'),v=await import('./src/storage.js'),s=e.createGame();new Function('s','e',body)(s,e);const raw=v.publicSave(s);v.parseGame(raw);return raw}""",body)
 page.goto(BASE+'assets/index.html');page.evaluate('([k,v])=>localStorage.setItem(k,v)',[KEY,raw]);page.goto(BASE);page.wait_for_selector('#loading',state='detached')
def close(page):
 page.keyboard.press('Escape')
def shot(page,name):page.screenshot(path=str(ROOT/'screenshots'/name))
with sync_playwright() as p:
 browser=p.chromium.launch()
 context=browser.new_context(viewport={'width':1366,'height':768})
 context.add_init_script("localStorage.setItem('moonlit-preferences',JSON.stringify({auto:false}));")
 page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)));page.goto(BASE);page.wait_for_selector('#loading',state='detached');page.wait_for_timeout(300)
 report['checks'].append(['initial2tables',page.evaluate("JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).tables.filter(t=>t.enabled).length")])
 shot(page,'pressure-day-1366.png')
 initial=page.evaluate("JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).player")
 for panel in ['menu','recipes','staff','stock','upgrade','night']:
  close(page);page.locator(f'.visit-bar [data-panel={panel}]').click();page.wait_for_timeout(100)
  report['checks'].append([panel,page.locator('.modal').evaluate('(e)=>({bounds:e.getBoundingClientRect().toJSON(),scroll:e.querySelector(".modal-content").scrollHeight,client:e.querySelector(".modal-content").clientHeight,font:getComputedStyle(e).fontSize})')])
  if panel=='staff':shot(page,'pressure-staff.png')
  if panel=='menu':shot(page,'pressure-menu.png')
 page.wait_for_timeout(2200)
 current=page.evaluate("JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).player")
 report['checks'].append(['directPanelsNoWalk',initial['x']==current['x'] and initial['y']==current['y'] and current['path']==[]])
 close(page)
 fixture(page,"s.phase='open';s.paused=false;s.arrivalIn=999;s.player.x=420;s.player.y=590;s.staff[0].id='tuantuan';s.staff[0].role='bar';const t=s.tables[0];t.status='waiting';t.order={drink:'ale',quantity:2,paid:false,ready:false};t.patience=68;t.patienceMax=115;t.request={id:'lowSugar',fulfilled:false};t.guest={id:1,variant:0,party:2,x:t.x-105,y:t.y+25,path:[]};")
 # Click the guest using renderer's normal projection (world scales to cover the canvas).
 hit=page.evaluate("""()=>{const c=document.querySelector('#world'),r=c.getBoundingClientRect();const scale=Math.max(r.width/1536,r.height/1024);const follow=(position,extent,view)=>{const center=extent/2,margin=Math.min(90,view/4);return position<center-view/2+margin?position+view/2-margin:position>center+view/2-margin?position-view/2+margin:center};const cy=Math.max(r.height/scale/2,Math.min(1024-r.height/scale/2,follow(590,1024,r.height/scale)));return {x:315*scale,y:(453-cy)*scale+r.height/2}}""")
 page.mouse.click(hit['x'],hit['y']);page.wait_for_timeout(2200)
 report['checks'].append(['worldClick',page.locator('#dialogue-root').inner_text()[:100]])
 if page.locator('[data-action=fulfill-request]').count():
  page.locator('[data-action=fulfill-request]').click();report['checks'].append(['requestResponded',page.locator('.request-detail').inner_text()]);shot(page,'pressure-request.png')
 if page.locator('[data-action=player-work],[data-action=player-takeover]').count():
  page.locator('[data-action=player-work],[data-action=player-takeover]').first.click();page.wait_for_timeout(300);report['checks'].append(['ownerWorkVisible',page.locator('.player-card').is_visible()]);shot(page,'pressure-owner-work.png')
 close(page)
 fixture(page,"s.progression.draws=1;s.progression.collection=['eclipse'];s.progression.equipped='eclipse';s.stock.moonwine=12;s.menu.moonwine=true;")
 page.locator('.visit-bar [data-panel=recipes]').click();page.locator('.recipe-card.rarity-legendary').scroll_into_view_if_needed();shot(page,'pressure-recipes.png');report['checks'].append(['ownedLegendaryPrice',page.locator('.recipe-card.rarity-legendary').inner_text()])
 close(page)
 fixture(page,"s.phase='open';s.paused=true;s.arrivalIn=999;s.staff=[e.createEmployee('qingya'),e.createEmployee('tuantuan',1),e.createEmployee('xianyue',2)];s.tables[2].enabled=true;for(let i=0;i<3;i++){const t=s.tables[i];t.status='waiting';t.order={drink:['ale','citrus','tea'][i],quantity:2,paid:false};t.patience=[38,79,102][i];t.patienceMax=115;t.guest={id:i+1,variant:i,party:2,x:t.x-105,y:t.y+25,path:[],companion:{x:t.x+105,y:t.y+25}};t.request=i===0?{id:'express',fulfilled:false}:null;}")
 page.wait_for_timeout(200);shot(page,'pressure-busy.png')
 page.set_viewport_size({'width':1920,'height':1080});fixture(page,"s.elapsed=360;s.phase='open';s.paused=true;s.arrivalIn=999;s.progression.combo.count=6;s.progression.combo.best=6;s.progression.combo.tier=6;s.progression.combo.expiresAt=410;s.progression.party.status='active';s.progression.party.startAt=330;s.progression.party.endsAt=450;")
 page.wait_for_timeout(300);shot(page,'pressure-night-1920.png');page.set_viewport_size({'width':1366,'height':768});page.wait_for_timeout(100);shot(page,'pressure-night-1366.png');page.set_viewport_size({'width':1920,'height':1080});fixture(page,'');page.wait_for_timeout(100);shot(page,'pressure-day-1920.png')
 report['checks'].append(['noDocumentOverflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight')])
 browser.close()
print(json.dumps(report,ensure_ascii=False,indent=2))
