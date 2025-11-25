from http.server import BaseHTTPRequestHandler
import json
import asyncio
import httpx
from parsel import Selector
from urllib.parse import parse_qs, urlparse, urljoin
import re

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

        # Stealth headers
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "DNT": "1",
            "Upgrade-Insecure-Requests": "1"
        }

        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=30.0) as client:
            try:
                # Run platform checks in parallel
                tasks = [
                    self.check_github(client, username, results),
                    self.check_twitter(client, username, results),
                    self.check_instagram(client, username, results)
                ]
                
                await asyncio.gather(*tasks)
                
                # If we found a website from GitHub or elsewhere, deep scrape it
                # (The check_github function populates results['website'] if found)
                if results.get("website"):
                    await self.scrape_website_socials(client, results["website"], results)

            except Exception as e:
                results["error"] = str(e)

        # Deduplicate accounts
        seen = set()
        unique_accounts = []
        for acc in results["connected_accounts"]:
            k = (acc.get('platform'), acc.get('url').rstrip('/'))
            if k not in seen:
                seen.add(k)
                unique_accounts.append(acc)
        results["connected_accounts"] = unique_accounts
        
        # If no full name found but we have accounts, try to use username
        if not results["fullName"] and results["connected_accounts"]:
            results["fullName"] = username

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(results).encode('utf-8'))

    async def check_github(self, client, username, results):
        try:
            url = f"https://github.com/{username}"
            resp = await client.get(url)
            
            if resp.status_code == 200:
                sel = Selector(text=resp.text)
                
                # Populate primary identity from GitHub if available (it's usually the richest source)
                if not results["fullName"]:
                    results["fullName"] = sel.css('span.p-name::text, h1.vcard-names span::text').get(default="").strip()
                    results["bio"] = sel.css('div.p-note::text, div.user-profile-bio::text').get(default="").strip()
                    results["location"] = sel.css('li[itemprop="homeLocation"] span::text, .p-label::text').get(default="").strip()
                    results["company"] = sel.css('li[itemprop="worksFor"] span::text, .p-org::text').get(default="").strip()
                    results["avatar"] = sel.css('img.avatar::attr(src)').get(default="")
                    results["url"] = url

                results["connected_accounts"].append({
                    "platform": "GitHub",
                    "username": username,
                    "url": url,
                    "exists": True
                })
                
                # Scrape linked accounts from GitHub profile
                await self.scrape_github_links(sel, username, results)
                
        except Exception:
            pass

    async def scrape_github_links(self, sel, username, results):
        profile_links = sel.css('.h-card a::attr(href)').getall()
        if not profile_links:
            profile_links = sel.css('.js-profile-editable-area a::attr(href)').getall()
        
        for link in profile_links:
            if not link.startswith('http'): continue
            if 'avatars.githubusercontent.com' in link: continue
            if 'github.com' in link and username not in link: continue
            
            platform = self.detect_platform(link)
            if platform:
                results["connected_accounts"].append({
                    "platform": platform,
                    "url": link,
                    "username": self.extract_username(link),
                    "exists": True
                })
            elif 'github.com' not in link:
                if 'opensource.org' not in link:
                    results["website"] = link
                    results["connected_accounts"].append({
                        "platform": "Website",
                        "url": link,
                        "username": urlparse(link).netloc,
                        "exists": True
                    })
        
        # Parse Bio for handles
        bio_text = sel.css('div.p-note::text, div.user-profile-bio::text').get(default="").strip()
        if bio_text:
             twitter_match = re.search(r'(?:twitter\.com|x\.com)/([a-zA-Z0-9_]+)|@([a-zA-Z0-9_]+)', bio_text)
             if twitter_match:
                 handle = twitter_match.group(1) or twitter_match.group(2)
                 # Verify it's not just a random word starting with @
                 if handle and len(handle) > 3:
                     results["connected_accounts"].append({
                         "platform": "Twitter",
                         "url": f"https://twitter.com/{handle}",
                         "username": handle,
                         "exists": True
                     })

    async def check_twitter(self, client, username, results):
        # Twitter is hard to scrape directly. We use Nitter or just verify existence.
        # Try Nitter first (public viewer)
        nitter_instances = [
            "https://nitter.net", 
            "https://nitter.cz",
            "https://nitter.privacydev.net"
        ]
        
        for base in nitter_instances:
            try:
                url = f"{base}/{username}"
                resp = await client.get(url, timeout=5.0)
                if resp.status_code == 200 and "Profile not found" not in resp.text:
                    # Found it!
                    results["connected_accounts"].append({
                        "platform": "Twitter",
                        "username": username,
                        "url": f"https://twitter.com/{username}",
                        "exists": True
                    })
                    
                    # Try to extract avatar/name from Nitter if we don't have it
                    if not results["fullName"]:
                        sel = Selector(text=resp.text)
                        results["fullName"] = sel.css('.profile-card-fullname::text').get(default="").strip()
                        results["avatar"] = sel.css('.profile-card-avatar::attr(src)').get(default="")
                        if results["avatar"] and results["avatar"].startswith('/'):
                            results["avatar"] = base + results["avatar"]
                    return
            except:
                continue

    async def check_instagram(self, client, username, results):
        # Use a viewer like Picuki
        try:
            url = f"https://www.picuki.com/profile/{username}"
            resp = await client.get(url, timeout=8.0)
            if resp.status_code == 200 and "Profile not found" not in resp.text:
                results["connected_accounts"].append({
                    "platform": "Instagram",
                    "username": username,
                    "url": f"https://instagram.com/{username}",
                    "exists": True
                })
                
                if not results["fullName"]:
                     sel = Selector(text=resp.text)
                     results["fullName"] = sel.css('.profile-name::text').get(default="").strip()
                     avatar = sel.css('.profile-avatar img::attr(src)').get()
                     if avatar: results["avatar"] = avatar

        except:
            pass

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
        path = urlparse(url).path
        return path.strip('/').split('/')[-1]

    async def scrape_website_socials(self, client, url, results):
        try:
            resp = await client.get(url, timeout=8.0)
            if resp.status_code == 200:
                sel = Selector(text=resp.text)
                links = sel.css('a::attr(href)').getall()
                for link in links:
                    full_link = urljoin(url, link)
                    
                    if any(x in full_link.lower() for x in ['.jpg', '.png', '.svg', '.css', '.js']): continue

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
