"""Isolated browser checks for the service pipeline; secrets stay in tab memory."""
from pathlib import Path
import argparse
import json
import time
from playwright.sync_api import sync_playwright
from launch import environment_config

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:4173/'
KEY = 'moonlit-tankard-save-v1'
parser = argparse.ArgumentParser()
parser.add_argument('--skip-ai', action='store_true')
args = parser.parse_args()
report = {'checks': [], 'browserErrors': [], 'realAI': {}}
if args.skip_ai and (ROOT / 'docs/qa-service-report.json').exists():
    report['realAI'] = json.loads((ROOT / 'docs/qa-service-report.json').read_text(encoding='utf-8')).get('realAI', {})
    if report['realAI']:
        report['realAI']['verifiedBeforeLatestLayout'] = True
config = {**environment_config(), 'auto': False}


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    report['checks'].append(name)
    print('PASS ' + name, flush=True)


def state(page):
    return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY)


def tick(page, seconds):
    for _ in range(round(seconds * 2)):
        page.clock.run_for(500)


def until(page, expression, seconds=35):
    for _ in range(seconds * 2):
        if page.evaluate(expression):
            return
        page.clock.run_for(500)
    raise AssertionError('Timed out waiting for public gameplay state')


def fixture(page, body):
    raw = page.evaluate("""async body=>{
      const e=await import('./src/engine.js'),v=await import('./src/storage.js');
      const s=e.createGame();new Function('s','e',body)(s,e);return v.publicSave(v.parseGame(v.publicSave(s)));
    }""", body)
    page.goto(BASE + 'assets/index.html')
    page.evaluate('([key,raw])=>localStorage.setItem(key,raw)', [KEY, raw])
    page.goto(BASE)
    page.wait_for_selector('#loading', state='detached')
    tick(page, .5)


