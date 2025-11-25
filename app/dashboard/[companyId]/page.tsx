import { whopsdk } from "@/lib/whop-sdk";
import { BackgroundCheckForm } from "@/app/components/BackgroundCheckForm";

// Force dynamic rendering to ensure fresh data and prevent static build issues
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    companyId: string;
  }>;
}

export default async function DashboardPage({ params }: PageProps) {
  // Await params for Next.js 15 compatibility
  const { companyId } = await params;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Admin Dashboard</h1>
          <p className="text-zinc-500">Company ID: {companyId}</p>
        </header>
        
        <div className="bg-white dark:bg-zinc-950 p-8 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800">
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Search</h2>
            <p className="text-zinc-500 dark:text-zinc-400">Enter a user ID, username, or email to perform a comprehensive account search.</p>
          </div>
          
          <BackgroundCheckForm companyId={companyId} />
        </div>
      </div>
    </div>
  );
}
