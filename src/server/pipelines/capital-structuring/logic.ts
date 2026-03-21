/**
 * Deprecated legacy capital-structuring support.
 * Retained for historical/internal reference only and not part of the active Quoin product surface.
 *
 * Capital Structuring Logic
 *
 * Pure functions for assembling a capital stack from eligible funding programs.
 * Stack order: Grants first → Subsidized debt → C-PACE → Market debt → Equity
 *
 * All deterministic — no LLM calls.
 */

import type { EligibilityResult } from "./eligibility/types";

export interface CapitalStackLayer {
  programCode: string;
  programName: string;
  fundingType: "GRANT" | "LOAN" | "TAX_CREDIT" | "CPACE" | "EQUITY";
  amount: number;
  interestRate: number | null;
  termYears: number | null;
  annualPayment: number;
}

export interface CapitalStack {
  layers: CapitalStackLayer[];
  totalProjectCost: number;
  totalFunded: number;
  equityRequired: number;
  totalAnnualPayment: number;
  simplePaybackYears: number | null;
  blendedRate: number | null;
}

const FUNDING_PRIORITY: Record<string, number> = {
  GRANT: 1,
  TAX_CREDIT: 2,
  LOAN: 3,
  CPACE: 4,
  EQUITY: 5,
};

/**
 * Assemble a capital stack from eligible funding sources.
 *
 * Flow: Grants first → Subsidized debt → C-PACE → Equity fills the gap
 */
export function assembleCapitalStack(
  totalProjectCost: number,
  eligiblePrograms: EligibilityResult[],
  annualEnergySavings: number,
): CapitalStack {
  if (totalProjectCost <= 0) {
    return {
      layers: [],
      totalProjectCost: 0,
      totalFunded: 0,
      equityRequired: 0,
      totalAnnualPayment: 0,
      simplePaybackYears: null,
      blendedRate: null,
    };
  }

  const eligible = eligiblePrograms
    .filter((p) => p.eligible && p.maxFundingAmount !== null && p.maxFundingAmount > 0)
    .sort((a, b) => {
      const pa = FUNDING_PRIORITY[a.fundingType] ?? 99;
      const pb = FUNDING_PRIORITY[b.fundingType] ?? 99;
      return pa - pb;
    });

  const layers: CapitalStackLayer[] = [];
  let remaining = totalProjectCost;

  for (const program of eligible) {
    if (remaining <= 0) break;
    const amount = Math.min(program.maxFundingAmount!, remaining);
    const annualPayment = calculateAnnualPayment(
      amount,
      program.interestRate,
      program.termYears,
      program.fundingType,
    );

    layers.push({
      programCode: program.programCode,
      programName: program.programName,
      fundingType: program.fundingType,
      amount,
      interestRate: program.interestRate,
      termYears: program.termYears,
      annualPayment,
    });

    remaining -= amount;
  }

  // Equity fills the gap
  if (remaining > 0) {
    layers.push({
      programCode: "EQUITY",
      programName: "Owner Equity",
      fundingType: "EQUITY",
      amount: remaining,
      interestRate: null,
      termYears: null,
      annualPayment: 0,
    });
  }

  const totalFunded = layers
    .filter((l) => l.fundingType !== "EQUITY")
    .reduce((sum, l) => sum + l.amount, 0);
  const equityRequired = layers
    .filter((l) => l.fundingType === "EQUITY")
    .reduce((sum, l) => sum + l.amount, 0);
  const totalAnnualPayment = layers.reduce((sum, l) => sum + l.annualPayment, 0);
  const blendedRate = calculateBlendedRate(layers);
  const simplePaybackYears =
    annualEnergySavings > 0
      ? Math.round((totalProjectCost / annualEnergySavings) * 10) / 10
      : null;

  return {
    layers,
    totalProjectCost,
    totalFunded,
    equityRequired,
    totalAnnualPayment,
    simplePaybackYears,
    blendedRate,
  };
}

/**
 * Calculate annual payment using standard amortization formula.
 * Grants and equity have $0 annual payments.
 */
function calculateAnnualPayment(
  amount: number,
  interestRate: number | null,
  termYears: number | null,
  fundingType: string,
): number {
  if (fundingType === "GRANT" || fundingType === "TAX_CREDIT" || fundingType === "EQUITY") {
    return 0;
  }
  if (!interestRate || !termYears || termYears <= 0) return 0;

  const r = interestRate / 100;
  if (r === 0) return amount / termYears;

  // Standard amortization: P = A * r / (1 - (1+r)^-n)
  const payment = amount * r / (1 - Math.pow(1 + r, -termYears));
  return Math.round(payment);
}

/**
 * Calculate blended interest rate across all debt layers.
 */
function calculateBlendedRate(layers: CapitalStackLayer[]): number | null {
  const debtLayers = layers.filter(
    (l) => l.fundingType !== "GRANT" && l.fundingType !== "EQUITY" && l.fundingType !== "TAX_CREDIT" && l.interestRate !== null,
  );

  if (debtLayers.length === 0) return null;

  const totalDebt = debtLayers.reduce((sum, l) => sum + l.amount, 0);
  if (totalDebt === 0) return null;

  const weightedRate = debtLayers.reduce(
    (sum, l) => sum + l.amount * (l.interestRate ?? 0),
    0,
  );

  return Math.round((weightedRate / totalDebt) * 100) / 100;
}
