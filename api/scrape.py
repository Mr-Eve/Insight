from http.server import BaseHTTPRequestHandler
import json
import httpx
from parsel import Selector
from urllib.parse import parse_qs, urlparse

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Parse query parameters
        query_components = parse_qs(urlparse(self.path).query)
        username = query_components.get('username', [None])[0]

        if not username:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Username required"}).encode('utf-8'))
            return

        # Target URL (Scraping GitHub as a demo since it's public and scrape-friendly-ish)
        url = f"https://github.com/{username}"
        
        try:
            # 1. Fetch the page (Scrapy 'Request')
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
            response = httpx.get(url, headers=headers, timeout=10.0)
            
            if response.status_code == 404:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Profile not found"}).encode('utf-8'))
                return

            # 2. Extract data (Scrapy 'Selector')
            sel = Selector(text=response.text)
            
            # Extracting fields using CSS selectors (standard Scrapy syntax)
            full_name = sel.css('span.p-name::text').get(default="").strip()
            bio = sel.css('div.p-note::text').get(default="").strip()
            location = sel.css('li[itemprop="homeLocation"] span::text').get(default="").strip()
            company = sel.css('li[itemprop="worksFor"] span::text').get(default="").strip()
            avatar = sel.css('img.avatar::attr(src)').get(default="")

            data = {
                "source": "GitHub Scrape",
                "username": username,
                "url": url,
                "fullName": full_name,
                "bio": bio,
                "location": location,
                "company": company,
                "avatar": avatar
            }

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

