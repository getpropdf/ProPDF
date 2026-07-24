# ProPDF local server - serves this folder on 127.0.0.1 with no-cache.
# Nothing leaves your computer. Close the window to stop.
import http.server, socketserver, webbrowser, threading, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = 8733
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()
    def log_message(self, *a): pass
threading.Timer(1.2, lambda: webbrowser.open('http://localhost:%d/index.html' % PORT)).start()
print('ProPDF is running at  http://localhost:%d' % PORT)
print('Keep this window open while using ProPDF. Close it to stop.')
try:
    socketserver.TCPServer(('127.0.0.1', PORT), H).serve_forever()
except OSError:
    print('Port busy - open http://localhost:%d/index.html manually.' % PORT)
    input('Press Enter to exit...')
