"""Stock purchases and live delivery retain the mounted panel, scroll and focus."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:4173/'
report = {'checks': [], 'errors': [], 'sizes': []}


def check(name, ok):
    assert ok, name
    report['checks'].append(name)
    print('PASS ' + name, flush=True)


def fixture(page, body=''):
    raw = page.evaluate("""async body=>{
      const e=await import('./src/engine.js'), v=await import('./src/storage.js');
      const s=e.createGame();s.gold=10000;
      for(const id of Object.keys(s.stock))s.stock[id]=12;
      new Function('s','e',body)(s,e);
      return v.publicSave(s);
    }""", body)
    page.goto(BASE+'assets/index.html')
    page.evaluate('(raw)=>localStorage.setItem("moonlit-tankard-save-v1-debug",raw)', raw)
    page.goto(BASE+'?debug=1')
    page.wait_for_selector('#loading', state='detached')
    page.clock.run_for(300)
    page.locator('.visit-bar [data-panel=stock]').click()


def mount_marks(page):
    page.evaluate("""()=>{
      window.stockMarks={sheet:document.querySelector('.modal'),body:document.querySelector('.modal-content'),
        button:document.querySelector('[data-action=restock][data-drink=tea]')};
      stockMarks.body.scrollTop=stockMarks.body.scrollHeight;
      stockMarks.button.focus({preventScroll:true});
      stockMarks.scroll=stockMarks.body.scrollTop;
    }""")


def unchanged(page):
    return page.evaluate("""()=>stockMarks.sheet===document.querySelector('.modal')&&
      stockMarks.body===document.querySelector('.modal-content')&&
      stockMarks.button===document.querySelector('[data-action=restock][data-drink=tea]')&&
      Math.abs(stockMarks.body.scrollTop-stockMarks.scroll)<1&&document.activeElement===stockMarks.button""")


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1366, 'height': 768})
    page.on('pageerror', lambda error: report['errors'].append(str(error)))
    page.add_init_script("localStorage.setItem('moonlit-preferences',JSON.stringify({auto:false}));")
    page.clock.install()
    page.goto(BASE+'?debug=1')
    page.wait_for_selector('#loading', state='detached')
    fixture(page)
    mount_marks(page)
    check('lower stock rows can scroll', page.evaluate('stockMarks.scroll>0'))
    page.locator('[data-action=restock][data-drink=tea]').click()
    page.clock.run_for(1000)
    check('purchase preserves sheet, scroller, card button, scroll and focus', unchanged(page))
    check('purchase uses the real six-unit cost and updates stock', page.evaluate("""()=>{
      const s=JSON.parse(localStorage.getItem('moonlit-tankard-save-v1-debug'));
      return s.stock.tea===18&&s.gold===9982&&
        stockMarks.button.closest('.item-card').querySelector('.price-line').textContent.includes('库存 18 / 24')&&
        document.querySelector('.modal-footer b.gold').textContent==='9982 G';
    }"""))
    page.locator('[data-action=restock][data-drink=tea]').click()
    page.clock.run_for(500)
    check('full stock updates the existing disabled button and meter', page.evaluate("""()=>
      stockMarks.button===document.querySelector('[data-action=restock][data-drink=tea]')&&
      stockMarks.button.disabled&&stockMarks.button.textContent==='储藏已满'&&
      stockMarks.button.closest('.item-card').querySelector('.stock-meter i').style.width==='100%'&&
      stockMarks.body.scrollTop===stockMarks.scroll"""))
    for width, height in [(1366, 768), (1440, 900), (1024, 768), (600, 768)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.clock.run_for(300)
        bounds = page.locator('.modal').bounding_box()
        content = page.locator('.modal-content').bounding_box()
        report['sizes'].append({'viewport': [width, height], 'sheet': bounds, 'content': content})
        check(f'{width}x{height} stock panel centered and in bounds', abs(bounds['x']+bounds['width']/2-width/2)<2 and bounds['y']>=16 and bounds['y']+bounds['height']<=height-16)
        check(f'{width}x{height} readable scrolling viewport', content['height'] >= (height-300) and page.locator('.modal-content').evaluate('(e)=>e.scrollWidth<=e.clientWidth'))
    page.set_viewport_size({'width':1366, 'height':768})
    fixture(page, 's.gold=80;')
    page.evaluate("window.ciderButton=document.querySelector('[data-action=restock][data-drink=cider]')")
    check('affordable drink starts enabled', page.evaluate('!ciderButton.disabled'))
    page.locator('[data-action=restock][data-drink=tea]').click()
    check('purchase immediately disables unaffordable existing controls', page.evaluate("ciderButton.disabled&&ciderButton===document.querySelector('[data-action=restock][data-drink=cider]')"))
    fixture(page,"s.phase='open';s.arrivalIn=1000;const w=s.staff[0],t=s.tables[0];w.role='bar';w.job={kind:'order',table:t.id,stage:'prepare',remaining:1};Object.assign(t,{status:'preparing',worker:w.id,patience:5,patienceMax:115,order:{drink:'ale',quantity:1,paid:false},guest:{id:1,variant:0,party:1,x:315,y:495,path:[]}});")
    mount_marks(page)
    page.clock.run_for(2000)
    check('ready pickup list appears without replacing inventory or moving scroll/focus', unchanged(page) and page.locator('.ready-list [data-action=player-pickup]').count()==1)
    page.clock.run_for(4000)
    check('expired ready pickup list disappears while inventory stays mounted', unchanged(page) and page.locator('.ready-list').count()==0)
    fixture(page,"s.milestones=['cellar'];e.act(s,{type:'hire',id:'gemini'});e.act(s,{type:'cellar-rule',drink:'ale',enabled:true,low:13,target:18});e.act(s,{type:'cellar-auto',enabled:false});s.phase='open';s.arrivalIn=1000;s.cellar.automation.cooldown=3;")
    page.locator('[data-restock-auto]').check()
    mount_marks(page)
    starting_gold = page.locator('.modal-footer b.gold').inner_text()
    page.clock.run_for(4000)
    check('instant paid replenishment live-updates the same mounted stock panel', unchanged(page) and page.locator('[data-drink=ale]').first.locator('..').inner_text().find('库存 18 / 24')>=0)
    check('automatic purchase charge live-updates gold footer', page.locator('.modal-footer b.gold').inner_text()==str(int(starting_gold.split()[0])-36)+' G')
    check('no browser errors', not report['errors'])
    check('normal save is untouched', page.evaluate("localStorage.getItem('moonlit-tankard-save-v1')===null"))
    page.screenshot(path=str(ROOT/'.superpowers/stock-panel-768.png'))
    browser.close()
(ROOT/'.superpowers/stock-panel-qa.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
