"""Bounded direct-browser API probe. Never writes or prints credentials."""
import json
import os
import sys
import threading
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright

ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

class QuietHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(b'<!doctype html><title>Local API connectivity probe</title>')
    def log_message(self, *args):
        pass

def main():
    key = os.environ.get('AI_DASHSCOPE_API_KEY')
    if not key:
        print(json.dumps({'key_present': False}))
        return
    payload = {
        'model': sys.argv[1] if len(sys.argv) > 1 else 'qwen-flash',
        'messages': [{'role': 'user', 'content': 'Reply with JSON only: {"ok":true}'}],
        'enable_thinking': False,
        'response_format': {'type': 'json_object'},
        'max_tokens': 40,
        'stream': False,
    }
    headers = {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:8769'}
    start = time.monotonic()
    request = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(), headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.load(response)
            result = {'status': response.status, 'model': data.get('model'), 'seconds': round(time.monotonic()-start, 2), 'allow_origin': response.headers.get('Access-Control-Allow-Origin'), 'usage': data.get('usage')}
            try:
                result['valid_json_reply'] = json.loads(data['choices'][0]['message']['content']) == {'ok': True}
            except (KeyError, ValueError, IndexError):
                result['valid_json_reply'] = False
            print(json.dumps({'python_post': result}))
    except urllib.error.HTTPError as exc:
        data = json.load(exc)
        print(json.dumps({'python_post': {'status': exc.code, 'error_code': data.get('error', {}).get('code')}}))
    except Exception as exc:
        print(json.dumps({'python_post': {'error_type': type(exc).__name__}}))
    server = HTTPServer(('127.0.0.1', 8769), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
            page = browser.new_page()
            page.goto('http://127.0.0.1:8769', wait_until='domcontentloaded')
            result = page.evaluate('''async ({endpoint, key, payload}) => {
              const start = performance.now();
              try {
                const response = await fetch(endpoint, {
                  method: 'POST', headers: {'Authorization': 'Bearer '+key, 'Content-Type': 'application/json'},
                  body: JSON.stringify(payload), signal: AbortSignal.timeout(45000)
                });
                const data = await response.json();
                let validJsonReply = false;
                try { validJsonReply = JSON.parse(data.choices[0].message.content).ok === true; } catch {}
                return {status: response.status, seconds: Math.round((performance.now()-start)/10)/100, model: data.model,
                   valid_json_reply: validJsonReply, error_code: data.error?.code};
              } catch (error) { return {error_type: error.name, seconds: Math.round((performance.now()-start)/10)/100}; }
            }''', {'endpoint': ENDPOINT, 'key': key, 'payload': payload})
            print(json.dumps({'browser_post': result}))
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    main()
