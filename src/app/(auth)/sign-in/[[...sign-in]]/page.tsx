import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
 return (
 <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 selection:bg-zinc-200">
 <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
 <div className="mb-8 text-center">
 <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Welcome back</h1>
 <p className="mt-2 text-sm text-zinc-600">Sign in to your Quoin account</p>
 </div>
 <SignIn 
 appearance={{
 elements: {
 formButtonPrimary: 'bg-zinc-900 hover:bg-zinc-800 text-sm normal-case transition-all',
 card: ' shadow-zinc-200/50 rounded-2xl border border-zinc-200 w-full',
 headerTitle: 'hidden',
 headerSubtitle: 'hidden',
 socialButtonsBlockButton: 'text-zinc-600 border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 transition-colors',
 formFieldInput: 'rounded-lg border-zinc-200 focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-all',
 formFieldLabel: 'text-zinc-700 font-medium',
 footerActionLink: 'text-zinc-900 font-semibold hover:text-zinc-700 transition-colors',
 identityPreviewEditButton: 'text-zinc-600 hover:text-zinc-900'
 }
 }}
 />
 </div>
 </div>
 );
}
