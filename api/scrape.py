from http.server import BaseHTTPRequestHandler
import json
import asyncio
import httpx
from parsel import Selector
from urllib.parse import parse_qs, urlparse, urljoin

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self.handle_async())
        finally:
            loop.close()

    async def handle_async(self):
        # Parse query parameters
        query_components = parse_qs(urlparse(self.path).query)
        username = query_components.get('username', [None])[0]

        if not username:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Username required"}).encode('utf-8'))
            return

        # Results container
        results = {
            "source": "Aggregated Scrape",
            "username": username,
            "connected_accounts": [],
            "fullName": "",
            "bio": "",
            "location": "",
            "company": "",
            "avatar": "",
            "website": ""
        }

        # Stealth headers to mimic a real browser
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "DNT": "1",
            "Upgrade-Insecure-Requests": "1"
        }

        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=25.0) as client:
            try:
                # 1. Scrape GitHub Profile
                github_url = f"https://github.com/{username}"
                resp = await client.get(github_url)
                
                if resp.status_code == 404:
                    self.send_response(404)
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Profile not found"}).encode('utf-8'))
                    return

                if resp.status_code == 200:
                    sel = Selector(text=resp.text)
                    
                    # Extract Basic Profile Data
                    # Try standard classes and microformats
                    results["fullName"] = sel.css('span.p-name::text, h1.vcard-names span::text').get(default="").strip()
                    results["bio"] = sel.css('div.p-note::text, div.user-profile-bio::text').get(default="").strip()
                    results["location"] = sel.css('li[itemprop="homeLocation"] span::text, .p-label::text').get(default="").strip()
                    results["company"] = sel.css('li[itemprop="worksFor"] span::text, .p-org::text').get(default="").strip()
                    results["avatar"] = sel.css('img.avatar::attr(src)').get(default="")
                    results["url"] = github_url

                    # Add GitHub to accounts
                    results["connected_accounts"].append({
                        "platform": "GitHub",
                        "username": username,
                        "url": github_url,
                        "exists": True
                    })

                    # 2. Find Linked Accounts on GitHub
                    # Strategy: Scrape ALL links in the profile container (.h-card)
                    # This covers bio, sidebar, pinned items, etc.
                    # Exclude internal GitHub links (repositories, stars, followers)
                    
                    profile_links = sel.css('.h-card a::attr(href)').getall()
                    # Fallback if .h-card isn't found (older layout)
                    if not profile_links:
                        profile_links = sel.css('.js-profile-editable-area a::attr(href)').getall()
                    
                    website_url = None
                    
                    for link in profile_links:
                        # Normalize
                        if not link.startswith('http'): continue
                        
                        # Skip internal GitHub links unless they are explicitly external (redirects)
                        if 'github.com' in link and username not in link: 
                             # Keep going, might be a link to another repo, usually not a social profile
                             pass
                        
                        # Identify platform
                        platform = self.detect_platform(link)
                        if platform:
                            results["connected_accounts"].append({
                                "platform": platform,
                                "url": link,
                                "username": self.extract_username(link),
                                "exists": True
                            })
                        elif 'github.com' not in link and not link.startswith('mailto:'):
                            # Likely a personal website
                            # Avoid some common false positives
                            if 'opensource.org' not in link and 'shields.io' not in link:
                                website_url = link

                    if website_url:
                        results["website"] = website_url
                        results["connected_accounts"].append({
                            "platform": "Website",
                            "url": website_url,
                            "username": urlparse(website_url).netloc,
                            "exists": True
                        })

                        # 3. Deep Scrape: Check the personal website for social links
                        await self.scrape_website_socials(client, website_url, results)

            except Exception as e:
                results["error"] = str(e)

        # Deduplicate accounts
        seen = set()
        unique_accounts = []
        for acc in results["connected_accounts"]:
            # Key by platform and normalized URL
            k = (acc.get('platform'), acc.get('url').rstrip('/'))
            if k not in seen:
                seen.add(k)
                unique_accounts.append(acc)
        results["connected_accounts"] = unique_accounts

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(results).encode('utf-8'))

    def detect_platform(self, url):
        domain = urlparse(url).netloc.lower()
        if 'twitter.com' in domain or 'x.com' in domain: return 'Twitter'
        if 'linkedin.com' in domain: return 'LinkedIn'
        if 'instagram.com' in domain: return 'Instagram'
        if 'facebook.com' in domain: return 'Facebook'
        if 'youtube.com' in domain: return 'YouTube'
        if 'medium.com' in domain: return 'Medium'
        if 'dev.to' in domain: return 'Dev.to'
        if 'twitch.tv' in domain: return 'Twitch'
        if 'discord.gg' in domain: return 'Discord'
        if 'bsky.app' in domain: return 'Bluesky'
        return None

    def extract_username(self, url):
        # Simple heuristic
        path = urlparse(url).path
        return path.strip('/').split('/')[-1]

    async def scrape_website_socials(self, client, url, results):
        try:
            resp = await client.get(url, timeout=10.0)
            if resp.status_code == 200:
                sel = Selector(text=resp.text)
                links = sel.css('a::attr(href)').getall()
                for link in links:
                    full_link = urljoin(url, link)
                    platform = self.detect_platform(full_link)
                    if platform:
                        results["connected_accounts"].append({
                            "platform": platform,
                            "url": full_link,
                            "username": self.extract_username(full_link),
                            "exists": True
                        })
        except:
            pass
