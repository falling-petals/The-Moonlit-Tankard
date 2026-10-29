"""Real browser sprite/portrait/preview checks in isolated local saves.

Uses one real model request when environment configuration is available.
Never writes or prints credentials; no player save is opened.
"""
from pathlib import Path
import json,time,argparse
from playwright.sync_api import sync_playwright
from launch import environment_config

ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:4173/'
parser=argparse.ArgumentParser();parser.add_argument('--skip-ai',action='store_true');args=parser.parse_args()
report={'checks':[],'errors':[],'realAI':{'calls':0},'screenshots':[]}
if args.skip_ai:
    previous=json.loads((ROOT/'docs/qa-character-motion-report.json').read_text(encoding='utf-8'))
    report['realAI']={**previous['realAI'],'reusedFromPreviousRun':True}
    report['screenshots'].append('screenshots/character-motion-real-chat.png')
def check(name,value):
    assert value,name
    report['checks'].append(name)
def shot(page,name):
    path='screenshots/'+name+'.png';page.screenshot(path=str(ROOT/path));report['screenshots'].append(path)

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    requests=[]
    page.on('request',lambda r:requests.append(r.url.split('?')[0]))
    config={**environment_config(),'auto':False}
    if args.skip_ai:config['key']=''
    if config['key']:
        page.add_init_script('sessionStorage.setItem("moonlit-ai-session",'+json.dumps(json.dumps(config))+');')
    page.goto(BASE+'?debug=1');page.wait_for_selector('#loading',state='detached')
    loaded=[url for url in requests if '-motion-v2-atlas.png' in url]
    check('only eight active character sheets preload in the game',len(set(loaded))==8)
    check('reserve sprites do not preload',not any('crew-kimi-motion' in url or 'crew-grok-motion' in url for url in requests))
    page.locator('.debug-wrench').click();page.locator('[data-debug="team"]').click();page.locator('[data-debug="tables"]').click();page.locator('[data-debug="close"]').click()
    page.locator('[data-action="visit"][data-panel="staff"]').first.click()
    check('all employed and Tom management portraits use motion sheets',page.locator('.staff-detail canvas').evaluate_all("nodes=>nodes.length===8&&nodes.every(n=>n.dataset.renderedAtlas?.includes('-motion-v2-atlas'))"))
    page.keyboard.press('Escape');shot(page,'character-motion-five-staff')
    page.locator('#cellar-button').click()
    page.locator('.cellar-actor[data-staff="gemini"]').click();page.wait_for_selector('#chat-input')
    check('chat remains compact with a cropped expression portrait',page.locator('.dialogue-box').bounding_box()['width']==320 and page.locator('.dialogue-avatar canvas').get_attribute('data-portrait')=='true')
    if config['key']:
        page.locator('#chat-input').fill('今天大家配合得很棒，辛苦你啦！用你开心时的语气简单回应一下店主。')
        started=time.monotonic();page.locator('#chat-form button[type="submit"]').click()
        page.wait_for_function("document.querySelector('.dialogue-avatar canvas').dataset.emotion==='thinking'")
        check('request shows thinking sprite immediately',page.locator('.dialogue-avatar canvas').get_attribute('data-rendered-frame')=='16')
        page.wait_for_function("document.querySelector('#dialogue-reply').textContent.length>5&&!document.querySelector('#dialogue-reply').classList.contains('dialogue-reply-stream')",timeout=45000)
        reply=page.locator('#dialogue-reply').inner_text();emotion=page.locator('.dialogue-avatar canvas').get_attribute('data-emotion')
        check('real model response drives an allowed portrait expression',emotion in ['neutral','happy','sad','angry','thinking','surprised','working','tired'])
        report['realAI']={'calls':1,'seconds':round(time.monotonic()-started,2),'reply':reply,'emotion':emotion}
        shot(page,'character-motion-real-chat')
        raw=page.evaluate('localStorage.getItem("moonlit-tankard-save-v1-debug")')
        check('game save excludes API credential',config['key'] not in raw)
    check('normal player save remains untouched',page.evaluate('localStorage.getItem("moonlit-tankard-save-v1")') is None)
    (ROOT/'docs/qa-character-motion-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    page.goto(BASE+'assets/characters.html');page.wait_for_function("document.querySelectorAll('.character').length===13&&document.querySelector('canvas').dataset.frame!==undefined")
    check('thirteen characters have interactive motion previews',page.locator('.character').count()==13)
    for direction,start in [('up',4),('left',8),('right',12),('down',0)]:
        page.locator('#pose').select_option(direction)
        page.wait_for_function('''([d,start])=>{const c=document.querySelector('canvas');return c.dataset.direction===d&&Number(c.dataset.frame)>=start&&Number(c.dataset.frame)<=start+2;}''',arg=[direction,start])
        check('preview displays authored '+direction+' frames',True)
    page.locator('.character[data-character="deepseek"] [data-emotion="angry"]').click()
    check('individual expression button selects angry pose',page.locator('.character[data-character="deepseek"] canvas').get_attribute('data-frame')=='15')
    page.locator('#pose').select_option('happy');page.wait_for_function("document.querySelector('canvas').dataset.frame==='7'")
    shot(page,'character-motion-expression-room')
    page.locator('#pose').select_option('left')
    page.locator('#play').click();frame=page.locator('canvas').first.get_attribute('data-frame');page.wait_for_timeout(350)
    held=[frame]
    for _ in range(4):
        page.wait_for_timeout(160);held.append(page.locator('canvas').first.get_attribute('data-frame'))
    check('preview pause holds a walking frame across a full gait cycle',len(set(held))==1 and page.locator('#play').get_attribute('aria-pressed')=='false')
    page.locator('.character').last.scroll_into_view_if_needed()
    page.wait_for_function("[...document.querySelectorAll('.character canvas')].every(c=>c.dataset.frame!==undefined)")
    check('all reserve character images decode and render when scrolled into view',page.locator('.tag').filter(has_text='素材读取失败').count()==0)
    for width in [1024,1920]:
        page.set_viewport_size({'width':width,'height':1000});check('preview no horizontal overflow at '+str(width),page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    reduced=browser.new_page(reduced_motion='reduce');reduced.goto(BASE+'assets/characters.html');reduced.wait_for_selector('.character')
    check('reduced-motion preview starts paused',reduced.locator('#play').inner_text()=='播放预览')
    check('no browser runtime errors',not report['errors'])
    reduced.close();browser.close()
(ROOT/'docs/qa-character-motion-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
