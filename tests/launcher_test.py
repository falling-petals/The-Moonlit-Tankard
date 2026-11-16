"""Launcher reuse must identify the AI service and preserve its browser origin."""
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
from threading import Thread
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from launch import bootstrap_fragment, choose_server, environment_config

@contextmanager
def host_service(legacy=False, delayed=False):
    calls = [0]
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_GET(self):
            if self.path == "/api/ai/status":
                calls[0] += 1
            if self.path == "/api/ai/status" and not legacy and (not delayed or calls[0] > 1):
                body = json.dumps({"service": "moonlit-tankard-langchain", "framework": "LangChain Python"}).encode()
                self.send_response(200)
            elif self.path == "/":
                body = b'booting' if delayed else b'<meta name="application-name" content="Moonlit Tankard Local MVP">'
                self.send_response(200)
            else:
                body = b"not found"
                self.send_response(404)
            self.end_headers()
            self.wfile.write(body)
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_port
    finally:
        server.shutdown()
        server.server_close()
        thread.join(1)

class LauncherTests(unittest.TestCase):
    def test_repeated_launch_reuses_new_service_and_origin(self):
        with host_service() as port:
            selected, base, reused = choose_server(port)
            self.assertIsNone(selected)
            self.assertTrue(reused)
            self.assertEqual(base, f"http://127.0.0.1:{port}/")
    def test_old_static_game_is_not_silently_reused_or_moved(self):
        with host_service(legacy=True) as port:
            with self.assertRaisesRegex(RuntimeError, "旧版静态服务"):
                choose_server(port)
    def test_bootstrap_can_never_put_credentials_in_browser_url(self):
        self.assertEqual(bootstrap_fragment({"key": "fake-private-value"}), "")
        self.assertEqual(environment_config()["key"], "")

    def test_simultaneous_launch_waits_for_the_bound_service_instead_of_changing_origin(self):
        with host_service(delayed=True) as port:
            selected, base, reused = choose_server(port)
            self.assertIsNone(selected)
            self.assertTrue(reused)
            self.assertEqual(base, f"http://127.0.0.1:{port}/")

if __name__ == "__main__":
    unittest.main()
