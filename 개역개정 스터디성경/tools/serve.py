"""Local preview server for app/ that tells the browser not to cache, so edits show on reload.

Run: python -I tools/serve.py [port]
"""
import functools
import http.server
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    handler = functools.partial(NoCache, directory=str(APP))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as srv:
        print(f"serving {APP} on http://localhost:{port}", flush=True)
        srv.serve_forever()
