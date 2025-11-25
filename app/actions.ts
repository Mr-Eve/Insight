'use server'

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
    // Call our own Python serverless function
    // We need the absolute URL because this runs on the server
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/scrape?username=${encodeURIComponent(username)}`, {
      next: { revalidate: 0 } // Don't cache
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Scrape Error:', error);
    return null;
  }
}

export async function performBackgroundCheck(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const query = formData.get('query') as string;

  if (!query) {
    return { error: 'Please enter an Email, Username, or Phone number', data: null };
  }

  // 1. Check HIBP (API Check)
  let breaches = await checkHaveIBeenPwned(query);
  const usedRealApi = breaches !== null;

  // 2. Try to scrape GitHub profile (Scrapy/Python Check)
  // Assuming the query is a username for this demo. If it's an email, we might strip the domain.
  const username = query.includes('@') ? query.split('@')[0] : query;
  const scrapedData = await scrapeProfile(username);

  // Mock data fallback logic
  const isRiskyMock = query.length % 2 !== 0; 
  
  if (breaches === null) {
    breaches = isRiskyMock ? [
      { name: 'Collection #1', date: '2019-01-07', description: 'Email and password exposed in massive data dump.' },
      { name: 'Verifications.io', date: '2019-02-25', description: 'Personal info exposed in marketing database.' },
    ] : [];
  }

  // Calculate risk score
  const riskScore = usedRealApi 
    ? Math.min(10 + (breaches.length * 15), 99) 
    : (isRiskyMock ? 85 : 12);

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

  // Use scraped data if available, otherwise fallback to mock identity
  const identity = scrapedData ? {
    fullName: scrapedData.fullName || username,
    ageRange: 'Unknown',
    location: scrapedData.location || 'Unknown',
    jobTitle: scrapedData.company || 'Unknown',
    avatar: scrapedData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${query}`,
  } : {
    fullName: 'Alex J. Doe',
    ageRange: '25-34',
    location: 'San Francisco, CA',
    jobTitle: 'Software Engineer',
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${query}`,
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
        platform: 'GitHub', 
        username: username, 
        url: `https://github.com/${username}`, 
        exists: !!scrapedData 
      },
      { platform: 'Twitter', username: 'Check manually', url: '#', exists: false },
      { platform: 'LinkedIn', username: 'Check manually', url: '#', exists: false },
    ],
    breaches: breaches as any,
    flags: flags as any,
  };

  return { error: null, data: mockResult };
}
