"""Cellar room, approach, map mouse interactions and shared paid restocking in Chrome."""
from pathlib import Path
import json,math
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:4173/';KEY='moonlit-tankard-save-v1-debug'
report={'checks':[],'errors':[],'screenshots':[]}
def check(name,value):
    assert value,name
    report['checks'].append(name);print('PASS '+name,flush=True)
def shot(page,name):
    path='screenshots/'+name+'.png';page.screenshot(path=str(ROOT/path));report['screenshots'].append(path)
def map_point(page,x,y):
    r=page.locator('#cellar-scene').bounding_box();scale=min(r['width']/816,r['height']/530)
    return (r['x']+(r['width']-816*scale)/2+x*scale,r['y']+(r['height']-530*scale)/2+y*scale)

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':900});page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.add_init_script("localStorage.setItem('moonlit-preferences',JSON.stringify({auto:false}));")
    page.clock.install();page.goto(BASE+'?debug=1');page.wait_for_selector('#loading',state='detached');page.clock.run_for(400)
    # The upper-left hatch is a real scene hit target, gated before unlock.
    r=page.locator('#world').bounding_box();scale=max(r['width']/1536,r['height']/1024)
    entry=(r['x']+r['width']/2+(260-768)*scale,r['y']+r['height']/2+(343-512)*scale)
    page.mouse.click(*entry);page.clock.run_for(300)
    check('floor hatch is locked before cellar milestone',page.locator('#cellar-scene').count()==0 and '地窖还锁着' in page.locator('#toast').inner_text())
    raw=page.evaluate('''async()=>{const e=await import('./src/engine.js'),v=await import('./src/storage.js');const s=e.createGame();s.gold=10000;s.stars=5;s.reputation=5;s.milestones=['cellar','regulars','moonlit'];e.act(s,{type:'hire',id:'gemini'});e.act(s,{type:'hire',id:'wenxin'});e.act(s,{type:'cellar-hire-tom'});s.arrivalIn=999;s.stock.ale=0;return v.publicSave(s);}''')
    page.goto(BASE+'assets/index.html');page.evaluate('([k,raw])=>localStorage.setItem(k,raw)',[KEY,raw]);page.goto(BASE+'?debug=1');page.wait_for_selector('#loading',state='detached');page.clock.run_for(300)
    shot(page,'cellar-upper-left-entrance');page.mouse.click(*entry);page.clock.run_for(7500)
    check('owner approaches upstairs hatch and enters cellar',page.locator('#cellar-scene').count()==1)
    page.clock.run_for(500)
    check('three actual workers appear on supplied room map',page.locator('.cellar-actors .cellar-actor').count()==3)
    check('management drawers start closed',page.locator('.cellar-drawer:not([hidden])').count()==0)
    check('supplied map has nonblank rendered pixels',page.locator('#cellar-scene').evaluate("c=>c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data[3]===255"))
    page.mouse.click(*map_point(page,440,450));page.clock.run_for(4200)
    check('owner walks around island to clicked cellar floor',page.locator('#cellar-scene').evaluate("c=>Number(c.dataset.playerY)>410&&Number(c.dataset.playerX)<500"))
    page.locator('.cellar-actor[data-staff="wenxin"]').click();page.clock.run_for(2500)
    check('click employee approaches and opens compact scene chat',page.locator('.dialogue-box').count()==1 and page.locator('.dialogue-box').bounding_box()['width']==320 and '文心' in page.locator('.dialogue-name').inner_text())
    page.keyboard.press('Escape');page.clock.run_for(350)
    check('Escape closes chat while retaining cellar room',page.locator('.dialogue-box').count()==0 and page.locator('#cellar-scene').count()==1)
    # A new management choice cancels any pending NPC approach.
    page.locator('.cellar-actor[data-staff="gemini"]').click();page.locator('[data-action="cellar-panel"][data-panel="supply"]').click();page.clock.run_for(4000)
    check('supplies cancel pending dialogue instead of reopening it',page.locator('.dialogue-box').count()==0 and page.locator('[data-cellar-panel="supply"]').is_visible())
    page.locator('[data-cellar-panel="supply"] .restock-settings summary').click()
    page.locator('[data-cellar-panel="supply"] [data-restock-budget]').fill('240')
    page.locator('[data-cellar-panel="supply"] [data-restock-low]').fill('6')
    page.locator('[data-cellar-panel="supply"] [data-restock-target]').fill('12')
    page.locator('[data-cellar-panel="supply"] [data-action="supply-save"]').click()
    page.locator('[data-cellar-panel="supply"] [data-action="cellar-panel-close"]').click()
    # Starting business through the actual engine controls keeps one simulation.
    page.locator('.debug-wrench').click();page.locator('[data-debug="open"]').click();page.locator('[data-debug="close"]').click();page.clock.run_for(400)
    if not page.locator('#cellar-scene').count():page.locator('#cellar-button').click();page.clock.run_for(400)
    before=page.locator('.cellar-actor[data-staff="gemini"] canvas').get_attribute('data-scene-y')
    page.clock.run_for(3000)
    check('actual replenishment animates staff on room map',page.locator('.cellar-actor[data-staff="gemini"] canvas').get_attribute('data-scene-y')!=before)
    shot(page,'cellar-map-working')
    page.clock.run_for(3000)
    saved=page.evaluate('k=>JSON.parse(localStorage.getItem(k))',KEY)
    check('shared simulation actually replenishes target twelve portions',saved['stock']['ale']==12)
    check('actual procurement only costs seventy-two gold',saved['cellar']['automation']['spent']==72)
    # Pausing freezes the scene owner; real mice are still manually actionable.
    page.locator('#cellar-pause').click();page.clock.run_for(300)
    point=page.locator('#cellar-scene').evaluate('c=>[c.dataset.playerX,c.dataset.playerY]')
    page.mouse.click(*map_point(page,216,414));page.clock.run_for(1000)
    check('pause freezes owner walking in cellar',point==page.locator('#cellar-scene').evaluate('c=>[c.dataset.playerX,c.dataset.playerY]'))
    page.locator('.debug-wrench').click();page.locator('[data-debug-value="mice"]').fill('4');page.locator('[data-debug="mice"]').click();page.locator('[data-debug="close"]').click();page.clock.run_for(400)
    if not page.locator('#cellar-scene').count():page.locator('#cellar-button').click();page.clock.run_for(400)
    check('real mice have small clickable map sprites',page.locator('.cellar-map-mouse').count()==4)
    page.locator('.cellar-map-mouse').first.click();page.clock.run_for(350)
    check('clicking map mouse removes exactly one real pest',page.locator('.cellar-map-mouse').count()==3)
    page.locator('#cellar-pause').click();page.clock.run_for(1600)
    check('Tom and Gemini act on actual pest state',page.locator('.cellar-map-mouse').count()<=1)
    shot(page,'cellar-map-mice')
    check('removed aging menu no longer appears',page.locator('[data-panel="storage"]').count()==0 and page.locator('.cask').count()==0)
    page.locator('[data-action="cellar-panel"][data-panel="supply"]').click();page.clock.run_for(200)
    check('one shared supply policy opens over map',page.locator('[data-cellar-panel="supply"]').is_visible() and page.locator('[data-restock-budget]').input_value()=='240')
    page.keyboard.press('Escape');page.clock.run_for(200)
    check('Escape closes supply without leaving map',page.locator('[data-cellar-panel="supply"]').is_hidden() and page.locator('#cellar-scene').count()==1)
    page.locator('[data-action="cellar-close"]').click();page.clock.run_for(400)
    check('upstairs control restores tavern room',page.locator('#cellar-scene').count()==0)
    check('normal save untouched',page.evaluate('localStorage.getItem("moonlit-tankard-save-v1")') is None)
    check('zero browser runtime errors',not report['errors']);browser.close()
(ROOT/'docs/qa-cellar-map-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
