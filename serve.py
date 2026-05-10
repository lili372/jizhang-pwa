"""本地静态服务器
修复 Windows 下 Python http.server 把 .js 当成 text/plain 的问题
用法: python serve.py  (默认端口 8000)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class FixedMIMEHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js':   'application/javascript',
        '.mjs':  'application/javascript',
        '.json': 'application/json',
        '.css':  'text/css',
        '.html': 'text/html',
        '.svg':  'image/svg+xml',
        '.webmanifest': 'application/manifest+json',
        '':      'application/octet-stream',
    }

    def end_headers(self):
        # 开发期禁缓存,避免改完代码浏览器不刷新
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    addr = ('0.0.0.0', port)  # 0.0.0.0 让手机也能通过局域网 IP 访问
    with ThreadingHTTPServer(addr, FixedMIMEHandler) as httpd:
        print(f'服务启动: http://localhost:{port}/  (Ctrl+C 停止)')
        httpd.serve_forever()
