"use client";

import { useState } from "react";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { StepOrg } from "@/components/onboarding/step-org";
import { StepBuilding } from "@/components/onboarding/step-building";
import { StepData } from "@/components/onboarding/step-data";
import { StepConnect } from "@/components/onboarding/step-connect";
import { StepDone } from "@/components/onboarding/step-done";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [buildingId, setBuildingId] = useState<string | null>(null);

  function next() {
    setStep((s) => Math.min(s + 1, 5));
  }

  function onBuildingCreated(id: string) {
    setBuildingId(id);
    next();
  }

  return (
    <WizardShell currentStep={step}>
      {step === 1 && <StepOrg onNext={next} />}
      {step === 2 && (
        <StepBuilding onNext={onBuildingCreated} onSkip={next} />
      )}
      {step === 3 && (
        <StepData buildingId={buildingId} onNext={next} onSkip={next} />
      )}
      {step === 4 && (
        <StepConnect buildingId={buildingId} onNext={next} onSkip={next} />
      )}
      {step === 5 && <StepDone />}
    </WizardShell>
  );
}
