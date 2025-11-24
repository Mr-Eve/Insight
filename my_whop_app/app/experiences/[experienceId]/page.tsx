import { whopsdk } from "@/lib/whop-sdk";

interface PageProps {
  params: Promise<{
    experienceId: string;
  }>;
}

export default async function ExperiencePage({ params }: PageProps) {
  const { experienceId } = await params;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-2xl font-bold mb-4">Whop Experience</h1>
      <p className="text-zinc-600">Experience ID: {experienceId}</p>
      <p className="mt-4 text-sm text-zinc-500 text-center max-w-md">
        This is the user-facing view of your app. For the admin dashboard, please access via the company dashboard.
      </p>
    </div>
  );
}

