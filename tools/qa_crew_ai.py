"""Real browser dialogue check in an isolated context; never writes credentials."""
from pathlib import Path
import json,time
from playwright.sync_api import sync_playwright
from launch import environment_config

ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:4173/'
KEY='moonlit-tankard-save-v1-debug'
config={**environment_config(),'auto':False}
if not config['key']:
    raise SystemExit('No environment model credential configured.')
report={'checks':[],'errors':[],'realAI':{'calls':0}}
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.on('pageerror',lambda error:report['errors'].append(str(error)))
    page.add_init_script('sessionStorage.setItem("moonlit-ai-session",'+json.dumps(json.dumps(config))+');')
    page.goto(BASE+'?debug=1')
    page.wait_for_selector('#loading',state='detached')
    # No normal save, invitation or tutorial state is touched.
    page.locator('[data-action="visit"][data-panel="staff"]').first.click()
    page.locator('[data-action="chat"][data-staff="qingya"]').click()
    page.wait_for_selector('#chat-input',timeout=15000)
    page.evaluate('''()=>{window.__partialCount=0;new MutationObserver(()=>window.__partialCount++).observe(document.querySelector('#dialogue-reply'),{childList:true,characterData:true,subtree:true});}''')
    page.locator('#chat-input').fill('记住，店主希望你以后叫我小何，不要再叫鱼片。今天先优先收桌，请提出这个工作安排，等我点应用。')
    started=time.monotonic()
    page.locator('#chat-form button[type="submit"]').click()
    page.wait_for_function("document.querySelector('#dialogue-reply').textContent.length>5 && !document.querySelector('#dialogue-reply').classList.contains('dialogue-reply-stream')",timeout=45000)
    page.wait_for_function('''key=>{const s=JSON.parse(localStorage.getItem(key));return s.staff[0].memoryBook.some(m=>m.text.includes('小何'))&&s.staff[0].pendingPlan?.type==='policy';}''',arg=KEY,timeout=12000)
    first=page.locator('#dialogue-reply').inner_text()
    report['realAI']={'calls':1,'firstSeconds':round(time.monotonic()-started,2),'partialUpdates':page.evaluate('window.__partialCount'),'firstReply':first}
    page.locator('.dialogue-details summary').click()
    page.locator('[data-action="plan-apply"]').click()
    assert page.evaluate('key=>JSON.parse(localStorage.getItem(key)).staff[0].workPolicy',KEY)=='clean-first'
    report['checks'].append('real model candidate plan applied to actual worker policy')
    page.reload()
    page.wait_for_selector('#loading',state='detached')
    page.locator('[data-action="visit"][data-panel="staff"]').first.click()
    page.locator('[data-action="chat"][data-staff="qingya"]').click()
    page.wait_for_selector('#chat-input',timeout=15000)
    page.locator('#chat-input').fill('你还记得我希望你怎么称呼我吗？顺便确认当前的工作安排。简短回答。')
    page.locator('#chat-form button[type="submit"]').click()
    page.wait_for_function("document.querySelector('#dialogue-reply').classList.contains('dialogue-reply-stream')",timeout=10000)
    page.wait_for_function("!document.querySelector('#dialogue-reply').classList.contains('dialogue-reply-stream') && document.querySelector('#dialogue-reply').textContent.includes('小何')",timeout=45000)
    report['realAI']['calls']=2
    report['realAI']['recallReply']=page.locator('#dialogue-reply').inner_text()
    report['checks'].append('reload retains preferred name and real model recalls it')
    recall=report['realAI']['recallReply']
    assert '收桌' in recall and any(word in recall for word in ['已','优先']),recall
    assert not any(word in recall for word in ['等你','待应用','请点击','点应用']),recall
    assert page.evaluate('key=>JSON.parse(localStorage.getItem(key)).staff[0].pendingPlan',KEY) is None
    report['checks'].append('real model confirms applied policy without asking to apply it again')
    saved=page.evaluate('key=>localStorage.getItem(key)',KEY)
    assert config['key'] not in saved
    assert page.evaluate('localStorage.getItem("moonlit-tankard-save-v1")') is None
    assert page.evaluate('localStorage.getItem("moonlit-invitation-v1")') is None
    report['checks'].extend(['normal save untouched','API key excluded from game state','dialogue remains compact'])
    assert page.locator('.dialogue-box').bounding_box()['width']==320
    page.screenshot(path=str(ROOT/'screenshots/crew-real-ai-memory.png'))
    assert not report['errors'],report['errors']
    browser.close()
(ROOT/'docs/qa-crew-ai-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
