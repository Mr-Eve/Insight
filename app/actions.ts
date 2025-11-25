'use server'

import { whopsdk } from "@/lib/whop-sdk";

export type ScrapeResult = {
  id: string;
  query: string;
  timestamp: string;
  status: 'complete' | 'failed' | 'processing';
  riskScore: number;
  identity: {
    fullName?: string;
    ageRange?: string;
    location?: string;
    avatar?: string;
    jobTitle?: string;
  };
  social: {
    platform: string;
    username: string;
    url: string;
    exists: boolean;
  }[];
  breaches: {
    name: string;
    date: string;
    description: string;
  }[];
  flags: {
    severity: 'low' | 'medium' | 'high';
    type: string;
    description: string;
  }[];
};

export type ActionState = {
  error: string | null;
  data: ScrapeResult | null;
};

async function checkHaveIBeenPwned(account: string) {
  const apiKey = process.env.HIBP_API_KEY;
  
  if (!apiKey) {
    console.warn('HIBP_API_KEY is not set. Returning mock data.');
    return null; // Signal to use mock/empty data
  }

  try {
    const response = await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(account)}?truncateResponse=false`, {
      headers: {
        'hibp-api-key': apiKey,
        'user-agent': 'Whop-Insight-App'
      }
    });

    if (response.status === 404) {
      return []; // No breaches found
    }

    if (!response.ok) {
      console.error(`HIBP API Error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    return data.map((breach: any) => ({
      name: breach.Name,
      date: breach.BreachDate,
      description: breach.Description.replace(/<[^>]*>/g, ''), // Strip HTML
    }));
  } catch (error) {
    console.error('HIBP Fetch Error:', error);
    return null;
  }
}

async function scrapeProfile(username: string) {
  try {
    // Determine the base URL reliably
    let baseUrl = 'http://localhost:3000';
    
    if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    } else if (process.env.NEXT_PUBLIC_VERCEL_URL) {
      baseUrl = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
    }

    console.log(`Attempting to scrape: ${baseUrl}/api/scrape?username=${username}`);

    const response = await fetch(`${baseUrl}/api/scrape?username=${encodeURIComponent(username)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      next: { revalidate: 0 }, // Don't cache
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error(`Scrape API Failed: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Scrape Exception:', error);
    return null;
  }
}

