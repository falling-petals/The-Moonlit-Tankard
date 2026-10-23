from pathlib import Path
from playwright.sync_api import sync_playwright
import json

ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://127.0.0.1:4173/',wait_until='networkidle')
    page.wait_for_selector('#loading',state='detached',timeout=15000)
    page.wait_for_timeout(700)
    page.screenshot(path=str(ROOT/'screenshots'/'mvp-day-initial.png'),full_page=True)
    print(json.dumps({'errors':errors,'viewport':page.viewport_size,'document':page.evaluate('({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})'),'canvas':page.locator('#world').bounding_box()},ensure_ascii=False))
    browser.close()
