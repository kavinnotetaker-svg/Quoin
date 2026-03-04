"use client";

interface StepConnectProps {
  onNext: () => void;
  onSkip: () => void;
}

export function StepConnect({ onNext, onSkip }: StepConnectProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Connect ENERGY STAR Portfolio Manager</h2>
        <p className="mt-1 text-sm text-gray-500">
          Link your ESPM account to automatically sync scores and benchmarking data.
          This step is optional — you can connect later from building settings.
        </p>
      </div>

      <div className="rounded-md border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-900">How it works</h3>
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600">
          <li>Log in to your ESPM account at energystar.gov</li>
          <li>Share your property with the Quoin service account</li>
          <li>Enter your ESPM property ID in building settings</li>
          <li>Quoin syncs your score and energy data automatically</li>
        </ol>
      </div>

      <div className="rounded-md bg-gray-50 p-3">
        <p className="text-xs text-gray-500">
          You can also connect via Green Button for automated utility data from Pepco.
          Both options are available in each building&apos;s settings page.
        </p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Continue
      </button>

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
      >
        Skip — I&apos;ll connect later
      </button>
    </div>
  );
}
