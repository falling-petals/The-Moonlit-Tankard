from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(channel='chrome',headless=True)
 page=browser.new_page(viewport={'width':1366,'height':900})
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:4173/?debug=1')
 page.wait_for_selector('#loading',state='detached')
 page.locator('.debug-wrench').click()
 page.locator('[data-debug="team"]').click()
 page.locator('[data-debug="close"]').click()
 page.locator('#cellar-button').click()
 page.wait_for_selector('.cellar.is-in')
 page.locator('.cellar-actor[data-staff="gemini"]').click()
 assert page.locator('.dialogue-name').inner_text().startswith('Gemini')
 assert page.locator('#staff-role option').count()==3
 assert page.locator('.dialogue-box').bounding_box()['width']==320
 page.locator('.cellar-actor[data-staff="wenxin"]').click()
 assert page.locator('#staff-role').get_attribute('data-staff')=='wenxin'
 page.locator('.cellar-actor[data-staff="gemini"]').click()
 assert page.locator('.dialogue-name').inner_text().startswith('Gemini')
 page.locator('[data-action="close-modal"]').click()
 page.locator('.cellar-rules summary').click()
 budget=page.locator('[data-cellar-budget]')
 budget.fill('240')
 page.wait_for_timeout(800)
 assert budget.input_value()=='240'
 budget.press('Tab')
 page.locator('.cellar-rule-row[data-drink="ale"] [data-rule="enabled"]').check()
 page.locator('[data-action="cellar-save-rule"][data-drink="ale"]').click()
 page.locator('[data-cellar-auto]').check()
 page.locator('.debug-wrench').click()
 page.locator('[data-debug="open"]').click()
 page.locator('[data-debug="open"]').click()
 assert page.locator('#debug-result').inner_text()!='已应用'
 assert page.locator('#debug-result').get_attribute('class')=='debug-error'
 page.locator('[data-debug="close"]').click()
 page.wait_for_function("JSON.parse(localStorage.getItem('moonlit-tankard-save-v1-debug')).elapsed>1",timeout=12000)
 saved=page.evaluate("JSON.parse(localStorage.getItem('moonlit-tankard-save-v1-debug'))")
 assert saved['elapsed']>1
 assert '12:' in page.locator('#cellar-live b').inner_text()
 assert '鼠患损耗' in page.locator('#cellar-live').inner_text()
 assert saved['cellar']['automation']['budget']==240
 assert saved['cellar']['automation']['rules']['ale']['enabled']
 assert not page.evaluate("localStorage.getItem('moonlit-tankard-save-v1')")
 page.screenshot(path=str(ROOT/'screenshots'/'crew-cellar-task3.png'),full_page=True)
 page.locator('.debug-wrench').click()
 page.locator('[data-debug-value="mice"]').fill('4')
 page.locator('[data-debug="mice"]').click()
 page.locator('[data-debug="tom"]').click()
 page.locator('[data-debug="close"]').click()
 page.wait_for_timeout(350)
 page.locator('#cellar-button').click()
 page.wait_for_selector('.cellar-tom.is-pouncing')
 assert page.locator('.cellar-mice canvas[data-art="crew-mouse-atlas"]').count()>0
 assert page.locator('.cellar-actor[data-staff="gemini"].is-assisting').count()==1
 assert page.locator('.cellar-tom canvas').get_attribute('data-rendered-frame')=='18'
 page.wait_for_timeout(550)
 page.screenshot(path=str(ROOT/'screenshots'/'crew-cellar-task3-live-art.png'),full_page=True)
 assert not errors, errors
 page.locator('[data-action="cellar-close"]').click()
 page.wait_for_timeout(400)
 assert page.locator('.dialogue-box').count()==0
 page.reload()
 page.wait_for_selector('#loading',state='detached')
 assert page.locator('.debug-wrench').count()==1
 print(json.dumps({'passed':['seven crew preset','cellar mini chat roles and 320px','focused budget preserved','explicit rule and auto','simulation continues in cellar','debug normal save isolation','reload remains debug','private dialogue closed','cellar actor switch and close','debug engine failure shown','shared clock and mouse loss','atlas mice','Tom pounce pose','Gemini assist pose'],'errors':errors},ensure_ascii=False))
 browser.close()