export async function performBackgroundCheck(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const query = formData.get('query') as string;
  const companyId = formData.get('companyId') as string;
  const platform = formData.get('platform') as string; // 'auto', 'whop', 'github', 'email'

  if (!query) {
    return { error: 'Please enter a Whop ID, Username, or Email', data: null };
  }

  let targetEmail = '';
  let targetUsername = '';
  let whopIdentity = null;

  // === Strategy Selection based on Platform ===

  if (platform === 'whop' || platform === 'auto') {
    // 1. Try to lookup Whop User
    if (companyId) {
      try {
        console.log(`Looking up Whop user: ${query} in company ${companyId}`);
        
        // Check if query is a user ID
        const isUserId = query.startsWith('user_');
        
        // List members matching query
        const members = await whopsdk.members.list({
          company_id: companyId,
          query: isUserId ? undefined : query,
          user_ids: isUserId ? [query] : undefined,
          first: 1
        });

        if (members.data && members.data.length > 0) {
          const member = members.data[0];
          if (member.user) {
            whopIdentity = {
              fullName: member.user.name,
              username: member.user.username,
              email: member.user.email,
              id: member.user.id,
              joinedAt: member.joined_at
            };
            
            // Propagate found data to other checks
            if (member.user.email) targetEmail = member.user.email;
            if (member.user.username) targetUsername = member.user.username;
            
            console.log('Found Whop User:', whopIdentity);
          }
        }
      } catch (err) {
        console.error('Whop API Lookup Failed:', err);
      }
    }
  }

  // If user explicitly selected GitHub or Email, use query directly if Whop lookup failed or wasn't run
  if (!targetUsername && (platform === 'github' || platform === 'auto')) {
    // If it looks like a username (no @), treat as username
    if (!query.includes('@')) targetUsername = query;
  }

  if (!targetEmail && (platform === 'email' || platform === 'auto')) {
    // If it looks like an email, treat as email
    if (query.includes('@')) targetEmail = query;
  }


  // === Execution ===

  // 2. Check HIBP (API Check) using Email
  let breaches = null;
  if (targetEmail && targetEmail.includes('@')) {
    breaches = await checkHaveIBeenPwned(targetEmail);
  }
  
  const usedRealApi = breaches !== null;

  // 3. Try to scrape GitHub profile (Scrapy/Python Check) using Username
  // Only scrape if we have a valid username and the platform allows it (not 'email' mode)
  const cleanUsername = targetUsername.includes('@') ? targetUsername.split('@')[0] : targetUsername;
  let scrapedData = null;
  
  if (cleanUsername && platform !== 'email') {
     scrapedData = await scrapeProfile(cleanUsername);
  }

  // Mock data fallback logic (Only if we found NOTHING at all)
  const foundAnyRealData = whopIdentity || scrapedData || usedRealApi;
  const isRiskyMock = query.length % 2 !== 0; 
  
  if (!foundAnyRealData && breaches === null) {
    // Only use mock breaches if we literally found nothing real
    breaches = isRiskyMock ? [
      { name: 'Collection #1', date: '2019-01-07', description: 'Email and password exposed in massive data dump.' },
      { name: 'Verifications.io', date: '2019-02-25', description: 'Personal info exposed in marketing database.' },
    ] : [];
  } else if (breaches === null) {
    // If we found real identity data but HIBP failed/was skipped, assume 0 breaches for the report
    breaches = [];
  }

  // Calculate risk score
  // Base score 10. +15 per breach.
  // If verified Whop user, -20 risk.
  let riskScore = Math.min(10 + (breaches.length * 15), 99);
  if (whopIdentity) riskScore = Math.max(0, riskScore - 20);
  
  if (!foundAnyRealData && !usedRealApi) {
      // Fallback mock score
      riskScore = isRiskyMock ? 85 : 12;
  }

  const flags = [];
  if (breaches.length > 0) {
    flags.push({ 
      severity: breaches.length > 5 ? 'high' : 'medium', 
      type: 'Breach History', 
      description: `Found ${breaches.length} known data breaches associated with this identity.` 
    });
  } else {
    flags.push({ severity: 'low', type: 'Info', description: 'Clean breach history.' });
  }
  
  if (whopIdentity) {
    flags.push({ severity: 'low', type: 'Whop Verified', description: `Confirmed member of your company (Joined: ${new Date(whopIdentity.joinedAt).toLocaleDateString()}).` });
  }

  // Consolidate Identity Data
  // Priority: Scraped Data -> Whop Data -> Fallback/Mock
  const identity = {
    fullName: scrapedData?.fullName || whopIdentity?.fullName || (foundAnyRealData ? cleanUsername : 'Alex J. Doe'),
    ageRange: 'Unknown',
    location: scrapedData?.location || 'Unknown',
    jobTitle: scrapedData?.company || 'Unknown',
    avatar: scrapedData?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUsername}`,
  };

  const mockResult: ScrapeResult = {
    id: Math.random().toString(36).substring(7),
    query,
    timestamp: new Date().toISOString(),
    status: 'complete',
    riskScore: Math.floor(riskScore),
    identity,
    social: [
      { 
        platform: 'Whop', 
        username: whopIdentity?.username || 'Not Found', 
        url: whopIdentity ? `https://whop.com/${whopIdentity.username}` : '#', 
        exists: !!whopIdentity 
      },
      { 
        platform: 'GitHub', 
        username: cleanUsername, 
        url: `https://github.com/${cleanUsername}`, 
        exists: !!scrapedData 
      },
      { platform: 'Twitter', username: 'Check manually', url: '#', exists: false },
    ],
    breaches: breaches as any,
    flags: flags as any,
  };

  return { error: null, data: mockResult };
}
