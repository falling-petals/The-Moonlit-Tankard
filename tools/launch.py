"""Local static-file launcher. Model requests are made by the browser directly.

Environment credentials are never printed, saved to source, or served by an API.
A URL fragment is consumed immediately by the page into tab session storage.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import quote
from urllib.request import urlopen
import argparse, base64, json, os, socket, threading, webbrowser

ROOT=Path(__file__).resolve().parents[1]

def environment_config():
    key=os.environ.get('AI_DASHSCOPE_API_KEY') or os.environ.get('DASHSCOPE_API_KEY') or os.environ.get('OPENAI_API_KEY') or ''
    dashscope=bool(os.environ.get('AI_DASHSCOPE_API_KEY') or os.environ.get('DASHSCOPE_API_KEY'))
    return {'key':key,'baseUrl':os.environ.get('AI_BASE_URL') or os.environ.get('OPENAI_BASE_URL') or ('https://dashscope.aliyuncs.com/compatible-mode/v1' if dashscope else 'https://api.openai.com/v1'),
            'model':os.environ.get('AI_MODEL') or ('qwen-plus' if dashscope else 'gpt-4.1-mini')}

def bootstrap_fragment(config):
    if not config['key']:return ''
    payload=base64.b64encode(json.dumps(config,ensure_ascii=True).encode()).decode()
    return '#bootstrap='+quote(payload,safe='')

class StaticHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        self.send_header('Referrer-Policy','no-referrer')
        super().end_headers()

class LocalStaticServer(ThreadingHTTPServer):
    allow_reuse_address=False
    def server_bind(self):
        if hasattr(socket,'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
        super().server_bind()

def choose_server(port):
    """Reuse our static site so repeated launches retain the same save origin."""
    handler=partial(StaticHandler,directory=str(ROOT))
    for candidate in range(port,port+20):
        base=f'http://127.0.0.1:{candidate}/'
        try:
            with urlopen(base,timeout=.5) as response:
                if b'content="Moonlit Tankard Local MVP"' in response.read(16000):
                    return None,base,True
        except Exception:pass
        try:return LocalStaticServer(('127.0.0.1',candidate),handler),base,False
        except OSError:continue
    raise OSError('No local preview port is available.')

def main():
    parser=argparse.ArgumentParser(description='Launch the frontend-only Moonlit Tankard')
    parser.add_argument('--port',type=int,default=4173)
    parser.add_argument('--no-open',action='store_true')
    args=parser.parse_args()
    server,base,reused=choose_server(args.port)
    config=environment_config()
    print(f'Moonlit Tankard: {base}',flush=True)
    print('Environment AI configuration detected.' if config['key'] else 'AI can be configured inside Settings.',flush=True)
    if reused:
        print('Reusing the existing local game.',flush=True)
        if not args.no_open:webbrowser.open(base+bootstrap_fragment(config))
        return
    if not args.no_open:
        threading.Timer(.5,lambda:webbrowser.open(base+bootstrap_fragment(config))).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
