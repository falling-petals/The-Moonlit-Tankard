"""Isolated mouse-hit and overlay layout checks. No model credentials or calls."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:4173/'
KEY = 'moonlit-tankard-save-v1'
report = {'checks': [], 'browserErrors': [], 'screenshots': []}


def check(name, condition):
    assert condition, name
    report['checks'].append(name)
    print('PASS ' + name, flush=True)


def tick(page, seconds=1):
    page.clock.run_for(round(seconds * 1000))


def state(page):
    return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY)


def close(page):
    page.keyboard.press('Escape')


def fixture(page, body=''):
    raw = page.evaluate("""async body=>{const e=await import('./src/engine.js'),v=await import('./src/storage.js'),s=e.createGame();new Function('s','e',body)(s,e);return v.publicSave(v.parseGame(v.publicSave(s)));}""", body)
    page.goto(BASE + 'assets/index.html')
    page.evaluate('([k,v])=>localStorage.setItem(k,v)', [KEY, raw])
    page.goto(BASE)
    page.wait_for_selector('#loading', state='detached')
    tick(page, .5)


def world_click(page, x, y):
    target = page.evaluate("""({p,x,y})=>{const r=document.querySelector('#world').getBoundingClientRect(),scale=Math.max(r.width/1536,r.height/1024);const follow=(position,extent,view)=>{const c=extent/2,m=Math.min(90,view/4);return position<c-view/2+m?position+view/2-m:position>c+view/2-m?position-view/2+m:c;};const cx=Math.max(r.width/scale/2,Math.min(1536-r.width/scale/2,follow(p.x,1536,r.width/scale))),cy=Math.max(r.height/scale/2,Math.min(1024-r.height/scale/2,follow(p.y,1024,r.height/scale)));return {x:(x-cx)*scale+r.width/2,y:(y-cy)*scale+r.height/2};}""", {'p': state(page)['player'], 'x': x, 'y': y})
    page.mouse.click(target['x'], target['y'])
    tick(page, .5)


def shot(page, name):
    path = 'refined-' + name + '.png'
    page.screenshot(path=str(ROOT / 'screenshots' / path), animations='disabled')
    report['screenshots'].append(path)


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    context = browser.new_context(viewport={'width': 1366, 'height': 768})
    context.add_init_script("localStorage.setItem('moonlit-preferences',JSON.stringify({auto:false}));")
    page = context.new_page()
    page.on('pageerror', lambda e: report['browserErrors'].append(str(e)))
    page.clock.install()
    page.goto(BASE)
    page.wait_for_selector('#loading', state='detached')
    tick(page, .5)
    shot(page, 'room')
    world_click(page, 1110, 705)
    check('locked floor is only a movement target', page.locator('[role=dialog]').count() == 0)
    world_click(page, 420, 470)
    check('tabletop does not open a panel', page.locator('[role=dialog]').count() == 0)
    fixture(page)
    before = state(page)['player']
    for panel in ['menu', 'recipes', 'staff', 'stock', 'upgrade', 'night']:
        close(page)
        page.locator('.visit-bar [data-panel=' + panel + ']').click()
        tick(page, .3)
        box = page.locator('.modal').bounding_box()
        check(panel + ' management sheet is centered and wider than sidebar', abs(box['x'] + box['width'] / 2 - 683) < 2 and box['width'] >= 880)
        check(panel + ' sheet stays inside viewport', box['y'] >= 20 and box['y'] + box['height'] <= 748)
        check(panel + ' has no horizontal content overflow', page.locator('.modal-content').evaluate('(e)=>e.scrollWidth<=e.clientWidth'))
        if panel in ['menu', 'staff', 'recipes']:
            shot(page, panel)
    check('management keeps player position', state(page)['player'] == before)
    check('body type is reduced to 13 pixels', page.evaluate('getComputedStyle(document.body).fontSize') == '13px')
    close(page)
    page.locator('.visit-bar [data-panel=upgrade]').click()
    page.locator('[data-action=expand-table]').click()
    check('expansion is still available from menu', state(page)['gold'] == 120 and sum(t['enabled'] for t in state(page)['tables']) == 3)
    close(page)
    fixture(page, "s.phase='open';s.paused=true;s.player.x=420;s.player.y=590;s.staff[0].x=1050;s.staff[0].y=365;const t=s.tables[0];Object.assign(t,{status:'waiting',patience:70,patienceMax:115,request:{id:'warm',fulfilled:false},order:{drink:'tea',quantity:2,paid:false},guest:{id:1,variant:0,party:2,x:315,y:495,path:[]}});")
    world_click(page, 420, 470)
    check('occupied table body remains noninteractive', page.locator('[role=dialog]').count() == 0)
    world_click(page, 315, 453)
    box = page.locator('.guest-card').bounding_box()
    check('guest opens a small nearby request card', box['width'] <= 325 and box['height'] < 310 and page.locator('.modal').count() == 0)
    page.locator('[data-action=fulfill-request]').click()
    check('small request action updates the real order', state(page)['tables'][0]['request']['fulfilled'])
    shot(page, 'request')
    page.locator('#pause').click()
    tick(page, 105)
    check('guest card closes when the guest leaves', page.locator('.guest-card').count() == 0)
    close(page)
    fixture(page, "s.player.x=450;s.player.y=650;s.staff[0].x=420;s.staff[0].y=650;")
    world_click(page, 420, 612)
    tick(page, 2)
    box = page.locator('.dialogue-box').bounding_box()
    check('staff chat is compact and scene anchored', box['width'] <= 325 and box['height'] < 310 and box['x'] > 250)
    check('chat input and quick replies remain usable', page.locator('#chat-input').is_visible() and page.locator('[data-action=quick-chat]').count() == 2)
    shot(page, 'chat')
    close(page)
    fixture(page, "s.phase='open';s.paused=true;s.elapsed=320;Object.assign(s.progression.combo,{count:10,best:10,tier:10,expiresAt:360});")
    box = page.locator('#combo-hud').bounding_box()
    check('combo uses a compact tiered badge', box['width'] <= 155 and page.locator('#combo-hud').get_attribute('data-tier') == '10')
    shot(page, 'combo')
    for width, height in [(1920, 1080), (1024, 768)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.locator('.visit-bar [data-panel=menu]').click()
        tick(page, .5)
        box = page.locator('.modal').bounding_box()
        check(str(width) + ' sheet remains centered and on screen', abs(box['x'] + box['width'] / 2 - width / 2) < 2 and box['y'] + box['height'] < height)
        close(page)
    check('no runtime errors', not report['browserErrors'])
    browser.close()

(ROOT / 'docs/qa-overlays-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('Checks passed: ' + str(len(report['checks'])))
