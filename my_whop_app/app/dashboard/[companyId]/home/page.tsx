import { whopsdk } from "@/lib/whop-sdk";
import { BackgroundCheckForm } from "@/app/components/BackgroundCheckForm";

interface PageProps {
  params: Promise<{
    companyId: string;
  }>;
}

export default async function DashboardPage({ params }: PageProps) {
  console.log("Dashboard Page HIT");
  const { companyId } = await params;
  console.log("Company ID:", companyId);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Admin Dashboard</h1>
          <p className="text-zinc-500">Company ID: {companyId}</p>
        </header>
        
        <div className="bg-white dark:bg-zinc-950 p-8 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800">
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Background Check</h2>
            <p className="text-zinc-500 dark:text-zinc-400">Enter a user ID to perform a comprehensive background check and data scrape.</p>
          </div>
          
          <BackgroundCheckForm />
        </div>
      </div>
    </div>
  );
}
