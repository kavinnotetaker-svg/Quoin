"use client";

const STEP_LABELS = ["Organization", "Building", "Data", "Connect", "Done"];

interface WizardShellProps {
  currentStep: number;
  children: React.ReactNode;
}

export function WizardShell({ currentStep, children }: WizardShellProps) {
  return (
    <div className="space-y-8">
      {/* Progress bar */}
      <div className="flex items-center justify-between">
        {STEP_LABELS.map((label, i) => {
          const step = i + 1;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;

          return (
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isCompleted
                      ? "bg-gray-200 text-gray-600"
                      : isCurrent
                        ? "bg-gray-900 text-white"
                        : "border border-gray-300 text-gray-400"
                  }`}
                >
                  {isCompleted ? "✓" : step}
                </div>
                <span
                  className={`mt-1 text-[10px] ${
                    isCurrent ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div
                  className={`mx-2 h-px w-8 sm:w-12 ${
                    step < currentStep ? "bg-gray-300" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {children}
    </div>
  );
}
