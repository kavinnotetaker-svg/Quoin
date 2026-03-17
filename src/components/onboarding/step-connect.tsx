"use client";

interface StepConnectProps {
  onNext: () => void;
  onSkip: () => void;
}

export function StepConnect({ onNext, onSkip }: StepConnectProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Connect ENERGY STAR Portfolio Manager</h2>
        <p className="mt-2 text-[15px] text-zinc-500 leading-relaxed">
          Link your ESPM account to automatically sync scores and benchmarking data.
          This step is optional — you can connect later from building settings.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-6 space-y-4">
        <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900">How it works</h3>
        <ol className="list-decimal list-inside space-y-2 text-[15px] font-medium text-zinc-600 leading-relaxed">
          <li>Log in to your ESPM account at energystar.gov</li>
          <li>Share your property with the Quoin service account</li>
          <li>Enter your ESPM property ID in building settings</li>
          <li>Quoin syncs your score and energy data automatically</li>
        </ol>
      </div>

      <div className="rounded-lg bg-zinc-100/50 p-4 border border-zinc-200/50">
        <p className="text-[13px] font-medium text-zinc-500 leading-relaxed">
          You can also connect via Green Button for automated utility data from Pepco.
          Both options are available in each building&apos;s settings page.
        </p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-[15px] font-semibold text-white shadow-md hover:bg-zinc-800 transition-all active:scale-[0.98]"
      >
        Complete setup
      </button>

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-[13px] font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
      >
        Skip — I&apos;ll connect later
      </button>
    </div>
  );
}