def world_click(page, x, y):
    p = state(page)['player']
    target = page.evaluate("""({p,x,y})=>{
      const r=document.querySelector('#world').getBoundingClientRect(),scale=Math.max(r.width/1536,r.height/1024);
      const follow=(position,extent,view)=>{const center=extent/2,margin=Math.min(90,view/4);return position<center-view/2+margin?position+view/2-margin:position>center+view/2-margin?position-view/2+margin:center;};
      const cx=Math.max(r.width/scale/2,Math.min(1536-r.width/scale/2,follow(p.x,1536,r.width/scale)));
      const cy=Math.max(r.height/scale/2,Math.min(1024-r.height/scale/2,follow(p.y,1024,r.height/scale)));
      return {x:(x-cx)*scale+r.width/2,y:(y-cy)*scale+r.height/2};
    }""", {'p': p, 'x': x, 'y': y})
    page.mouse.click(target['x'], target['y'])


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    context = browser.new_context(viewport={'width': 1600, 'height': 1000})
    context.add_init_script("localStorage.setItem('moonlit-preferences',JSON.stringify({auto:false}));")
    page = context.new_page()
    page.on('pageerror', lambda error: report['browserErrors'].append(str(error)))
    page.clock.install()
    page.goto(BASE)
    page.wait_for_selector('#loading', state='detached')
    check('fresh game starts with two usable tables', sum(t['enabled'] for t in state(page)['tables']) == 2)
    page.locator('.visit-bar [data-panel=upgrade]').click()
    before = state(page)['player']
    page.locator('[data-action=expand-table]').first.click()
    check('direct expansion charges 240 gold and unlocks a third table', state(page)['gold'] == 120 and sum(t['enabled'] for t in state(page)['tables']) == 3)
    check('management action leaves owner position and path unchanged', state(page)['player'] == before)
    page.locator('#modal-root .close-button').click()

    fixture(page, """
      s.phase='open';s.arrivalIn=999;s.player.x=420;s.player.y=590;
      s.staff=[e.createEmployee('tuantuan')];
      Object.assign(s.tables[0],{status:'waiting',order:{drink:'ale',quantity:2,paid:false},
        patience:115,patienceMax:115,request:{id:'warm',fulfilled:false},
        guest:{id:1,variant:0,party:2,x:315,y:495,path:[]}});
    """)
    tick(page, 4)
    check('chef waits for real request confirmation without spending stock', state(page)['stock']['ale'] == 12 and state(page)['staff'][0]['job'] is None)
    world_click(page, 315, 453)
    page.locator('[data-action=fulfill-request]').click()
    check('one-click special request persists and extends patience', state(page)['tables'][0]['request']['fulfilled'] and state(page)['tables'][0]['patienceMax'] == 135)
    until(page, "JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).tables[0].status==='ready'")
    check('chef output waits at pass with one ingredient debit', state(page)['stock']['ale'] == 10 and state(page)['stats']['served'] == 0)
    page.locator('[data-action=player-pickup]').click()
    until(page, "!!JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).player.carrying")
    check('player physically reaches visible pass to collect order', abs(state(page)['player']['x'] - 1080) < 2)
    world_click(page, 315, 453)
    until(page, "JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).stats.served===1")
    check('physical delivery pays requested order once', state(page)['stock']['ale'] == 10 and state(page)['stats']['tips'] >= 6)
    page.screenshot(path=str(ROOT / 'screenshots' / 'pressure-service.png'))
    page.locator('#business-button').click()
    page.locator('[data-action=confirm-close]').click()
    balance = state(page)['gold']
    check('closing clears every guest order and work lock', all(t['status'] == 'empty' and not t['guest'] and not t['order'] and not t['worker'] for t in state(page)['tables']))
    page.reload()
    page.wait_for_selector('#loading', state='detached')
    tick(page, 3)
    check('reloading closed night does not pay receipts or wages twice', state(page)['gold'] == balance)

    fixture(page, "s.gold=3000;e.act(s,{type:'hire',id:'tuantuan'});e.act(s,{type:'hire',id:'xinghe'});e.act(s,{type:'role',staff:'qingya',role:'floor'});e.act(s,{type:'open'});s.speed=3;")
    tick(page, 201)
    final = state(page)
    check('full real animation-loop day settles and clears patrons', final['phase'] == 'closed' and final['stats']['served'] > 0 and all(not t['guest'] for t in final['tables']))
    check('all stock remains nonnegative under specialist service', all(v >= 0 for v in final['stock'].values()))
    report['fullDay'] = final['summary']

    if not args.skip_ai and config['key']:
        fixture(page, "s.player.x=450;s.player.y=650;s.staff[0].x=420;s.staff[0].y=650;")
        page.evaluate('(config)=>sessionStorage.setItem("moonlit-ai-session",JSON.stringify(config))', config)
        page.reload()
        page.wait_for_selector('#loading', state='detached')
        tick(page, .5)
        world_click(page, 420, 612)
        until(page, "!!document.querySelector('#dialogue-reply')")
        page.clock.resume()
        page.evaluate("window.partialChanges=0;new MutationObserver(()=>window.partialChanges++).observe(document.querySelector('#dialogue-reply'),{childList:true,characterData:true,subtree:true});")
        start = time.monotonic()
        page.locator('[data-action=quick-chat]').first.click()
        page.wait_for_function("JSON.parse(localStorage.getItem('moonlit-tankard-save-v1')).staff[0].conversation.some(x=>x.role==='staff')", timeout=35000)
        changes = page.evaluate('window.partialChanges')
        check('real model reply streams into scene dialogue and persists', changes >= 2)
        report['realAI'] = {'model': config['model'], 'calls': 1, 'elapsedSeconds': round(time.monotonic() - start, 2), 'partialUpdates': changes}
        page.screenshot(path=str(ROOT / 'screenshots' / 'pressure-ai.png'))
        check('API key absent from ordinary saves', config['key'] not in page.evaluate('(key)=>localStorage.getItem(key)', KEY))
    check('no browser runtime errors', not report['browserErrors'])
    browser.close()

(ROOT / 'docs' / 'qa-service-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'checks': len(report['checks']), 'browserErrors': len(report['browserErrors']), 'realAI': report['realAI']}, ensure_ascii=True))
