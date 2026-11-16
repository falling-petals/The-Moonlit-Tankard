"""Start the loopback game and Python LangChain API on the same origin."""
from pathlib import Path
import argparse
import json
import os
import socket
import sys
import threading
import time
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SERVICE = "moonlit-tankard-langchain"

def is_service(opener, base: str) -> bool:
    try:
        with opener.open(base + "api/ai/status", timeout=.5) as response:
            status = json.loads(response.read(4096))
            return isinstance(status, dict) and status.get("service") == SERVICE and status.get("framework") == "LangChain Python"
    except (URLError, OSError, ValueError):
        return False

def environment_config():
    """Legacy QA compatibility: credentials can no longer be obtained by callers."""
    from server.config import ModelConfig
    return {**ModelConfig.from_environment().public_status(), "key": ""}

def bootstrap_fragment(_config):
    """Old QA callers can open the game, but never encode environment secrets."""
    return ""

def choose_server(port: int):
    """Reuse only the Python API host, preserving its browser save origin."""
    opener = build_opener(ProxyHandler({}))
    for candidate in range(port, min(port + 20, 65536)):
        base = f"http://127.0.0.1:{candidate}/"
        if is_service(opener, base):
            return None, base, True
        try:
            with opener.open(base, timeout=.5) as response:
                if b'content="Moonlit Tankard Local MVP"' in response.read(16000):
                    raise RuntimeError("旧版静态服务仍占用游戏地址，请关闭旧服务后重新启动，以保留原地址的存档。")
        except (URLError, OSError):
            pass
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            if os.name == "nt":
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            sock.bind(("127.0.0.1", candidate))
            return sock, base, False
        except OSError:
            sock.close()
            # A simultaneous launch may have bound the port but not served status yet.
            for _ in range(10):
                if is_service(opener, base):
                    return None, base, True
                time.sleep(.1)
    raise OSError("没有可用的本机游戏端口。")

def main():
    parser = argparse.ArgumentParser(description="Launch Moonlit Tankard with Python LangChain")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    try:
        import uvicorn
        from server.app import create_app
        from server.config import ModelConfig
    except ImportError:
        print("缺少Python服务依赖，请先运行 uv sync --locked，再双击 start.cmd。", flush=True)
        return 1
    try:
        config = ModelConfig.from_environment()
        sock, base, reused = choose_server(args.port)
    except (ValueError, OSError, RuntimeError) as error:
        print(str(error), flush=True)
        return 1
    print(f"Moonlit Tankard: {base}", flush=True)
    if reused:
        print("Reusing the local Python LangChain game service.", flush=True)
        if not args.no_open:
            webbrowser.open(base)
        return 0
    print("LangChain model configured on server." if config.public_status()["configured"] else "Set a model API key in the service environment to enable dialogue; gameplay is available.", flush=True)
    if not args.no_open:
        threading.Timer(.8, lambda: webbrowser.open(base)).start()
    try:
        app = create_app(config)
        service = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=args.port, log_level="warning", access_log=False))
        service.run(sockets=[sock])
    finally:
        sock.close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
