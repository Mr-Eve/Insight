'use client'

import { useActionState } from 'react';
import { performBackgroundCheck, type ScrapeResult, type ActionState } from '../actions';
import { 
  Loader2, 
  CheckCircle, 
  AlertTriangle, 
  Search, 
  User, 
  MapPin, 
  Globe, 
  ShieldAlert, 
  Twitter, 
  Linkedin, 
  Github, 
  Instagram,
  ExternalLink,
  Filter
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const initialState: ActionState = {
  error: null,
  data: null,
};

export function BackgroundCheckForm({ companyId }: { companyId: string }) {
  const [state, formAction, isPending] = useActionState(performBackgroundCheck, initialState);

  return (
    <div className="w-full space-y-8">
      <form action={formAction} className="w-full max-w-3xl mx-auto">
        <input type="hidden" name="companyId" value={companyId} />
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              name="query"
              type="text"
              defaultValue={state.query}
              placeholder="Enter ID, Username, or Email"
              required
              className="w-full pl-10 pr-4 py-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-lg"
            />
          </div>
          
          <div className="relative w-full sm:w-48">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <select 
              name="platform" 
              className="w-full pl-9 pr-4 py-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-base appearance-none"
              defaultValue="auto"
            >
              <option value="auto">Auto-Detect</option>
              <option value="whop">Whop User</option>
              <option value="github">GitHub</option>
              <option value="email">Email Only</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className={twMerge(
              "px-8 py-4 rounded-xl bg-blue-600 text-white font-medium transition-all flex items-center gap-2 shadow-md hover:shadow-lg hover:-translate-y-0.5 justify-center sm:justify-start",
              isPending && "opacity-70 cursor-not-allowed hover:transform-none hover:shadow-md",
              "hover:bg-blue-700"
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Scanning...
              </>
            ) : (
              'Run Scan'
            )}
          </button>
        </div>
        <p className="text-zinc-500 text-sm mt-3 ml-1">
          Supports: Whop User IDs, Emails, Usernames
        </p>
      </form>

      {state.error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 max-w-3xl mx-auto">
          {state.error}
        </div>
      )}

      {state.data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          
          {/* Main Profile Card */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-full bg-zinc-100 mb-4 overflow-hidden relative">
                  {state.data.identity.avatar ? (
                    <img src={state.data.identity.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10 text-zinc-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  )}
                </div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                  {state.data.identity.fullName || 'Unknown Name'}
                </h2>
                <p className="text-zinc-500">{state.data.identity.jobTitle || 'No Job Title Found'}</p>
                
                <div className="mt-6 w-full space-y-3">
                  <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg">
                    <MapPin className="w-4 h-4" />
                    {state.data.identity.location || 'Location Unknown'}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg">
                    <User className="w-4 h-4" />
                    Age Range: {state.data.identity.ageRange || 'Unknown'}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
               <h3 className="text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wider mb-4">Risk Assessment</h3>
               <div className="flex items-center justify-between mb-2">
                 <span className="text-zinc-600">Risk Score</span>
                 <span className={clsx(
                   "text-xl font-bold",
                   state.data.riskScore > 75 ? "text-red-600" : state.data.riskScore > 30 ? "text-amber-600" : "text-green-600"
                 )}>{state.data.riskScore}/100</span>
               </div>
               <div className="w-full bg-zinc-100 rounded-full h-2.5 dark:bg-zinc-800">
                  <div 
                    className={clsx(
                      "h-2.5 rounded-full transition-all duration-1000",
                      state.data.riskScore > 75 ? "bg-red-500" : state.data.riskScore > 30 ? "bg-amber-500" : "bg-green-500"
                    )} 
                    style={{ width: `${state.data.riskScore}%` }}
                  ></div>
               </div>
               
               <div className="mt-6 space-y-3">
                 {state.data.flags.map((flag, i) => (
                   <div key={i} className={clsx(
                     "p-3 rounded-lg text-sm border flex gap-3 items-start",
                     flag.severity === 'high' ? "bg-red-50 border-red-100 text-red-800" :
                     flag.severity === 'medium' ? "bg-amber-50 border-amber-100 text-amber-800" :
                     "bg-blue-50 border-blue-100 text-blue-800"
                   )}>
                     <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                     <div>
                       <span className="font-semibold block text-xs uppercase mb-0.5">{flag.type}</span>
                       {flag.description}
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>

          {/* Details Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Social Profiles */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-500" />
                Digital Footprint
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {state.data.social.map((profile, i) => (
                  <a 
                    key={i} 
                    href={profile.exists ? profile.url : '#'} 
                    target="_blank"
                    className={clsx(
                      "flex items-center justify-between p-4 rounded-xl border transition-all",
                      profile.exists 
                        ? "border-zinc-200 hover:border-blue-300 hover:bg-blue-50/50 dark:border-zinc-700 dark:hover:bg-blue-900/20" 
                        : "border-transparent bg-zinc-50 dark:bg-zinc-800/50 opacity-60 cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {profile.platform === 'Twitter' && <Twitter className="w-5 h-5 text-blue-400" />}
                      {profile.platform === 'LinkedIn' && <Linkedin className="w-5 h-5 text-blue-700" />}
                      {profile.platform === 'GitHub' && <Github className="w-5 h-5 text-zinc-800 dark:text-white" />}
                      {profile.platform === 'Instagram' && <Instagram className="w-5 h-5 text-pink-600" />}
                      {profile.platform === 'Whop' && <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-[10px] font-bold">W</div>}
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{profile.platform}</span>
                        <span className="text-xs text-zinc-500">{profile.exists ? profile.username : 'Not Found'}</span>
                      </div>
                    </div>
                    {profile.exists && <ExternalLink className="w-4 h-4 text-zinc-400" />}
                  </a>
                ))}
              </div>
            </div>

            {/* Data Breaches */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                Data Breach Exposure
              </h3>
              {state.data.breaches.length > 0 ? (
                <div className="space-y-3">
                  {state.data.breaches.map((breach, i) => (
                    <div key={i} className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-semibold text-red-900 dark:text-red-200">{breach.name}</h4>
                        <span className="text-xs font-mono text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 px-2 py-1 rounded">{breach.date}</span>
                      </div>
                      <p className="text-sm text-red-800 dark:text-red-300/80 leading-relaxed">
                        {breach.description}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700">
                  <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
                  <p>No data breaches found for this identity.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
