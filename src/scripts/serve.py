# Local development server for Shirazeh: threaded (parallel module fetches)
# and no-cache headers so browser testing always sees fresh modules.
import http.server
import socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        pass  # keep the console quiet during E2E runs

class ThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == '__main__':
    with ThreadingTCPServer(('127.0.0.1', 8901), NoCacheHandler) as httpd:
        httpd.serve_forever()
