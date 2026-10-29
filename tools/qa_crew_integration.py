"""Integrated final art, production and mouse checks with isolated browser saves."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:4173/'
KEY='moonlit-tankard-save-v1-debug'
report={'checks':[],'errors':[],'screenshots':[]}
def check(name,value):
    assert value,name
    report['checks'].append(name)
def shot(page,name):
    path='screenshots/'+name+'.png'
    page.screenshot(path=str(ROOT/path))
    report['screenshots'].append(path)
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.goto(BASE+'?debug=1')
    page.wait_for_selector('#loading',state='detached')
    # Canonical fixture suppresses arrivals to observe quantity/cost conservation.
    raw=page.evaluate('''async()=>{const e=await import('./src/engine.js'),v=await import('./src/storage.js');const s=e.createGame();s.gold=10000;s.stars=3;s.reputation=4.5;s.milestones=['cellar'];e.act(s,{type:'hire',id:'gemini'});e.act(s,{type:'hire',id:'wenxin'});s.stock.ale=0;s.arrivalIn=999;e.act(s,{type:'cellar-rule',drink:'ale',enabled:true,low:6,target:12});e.act(s,{type:'cellar-auto',enabled:true});e.act(s,{type:'open'});s.cellar.protectedDay=s.day;return v.publicSave(s);}''')
    page.goto(BASE+'assets/index.html')
    page.evaluate('([k,v])=>localStorage.setItem(k,v)',[KEY,raw])
    page.goto(BASE+'?debug=1');page.wait_for_selector('#loading',state='detached')
    page.locator('#cellar-button').click()
    check('named cellar sprites draw actual nontransparent pixels',page.locator('.cellar-actor canvas').evaluate_all('''nodes=>nodes.every(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return a.some((v,i)=>i%4===3&&v>100);})'''))
    page.wait_for_function("document.querySelector('#cellar-live').textContent.includes('还需')")
    shot(page,'crew-cellar-production')
    page.locator('.debug-wrench').click()
    for _ in range(11):page.locator('[data-debug="advance"]').click()
    saved=page.evaluate('k=>JSON.parse(localStorage.getItem(k))',KEY)
    check('real simulation produces and delivers target twelve portions',saved['stock']['ale']==12)
    check('actual procurement paid twelve ingredient costs once',saved['cellar']['automation']['spent']==72)
    check('no duplicate paid batches or stranded output',not saved['cellar']['production']['batch'] and not saved['cellar']['production']['ready'])
    check('first cellar operating day has no natural mice',not saved['cellar']['pests']['mice'])
    page.locator('[data-debug="close"]').click()
    # Reload exact completed state, retaining quantities, spending and closed queues.
    page.reload();page.wait_for_selector('#loading',state='detached')
    again=page.evaluate('k=>JSON.parse(localStorage.getItem(k))',KEY)
    check('reload preserves produced quantities and budget',again['stock']['ale']==12 and again['cellar']['automation']['spent']==72)
    page.locator('.debug-wrench').click()
    page.locator('[data-debug="team"]').click()
    page.locator('[data-debug="tables"]').click()
    page.locator('[data-debug="close"]').click()
    page.locator('[data-action="visit"][data-panel="staff"]').first.click()
    check('seven named employee portraits and separate Tom loaded',page.locator('.staff-detail canvas').count()==8)
    check('expensive Claude price or employed state visible','Claude' in page.locator('#modal-root').inner_text())
    check('no undefined character skills','undefined' not in page.locator('#modal-root').inner_text())
    shot(page,'crew-management')
    page.keyboard.press('Escape')
    shot(page,'crew-five-staff-room')
    check('debug leaves normal game save absent',page.evaluate('localStorage.getItem("moonlit-tankard-save-v1")') is None)
    page.goto(BASE+'assets/index.html')
    check('gallery contains legacy and thirteen expanded crew sheets',page.locator('img[src*="crew-"]').count()==24)
    for width in [1024,1920]:
        page.set_viewport_size({'width':width,'height':900});page.goto(BASE+'?debug=1');page.wait_for_selector('#loading',state='detached');page.locator('#cellar-button').click()
        check('cellar has no horizontal overflow at'+str(width),page.evaluate('document.querySelector(".cellar").scrollWidth<=innerWidth'))
    assert not report['errors'],report['errors']
    browser.close()
(ROOT/'docs/qa-crew-integration-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
