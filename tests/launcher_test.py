"""Run with python -m unittest discover -s tests -p '*_test.py'."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
import sys, unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from launch import StaticHandler, choose_server

class LauncherTests(unittest.TestCase):
    def test_repeated_launch_reuses_the_same_origin_and_its_browser_save(self):
        root=Path(__file__).resolve().parents[1]
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(StaticHandler,directory=str(root)))
        thread=Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            selected,base,reused=choose_server(server.server_port)
            self.assertIsNone(selected)
            self.assertTrue(reused)
            self.assertEqual(base,f'http://127.0.0.1:{server.server_port}/')
        finally:server.shutdown();server.server_close()

if __name__=='__main__':unittest.main()
