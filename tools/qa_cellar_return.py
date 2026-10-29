"""Small supplemental check for real stairs exit and desktop resizing."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:4173/'
report={'checks':[],'errors':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':900});page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.clock.install();page.goto(BASE+'?debug=1');page.wait_for_selector('#loading',state='detached');page.clock.run_for(300)
    page.locator('.debug-wrench').click();page.locator('[data-debug="team"]').click();page.locator('[data-debug="close"]').click();page.locator('#cellar-button').click();page.clock.run_for(500)
    for width,height in [(1024,768),(1920,1080)]:
        page.set_viewport_size({'width':width,'height':height});page.clock.run_for(400)
        assert page.locator('.cellar-map').evaluate('n=>n.scrollWidth<=innerWidth&&n.scrollHeight<=innerHeight')
        assert page.locator('.cellar-actors .cellar-actor').evaluate_all('nodes=>nodes.length===2&&nodes.every(n=>{const r=n.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})')
        report['checks'].append('cellar and actors fit '+str(width)+'x'+str(height))
    r=page.locator('#cellar-scene').bounding_box();scale=min(r['width']/816,r['height']/530)
    page.mouse.click((r['width']-816*scale)/2+625*scale,(r['height']-530*scale)/2+100*scale);page.clock.run_for(800)
    assert page.locator('#cellar-scene').count()==0
    report['checks'].append('clicking actual map stairs returns upstairs')
    page.locator('#cellar-button').click();page.clock.run_for(500);assert page.locator('#cellar-scene').count()==1
    report['checks'].append('bottom menu still enters cellar directly')
    assert not report['errors'];browser.close()
(ROOT/'docs/qa-cellar-return-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
