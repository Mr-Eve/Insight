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

export async function performBackgroundCheck(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const query = formData.get('query') as string;

  if (!query) {
    return { error: 'Please enter an Email, Username, or Phone number', data: null };
  }

  // Simulate processing delay to feel like a real scrape
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Deterministic mock data based on query length for variety
  const isRisky = query.length % 2 !== 0;
  
  const mockResult: ScrapeResult = {
    id: Math.random().toString(36).substring(7),
    query,
    timestamp: new Date().toISOString(),
    status: 'complete',
    riskScore: isRisky ? 85 : 12,
    identity: {
      fullName: 'Alex J. Doe',
      ageRange: '25-34',
      location: 'San Francisco, CA',
      jobTitle: 'Software Engineer',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${query}`,
    },
    social: [
      { platform: 'Twitter', username: '@alexdoe', url: 'https://twitter.com/alexdoe', exists: true },
      { platform: 'LinkedIn', username: 'in/alexdoe', url: 'https://linkedin.com/in/alexdoe', exists: true },
      { platform: 'GitHub', username: 'alexdoe', url: 'https://github.com/alexdoe', exists: true },
      { platform: 'Instagram', username: 'alex.doe', url: 'https://instagram.com/alex.doe', exists: false },
    ],
    breaches: isRisky ? [
      { name: 'Collection #1', date: '2019-01-07', description: 'Email and password exposed in massive data dump.' },
      { name: 'Verifications.io', date: '2019-02-25', description: 'Personal info exposed in marketing database.' },
    ] : [],
    flags: isRisky ? [
      { severity: 'high', type: 'Reputation', description: 'Potential match on high-risk scammer database.' },
      { severity: 'medium', type: 'Social', description: 'Account age is less than 30 days on multiple platforms.' },
    ] : [
      { severity: 'low', type: 'Info', description: 'Common name, might have false positives.' }
    ],
  };

  return { error: null, data: mockResult };
}
