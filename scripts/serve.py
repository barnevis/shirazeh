# Local development server with no-cache headers so browser E2E always sees
# fresh modules (the stdlib server otherwise answers 304 and stale ESM caches
# mask real changes).
import http.server
import socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True

if __name__ == '__main__':
    with socketserver.TCPServer(('127.0.0.1', 8901), NoCacheHandler) as httpd:
        httpd.serve_forever()
