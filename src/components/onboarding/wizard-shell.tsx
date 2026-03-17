"use client";

const STEP_LABELS = ["Organization", "Building", "Data", "Connect", "Done"];

interface WizardShellProps {
  currentStep: number;
  children: React.ReactNode;
}

export function WizardShell({ currentStep, children }: WizardShellProps) {
  return (
    <div className="space-y-10">
      {/* Progress bar */}
      <div className="flex items-center justify-between px-2 sm:px-0">
        {STEP_LABELS.map((label, i) => {
          const step = i + 1;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;

          return (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold transition-all duration-300 ${
                    isCompleted
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm"
                      : isCurrent
                        ? "bg-slate-900 text-white shadow-md ring-4 ring-slate-900/10 scale-110"
                        : "border border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : step}
                </div>
                <span
                  className={`mt-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors duration-300 ${
                    isCurrent ? "text-slate-900" : isCompleted ? "text-emerald-700" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className="flex-1 mx-2 sm:mx-4 flex items-center mb-6">
                  <div
                    className={`h-px w-full transition-colors duration-500 ${
                      step < currentStep ? "bg-emerald-200" : "bg-slate-200"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-10 shadow-sm">
        {children}
      </div>
    </div>
  );
}
