# Quoin Calculation Reference

> Every deterministic formula, conversion, and rule in the platform.
> Zero LLM involvement in any calculation below. All pure TypeScript.

---

## Table of Contents

1. [Unit Conversions (CSV Normalization)](#1-unit-conversions)
2. [Source Energy Factors (Site-to-Source)](#2-source-energy-factors)
3. [EUI Calculation (Site & Source)](#3-eui-calculation)
4. [Compliance Status Determination](#4-compliance-status-determination)
5. [Compliance Gap](#5-compliance-gap)
6. [Simple Penalty Estimate (Ingestion Phase)](#6-simple-penalty-estimate)
7. [Data Quality Score](#7-data-quality-score)
8. [Reading Validation Ranges](#8-reading-validation-ranges)
9. [Maximum Penalty](#9-maximum-penalty)
10. [Performance Pathway Penalty](#10-performance-pathway-penalty)
11. [Standard Target Pathway Penalty (Two-Step)](#11-standard-target-pathway-penalty)
12. [Prescriptive Pathway Penalty](#12-prescriptive-pathway-penalty)
13. [Pathway Routing (Metric-Aware)](#13-pathway-routing)
14. [All Pathways Comparison](#14-all-pathways-comparison)
15. [Metric-Aware Penalty Switch](#15-metric-aware-penalty-switch)
16. [ECM Scoring & Selection](#16-ecm-scoring--selection)
17. [Capital Stack Assembly](#17-capital-stack-assembly)
18. [Loan Amortization](#18-loan-amortization)
19. [Blended Interest Rate](#19-blended-interest-rate)
20. [CLEER Eligibility](#20-cleer-eligibility)
21. [C-PACE Eligibility](#21-c-pace-eligibility)
22. [AHRA Eligibility](#22-ahra-eligibility)
23. [Drift Detection: EUI Spike](#23-drift-eui-spike)
24. [Drift Detection: Score Drop](#24-drift-score-drop)
25. [Drift Detection: Consumption Anomaly](#25-drift-consumption-anomaly)
26. [Drift Detection: Seasonal Deviation](#26-drift-seasonal-deviation)
27. [Drift Detection: Sustained Drift](#27-drift-sustained-drift)
28. [Exemption Screening](#28-exemption-screening)
29. [Constants Reference](#29-constants-reference)

---

## Pipeline Map

```
CSV Upload / Green Button / ESPM Sync
        |
        v
 [1] Unit Conversion (normalizer.ts)          <-- Step 1
        |
        v
 [2] Site-to-Source Conversion (source-factors.ts) <-- Step 2
        |
        v
 [3] EUI Calculation (snapshot.ts)             <-- Step 3
        |
        v
 [4-6] Compliance Status + Gap + Penalty Est.  <-- Step 4
        |
        v
 [7] Data Quality Score (snapshot.ts)          <-- Step 5
        |
        v
 ComplianceSnapshot persisted (append-only)
        |
        +--------+-----------+
        |        |           |
        v        v           v
 [9-15]      [16-19]     [23-27]
 Pathway     Capital     Drift
 Analysis    Structuring Detection
```

---

## 1. Unit Conversions

**File:** `src/server/pipelines/data-ingestion/normalizer.ts`
**Function:** `normalizeReading(row, defaultUnit, defaultMeterType)`
**Pipeline Step:** Data Ingestion, first transformation after CSV parse

Converts raw meter readings to kBtu (the common unit for all downstream calculations).

| Input Unit | Factor to kBtu | Detected Meter Type | Prisma EnergyUnit |
|-----------|----------------|--------------------|--------------------|
| kWh       | 3.412          | ELECTRIC           | KWH                |
| MWh       | 3,412          | ELECTRIC           | KWH                |
| kBtu      | 1.0            | ELECTRIC           | KBTU               |
| Therms    | 100            | GAS                | THERMS             |
| CCF       | 102.6          | GAS                | THERMS             |
| KCF       | 1,026          | GAS                | THERMS             |
| MCF       | 1,026,000      | GAS                | THERMS             |
| CF        | 1.026          | GAS                | THERMS             |
| MLB       | 1,194          | STEAM              | MMBTU              |
| KLB       | 1,194          | STEAM              | MMBTU              |
| LBS       | 1.194          | STEAM              | MMBTU              |
| GJ        | 947.817        | OTHER              | KBTU               |

**Formula:**

```
consumptionKbtu = row.consumption * KBTU_FACTORS[unitKey].factor
```

**Example:** 42,500 kWh electricity bill

```
consumptionKbtu = 42,500 * 3.412 = 145,010 kBtu
```

---

## 2. Source Energy Factors

**File:** `src/server/pipelines/shared/source-factors.ts`
**Functions:** `getSourceRatio(meterType)`, `toSourceKbtu(siteKbtu, meterType)`
**Pipeline Step:** EUI calculation (called inside `calculateEUI`)

DC 2024-2026 EPA source-to-site ratios. Source energy accounts for upstream losses (generation, transmission, distribution).

| Meter Type | Fuel Type        | Ratio | Effective Period     |
|-----------|------------------|-------|----------------------|
| ELECTRIC  | Grid Electricity | 2.70  | 2024-01-01 to 2026-12-31 |
| GAS       | Natural Gas      | 1.05  | 2024-01-01 to 2026-12-31 |
| STEAM     | District Steam   | 1.20  | 2024-01-01 to 2026-12-31 |
| OTHER     | On-site Solar    | 1.00  | 2024-01-01 to 2026-12-31 |

**Formula:**

```
sourceKbtu = siteKbtu * ratio
```

**Example:** 145,010 kBtu of electricity

```
sourceKbtu = 145,010 * 2.70 = 391,527 kBtu
```

**Auditability:** The `sourceFactorUsed` is stored on each `EnergyReading` and `sourceFactorsUsed` is tracked per `EUICalculation`. If EPA updates ratios, historical snapshots retain the factor active at calculation time.

**Error Handling:** Throws `RegulatoryDataError` if consumption is `null` or `undefined`.

---

## 3. EUI Calculation

**File:** `src/server/pipelines/data-ingestion/snapshot.ts`
**Function:** `calculateEUI(readings, grossSquareFeet)`
**Pipeline Step:** Data Ingestion, after all readings are normalized

**Formulas:**

```
totalSiteKBtu   = SUM(reading.consumptionKbtu)  for all readings
totalSourceKBtu = SUM(reading.consumptionKbtu * getSourceRatio(reading.meterType))

siteEui   = totalSiteKBtu / grossSquareFeet      (kBtu/ft^2)
sourceEui = totalSourceKBtu / grossSquareFeet     (kBtu/ft^2)
monthsCovered = COUNT(DISTINCT year-month across all readings)
```

**Example:** 100,000 SF building, 12 months, electricity + gas

```
Electric: 12 months * 100,000 kBtu = 1,200,000 kBtu (site)
Gas:      12 months *  50,000 kBtu =   600,000 kBtu (site)

totalSiteKBtu   = 1,800,000
totalSourceKBtu = (1,200,000 * 2.70) + (600,000 * 1.05) = 3,240,000 + 630,000 = 3,870,000

siteEui   = 1,800,000 / 100,000 = 18.0 kBtu/ft^2
sourceEui = 3,870,000 / 100,000 = 38.7 kBtu/ft^2
```

**Edge cases:** Returns all zeros if `readings` is empty or `grossSquareFeet <= 0`.

---

## 4. Compliance Status Determination

**File:** `src/server/pipelines/data-ingestion/snapshot.ts`
**Function:** `determineComplianceStatus(energyStarScore, bepsTargetScore)`
**Pipeline Step:** Data Ingestion, snapshot assembly

```
IF energyStarScore == null         -> PENDING_DATA
IF energyStarScore >= target       -> COMPLIANT
IF target - energyStarScore <= 5   -> AT_RISK
ELSE                               -> NON_COMPLIANT
```

**Example:** target = 71

| Score | Status         |
|-------|---------------|
| null  | PENDING_DATA  |
| 78    | COMPLIANT     |
| 71    | COMPLIANT     |
| 68    | AT_RISK       |
| 66    | AT_RISK       |
| 65    | NON_COMPLIANT |
| 45    | NON_COMPLIANT |

---

## 5. Compliance Gap

**File:** `src/server/pipelines/data-ingestion/snapshot.ts`
**Function:** `calculateComplianceGap(energyStarScore, bepsTargetScore)`
**Pipeline Step:** Data Ingestion, snapshot assembly

```
IF energyStarScore == null -> null
ELSE -> energyStarScore - bepsTargetScore
```

Positive = above target. Negative = below target.

---

## 6. Simple Penalty Estimate

**File:** `src/server/pipelines/data-ingestion/snapshot.ts`
**Function:** `estimatePenalty(energyStarScore, bepsTargetScore, maxPenaltyExposure)`
**Pipeline Step:** Data Ingestion, snapshot assembly (before full pathway analysis)

```
IF score == null OR score >= target -> $0

gap = target - score
penaltyFraction = min(gap / target, 1.0)
penalty = ROUND(maxPenaltyExposure * penaltyFraction)
```

**Example:** score = 45, target = 71, maxPenalty = $1,500,000

```
gap = 71 - 45 = 26
fraction = min(26 / 71, 1.0) = 0.3662
penalty = ROUND(1,500,000 * 0.3662) = $549,296
```

This is a simplified estimate. Full pathway analysis (Sections 10-12) replaces it.

---

## 7. Data Quality Score

**File:** `src/server/pipelines/data-ingestion/snapshot.ts`
**Function:** `computeDataQualityScore(totalReadings, rejectedReadings, warningCount, monthsCovered)`
**Pipeline Step:** Data Ingestion, after validation

```
IF totalReadings == 0 -> 0

score = 100
score -= (rejectedReadings / totalReadings) * 40       // up to -40
score -= min((warningCount / totalReadings) * 20, 20)  // up to -20
IF monthsCovered < 12:
  score -= (12 - monthsCovered) * 3                     // up to -36

RETURN clamp(ROUND(score), 0, 100)
```

**Example:** 10 readings, 1 rejected, 2 warnings, 10 months

```
score = 100 - (1/10)*40 - min((2/10)*20, 20) - (12-10)*3
      = 100 - 4 - 4 - 6
      = 86
```

---

## 8. Reading Validation Ranges

**File:** `src/server/pipelines/data-ingestion/validator.ts`
**Function:** `validateReading(reading, buildingGSF)`
**Pipeline Step:** Data Ingestion, per-reading validation

Expected monthly consumption per 1,000 SF:

| Meter Type | Min (kBtu/kSF) | Max (kBtu/kSF) |
|-----------|----------------|----------------|
| ELECTRIC  | 0.5            | 50             |
| GAS       | 0.1            | 30             |
| STEAM     | 0.1            | 40             |
| OTHER     | 0              | 100            |

```
kbtuPerKSF = reading.consumptionKbtu / (buildingGSF / 1000)
```

Outside range -> WARNING (not rejection).

Additional checks:
- Negative/zero consumption -> ERROR
- Future start date -> ERROR
- Future end date -> WARNING
- End date <= start date -> ERROR
- Billing period > 45 days or < 20 days -> WARNING
- Negative cost -> WARNING
- Year < 2010 -> ERROR

---

## 9. Maximum Penalty

**File:** `src/server/pipelines/pathway-analysis/penalty-calculator.ts`
**Function:** `calculateMaxPenalty(grossSquareFeet)`
**Pipeline Step:** Pathway Analysis, first calculation

```
maxPenalty = min(grossSquareFeet * $10, $7,500,000)
```

| Building Size | Max Penalty  |
|--------------|-------------|
| 50,000 SF    | $500,000    |
| 150,000 SF   | $1,500,000  |
| 750,000 SF   | $7,500,000  |
| 1,000,000 SF | $7,500,000 (capped) |
| 0 or negative | $0         |

---

## 10. Performance Pathway Penalty

**File:** `src/server/pipelines/pathway-analysis/penalty-calculator.ts`
**Function:** `calculatePerformancePenalty(input)`
**Pipeline Step:** Pathway Analysis
**Metric Used:** **Site EUI** (not Source)

From BEPS Compliance Guidebook Table 23:

```
reductionPct = ((baselineSiteEui - currentSiteEui) / baselineSiteEui) * 100
targetPct = 20  (default, configurable)

IF reductionPct >= targetPct:
  COMPLIANT, penalty = $0

ELSE:
  progress = max(0, reductionPct) / targetPct
  adjustedPenalty = ROUND(maxPenalty * (1 - progress))
```

**Example:** 150,000 SF building, baseline EUI = 120, current = 108

```
maxPenalty = min(150,000 * 10, 7,500,000) = $1,500,000
reductionPct = (120 - 108) / 120 * 100 = 10%
progress = 10 / 20 = 0.5
adjustedPenalty = ROUND(1,500,000 * (1 - 0.5)) = $750,000
```

**Edge cases:**
- baselineSiteEui <= 0 -> full penalty, message: "No baseline"
- EUI increased (negative reduction) -> progress clamped to 0, full penalty

---

## 11. Standard Target Pathway Penalty

**File:** `src/server/pipelines/pathway-analysis/penalty-calculator.ts`
**Function:** `calculateStandardTargetPenalty(input)`
**Pipeline Step:** Pathway Analysis
**Metric Used:** **ENERGY STAR Score** (source-based)

BEPS Compliance Guidebook Table 23 -- **Two-Step Calculation:**

```
IF currentScore >= bepsTargetScore:
  COMPLIANT, penalty = $0

ELSE:
  baselineGap = bepsTargetScore - baselineScore
  maxGap = maxGapForPropertyType ?? 15

  STEP 1 -- Initial Performance Adjustment:
    initialAdj = max(0, 1 - baselineGap / maxGap)

  STEP 2 -- Gap Closure:
    pointsGained = max(0, currentScore - baselineScore)
    gapClosure = min(pointsGained / baselineGap, 1)   [if baselineGap > 0, else 0]

  COMBINED:
    totalReduction = 1 - (1 - initialAdj) * (1 - gapClosure)
    adjustedPenalty = ROUND(maxPenalty * (1 - totalReduction))
```

**Guidebook Example (Building B):**

```
baseline = 65, current = 69, target = 75, maxGap = 15
baselineGap = 75 - 65 = 10
initialAdj = 1 - 10/15 = 0.333    (33.3%)
pointsGained = 69 - 65 = 4
gapClosure = 4/10 = 0.4           (40%)
totalReduction = 1 - (0.667 * 0.6) = 1 - 0.4 = 0.6   (60%)
adjustedPenalty = ROUND(1,000,000 * 0.4) = $400,000
```

**Edge cases:**
- baselineGap <= 0 (at target at baseline): initialAdj = 1, totalReduction = 1, penalty = $0
- baselineGap > maxGap: initialAdj = 0, falls back to pure gap closure

---

## 12. Prescriptive Pathway Penalty

**File:** `src/server/pipelines/pathway-analysis/penalty-calculator.ts`
**Function:** `calculatePrescriptivePenalty(input)`
**Pipeline Step:** Pathway Analysis

From BEPS Compliance Guidebook Table 23:

```
IF pointsNeeded <= 0 OR pointsEarned >= pointsNeeded:
  COMPLIANT, penalty = $0

ELSE:
  progress = max(0, pointsEarned) / pointsNeeded
  adjustedPenalty = ROUND(maxPenalty * (1 - progress))
```

**Example:** 150,000 SF, earned 10 of 25 points

```
maxPenalty = $1,500,000
progress = 10/25 = 0.4
adjustedPenalty = ROUND(1,500,000 * 0.6) = $900,000
```

---

## 13. Pathway Routing

**File:** `src/server/pipelines/pathway-analysis/penalty-calculator.ts`
**Function:** `determineApplicablePathway(currentScore, bepsTargetScore)`
**Pipeline Step:** Pathway Analysis, determines which pathway applies

```
IF currentScore == null             -> PENDING_DATA
IF currentScore >= bepsTargetScore  -> COMPLIANT
IF currentScore > 55                -> STANDARD_TARGET
ELSE (score <= 55)                  -> PERFORMANCE
```

The score = 55 boundary is critical:
- Score 56 -> STANDARD_TARGET (score-based gap closure)
- Score 55 -> PERFORMANCE (20% Site EUI reduction)

Buildings can always opt for Prescriptive as an alternative regardless of score.

---

## 14. All Pathways Comparison

**File:** `src/server/pipelines/pathway-analysis/penalty-calculator.ts`
**Function:** `calculateAllPathways(input)`
**Pipeline Step:** Pathway Analysis, final step

1. Calculate Performance penalty (if baseline + current Site EUI available)
2. Calculate Standard Target penalty (if baseline + current score available)
3. Calculate Prescriptive penalty (if points data available)
4. **Recommend the pathway with the LOWEST adjustedPenalty**

Returns all three results + recommended option.

---

## 15. Metric-Aware Penalty Switch

**File:** `src/server/pipelines/pathway-analysis/penalty-calculator.ts`
**Function:** `calculateMetricAwarePenalty(input)`
**Pipeline Step:** Pathway Analysis, routes to correct metric

This is the critical dual-metric routing logic:

```
IF pathway == "STANDARD_TARGET":
  REQUIRE: currentScore (non-null)
  REQUIRE: baselineScore (non-null)
  -> Delegates to calculateStandardTargetPenalty()
  -> Uses ENERGY STAR Score (SOURCE-based metric)

IF pathway == "PERFORMANCE":
  REQUIRE: baselineSiteEui (non-null)
  REQUIRE: currentSiteEui (non-null)
  -> Delegates to calculatePerformancePenalty()
  -> Uses Site EUI (SITE-based metric)
```

**Why this matters:**
- The DC Property Type Median (used by StandardTarget) is derived from ENERGY STAR Scores, which are source-based.
- The 20% reduction target (used by Performance) is measured against Site EUI from the 2019 baseline.
- Mixing these up produces incorrect penalty projections.

**Error handling:** Throws `RegulatoryDataError` with descriptive messages and field names when required data is null.

---

## 16. ECM Scoring & Selection

**File:** `src/server/pipelines/pathway-analysis/ecm-scorer.ts`
**Function:** `scoreECMs(profile)`
**Pipeline Step:** Pathway Analysis, after pathway determination

**Pre-filtering:**

```
buildingAge = currentYear - yearBuilt   (default 30 if yearBuilt is null)

FOR EACH ECM:
  SKIP if propertyType not in ecm.applicablePropertyTypes
  SKIP if buildingAge < ecm.minBuildingAge
  SKIP if ecm = "LED Retrofit" AND building hasLedLighting
  SKIP if ecm = "Retro-Commissioning" AND building hasRetroCommissioning
```

**Relevance Score (0-100):**

Function: `calculateRelevanceScore(ecm, profile, pathway, buildingAge)`

```
score = 50  (baseline)

-- Pathway Alignment --
IF ecm.priority == "QUICK_WIN" AND pathway == "STANDARD_TARGET":   score += 25
IF ecm.priority == "DEEP_RETROFIT" AND pathway == "PERFORMANCE":   score += 25
IF ecm.priority == "QUICK_WIN" AND pathway == "PERFORMANCE":       score += 10
ELSE:                                                               score -= 10

-- Savings Impact --
IF ecm.estimatedSavingsPct >= 15:  score += 15
ELSE IF >= 10:                     score += 10
ELSE IF >= 5:                      score += 5

-- Payback Attractiveness --
IF ecm.simplePaybackYears <= 2:    score += 15
ELSE IF <= 5:                      score += 10
ELSE IF <= 10:                     score += 5

-- Envelope Condition (envelope ECMs only) --
IF profile.envelopeCondition == "POOR":  score += 15
ELSE IF == "FAIR":                       score += 5

-- Building Age --
IF buildingAge > 40:  score += 10
ELSE IF > 25:         score += 5

RETURN clamp(score, 0, 100)
```

**Cost & Savings Estimates:**

```
estimatedCost = ecm.costPerSqft * grossSquareFeet
annualSiteKbtu = currentSiteEui * grossSquareFeet
estimatedAnnualSavingsKbtu = annualSiteKbtu * (ecm.estimatedSavingsPct / 100)
```

**Aggregate Projections:**

```
totalSavingsPct = SUM(ecm.estimatedSavingsPct)
totalCost = SUM(estimatedCost)
projectedSiteEui = currentSiteEui * (1 - min(totalSavingsPct, 80) / 100)
```

The 80% cap prevents unrealistic projections.

---

## 17. Capital Stack Assembly

**File:** `src/server/pipelines/capital-structuring/logic.ts`
**Function:** `assembleCapitalStack(totalProjectCost, eligiblePrograms, annualEnergySavings)`
**Pipeline Step:** Capital Structuring

**Funding Priority Order:**

| Priority | Type        | Example        |
|----------|------------|----------------|
| 1        | GRANT      | AHRA rebate    |
| 2        | TAX_CREDIT | IRA credits    |
| 3        | LOAN       | CLEER loan     |
| 4        | CPACE      | C-PACE assessment |
| 5        | EQUITY     | Owner capital  |

**Algorithm:**

```
SORT eligible programs by funding priority ASC
remaining = totalProjectCost

FOR EACH program:
  IF remaining <= 0: BREAK
  amount = min(program.maxFundingAmount, remaining)
  annualPayment = calculateAnnualPayment(amount, rate, term, type)
  remaining -= amount

IF remaining > 0:
  ADD equity layer for remaining amount

totalFunded = SUM(amounts where type != EQUITY)
equityRequired = SUM(amounts where type == EQUITY)
totalAnnualPayment = SUM(annualPayment for all layers)
blendedRate = calculateBlendedRate(layers)
simplePaybackYears = ROUND((totalProjectCost / annualEnergySavings) * 10) / 10
```

---

## 18. Loan Amortization

**File:** `src/server/pipelines/capital-structuring/logic.ts`
**Function:** `calculateAnnualPayment(amount, interestRate, termYears, fundingType)`
**Pipeline Step:** Capital Structuring, per-layer calculation

```
IF fundingType in (GRANT, TAX_CREDIT, EQUITY) -> $0
IF interestRate == null OR termYears <= 0     -> $0

r = interestRate / 100

IF r == 0:
  annualPayment = amount / termYears

ELSE:
  annualPayment = amount * r / (1 - (1 + r)^(-termYears))

RETURN ROUND(annualPayment)
```

This is the standard amortization formula: `P = A * r / (1 - (1+r)^-n)`

**Example:** $100,000 at 5% for 10 years

```
r = 0.05
payment = 100,000 * 0.05 / (1 - 1.05^-10)
        = 5,000 / (1 - 0.6139)
        = 5,000 / 0.3861
        = $12,950/year
```

---

## 19. Blended Interest Rate

**File:** `src/server/pipelines/capital-structuring/logic.ts`
**Function:** `calculateBlendedRate(layers)`
**Pipeline Step:** Capital Structuring, after stack assembly

```
debtLayers = layers WHERE type NOT IN (GRANT, EQUITY, TAX_CREDIT)
                     AND interestRate != null

IF no debtLayers -> null

totalDebt = SUM(amount for debtLayers)
IF totalDebt == 0 -> null

weightedRate = SUM(amount * interestRate for debtLayers)
blendedRate = ROUND((weightedRate / totalDebt) * 100) / 100
```

**Example:**

```
Layer 1: $200K at 4%
Layer 2: $300K at 6%

totalDebt = $500K
weightedRate = (200K * 4) + (300K * 6) = 800K + 1,800K = 2,600K
blendedRate = 2,600K / 500K = 5.20%
```

---

## 20. CLEER Eligibility

**File:** `src/server/pipelines/capital-structuring/eligibility/cleer.ts`
**Function:** `screenCLEER(profile)`
**Pipeline Step:** Capital Structuring, eligibility screening

| Rule | Requirement |
|------|-------------|
| Property type | OFFICE, RETAIL, HOTEL, INDUSTRIAL, WAREHOUSE, MULTIFAMILY, MIXED_USE, NONPROFIT, COMMON_OWNERSHIP |
| Multifamily | Must have >= 5 units |
| Project cost | $10,000 <= cost <= $250,000 |
| Owner | Cannot be GOVERNMENT |
| Contractor | Authorized contractor recommended (not required) |

```
maxFunding = min(totalProjectCost, $250,000)
interestRate = 3.0%
maxTerm = 12 years
```

---

## 21. C-PACE Eligibility

**File:** `src/server/pipelines/capital-structuring/eligibility/cpace.ts`
**Function:** `screenCPACE(profile)`
**Pipeline Step:** Capital Structuring, eligibility screening

**SIR Check (Savings-to-Investment Ratio):**

```
annualAssessment = totalProjectCost / 25  (CPACE_TERM_YEARS)
SIR = estimatedAnnualEnergySavings / annualAssessment
REQUIRE: SIR > 1.0
```

**DSCR Check (Debt Service Coverage Ratio):**

```
REQUIRE: DSCR >= 1.15
```

**Combined LTV Check (Loan-to-Value):**

```
combinedLtv = (existingMortgage + totalProjectCost) / propertyAssessedValue
REQUIRE: combinedLtv <= 0.90
```

**Disqualifiers:**
- Property type not eligible
- Owner is GOVERNMENT
- Existing C-PACE lien
- Property taxes not current
- SIR <= 1.0
- DSCR < 1.15
- Combined LTV > 90%
- Mortgage lender consent not obtained

**Constants:**
- Interest rate: 7.0%
- Term: 25 years
- Max combined LTV: 90%
- Min DSCR: 1.15
- Min SIR: 1.0

---

## 22. AHRA Eligibility

**File:** `src/server/pipelines/capital-structuring/eligibility/ahra.ts`
**Function:** `screenAHRA(profile)`
**Pipeline Step:** Capital Structuring, eligibility screening

| Rule | Requirement |
|------|-------------|
| Property type | MULTIFAMILY or MIXED_USE only |
| Units | >= 5 |
| Affordability | >= 50% of units at or below 80% AMI |
| Compliance | Must be non-compliant (targets buildings that need help) |
| Projected savings | >= 20% energy savings |
| Owner | Cannot be GOVERNMENT |

**Rebate Calculation:**

```
IF projectedSavingsPercent >= 35%:
  rebatePerUnit = $30,000  (deep retrofit)
ELSE:
  rebatePerUnit = $15,000  (standard)

maxFunding = unitCount * rebatePerUnit
```

**Priority Tier:**

```
IF grossSquareFeet >= 50,000:  tier = HIGH
ELSE IF >= 10,000:             tier = STANDARD
ELSE:                          tier = FUTURE_ELIGIBLE
```

**Example:** 120-unit building, 55% affordable, 25% projected savings

```
rebatePerUnit = $15,000  (25% < 35%)
maxFunding = 120 * $15,000 = $1,800,000
```

---

## 23. Drift: EUI Spike

**File:** `src/server/pipelines/drift-detection/rules-engine.ts`
**Function:** `checkEuiSpike(input, now)`
**Pipeline Step:** Drift Detection, Rule 1

**Statistical anomaly detection using 2-sigma threshold:**

```
monthlyEuis = [consumptionKbtu / GSF  for each historical reading]

mean = SUM(monthlyEuis) / COUNT(monthlyEuis)
variance = SUM((eui - mean)^2) / COUNT(monthlyEuis)
stddev = SQRT(variance)

threshold = mean + 2 * stddev

IF currentSiteEui > threshold:
  severity =
    CRITICAL  if currentSiteEui > mean + 3 * stddev
    HIGH      otherwise
```

---

## 24. Drift: Score Drop

**File:** `src/server/pipelines/drift-detection/rules-engine.ts`
**Function:** `checkScoreDrop(input, now)`
**Pipeline Step:** Drift Detection, Rule 2

```
drop = previousScore - currentScore

IF drop >= 3:
  severity =
    CRITICAL  if drop >= 10
    HIGH      if drop >= 5
    MEDIUM    if drop >= 3
```

---

## 25. Drift: Consumption Anomaly

**File:** `src/server/pipelines/drift-detection/rules-engine.ts`
**Function:** `checkConsumptionAnomaly(input, now)`
**Pipeline Step:** Drift Detection, Rule 3

```
avgConsumption = SUM(historical.consumptionKbtu) / COUNT(historical)
threshold = avgConsumption * 3

FOR EACH current reading:
  IF consumptionKbtu > threshold:
    ratio = consumptionKbtu / avgConsumption
    ALERT severity HIGH
```

---

## 26. Drift: Seasonal Deviation

**File:** `src/server/pipelines/drift-detection/rules-engine.ts`
**Function:** `checkSeasonalDeviation(input, now)`
**Pipeline Step:** Drift Detection, Rule 4

```
Group historical readings by calendar month (0-11)

FOR EACH current reading:
  month = reading.periodStart.getUTCMonth()
  sameMonthAvg = AVG(kBtu for historical readings in same month)

  IF sameMonthAvg > 0:
    deviationPct = ((reading.consumptionKbtu - sameMonthAvg) / sameMonthAvg) * 100

    IF |deviationPct| > 20:
      severity =
        HIGH    if |deviationPct| > 40
        MEDIUM  if |deviationPct| > 20
      direction = "above" if positive, "below" if negative
```

---

## 27. Drift: Sustained Drift

**File:** `src/server/pipelines/drift-detection/rules-engine.ts`
**Function:** `checkSustainedDrift(input, now)`
**Pipeline Step:** Drift Detection, Rule 5

```
baselineMonthlyKbtu = (baselineSiteEui * grossSquareFeet) / 12
driftThreshold = baselineMonthlyKbtu * 1.15   (15% above baseline)

consecutiveAbove = 0
FOR EACH current reading (in order):
  IF consumptionKbtu > driftThreshold:
    consecutiveAbove++
  ELSE:
    consecutiveAbove = 0

IF consecutiveAbove >= 7:
  ALERT severity CRITICAL
```

---

## 28. Exemption Screening

**File:** `src/server/pipelines/pathway-analysis/exemption-screener.ts`
**Function:** `screenForExemptions(input)`
**Pipeline Step:** Pathway Analysis, pre-check before penalty calculation

| Exemption | Rule |
|-----------|------|
| Low Occupancy | baselineOccupancyPct < 50% |
| Financial Distress | inForeclosure OR inBankruptcy OR negativeNetOperatingIncome OR taxDelinquent |
| Recent Construction | yearBuilt >= 2016 |

```
eligible = qualifiedExemptions.length > 0
```

---

## 29. Constants Reference

| Constant | Value | File | Purpose |
|----------|-------|------|---------|
| PENALTY_PER_SQFT | $10 | penalty-calculator.ts | Base penalty per square foot |
| MAX_PENALTY_CAP | $7,500,000 | penalty-calculator.ts | Hard ceiling |
| PERFORMANCE_TARGET_PCT | 20% | penalty-calculator.ts | Default Site EUI reduction target |
| DEFAULT_MAX_GAP | 15 | penalty-calculator.ts | Standard Target max gap (default) |
| Electric source factor | 2.70 | source-factors.ts | DC 2024-2026 EPA |
| Gas source factor | 1.05 | source-factors.ts | DC 2024-2026 EPA |
| Steam source factor | 1.20 | source-factors.ts | DC 2024-2026 EPA |
| Solar/Other source factor | 1.00 | source-factors.ts | DC 2024-2026 EPA |
| CPACE_MAX_COMBINED_LTV | 90% | cpace.ts | Loan-to-value limit |
| CPACE_MIN_DSCR | 1.15 | cpace.ts | Debt service coverage |
| CPACE_MIN_SIR | 1.0 | cpace.ts | Savings-to-investment ratio |
| CPACE_INTEREST_RATE | 7.0% | cpace.ts | Fixed rate |
| CPACE_TERM_YEARS | 25 | cpace.ts | Assessment term |
| CLEER_MIN_PROJECT_COST | $10,000 | cleer.ts | Floor |
| CLEER_MAX_LOAN | $250,000 | cleer.ts | Ceiling |
| CLEER_MAX_TERM | 12 years | cleer.ts | Max repayment |
| CLEER_INTEREST_RATE | 3.0% | cleer.ts | Fixed rate |
| CLEER_MIN_MULTIFAMILY_UNITS | 5 | cleer.ts | Unit minimum |
| AHRA_MIN_UNITS | 5 | ahra.ts | Unit minimum |
| AHRA_MIN_AFFORDABLE_PCT | 50% | ahra.ts | Affordability threshold |
| AHRA_MIN_SAVINGS_PCT | 20% | ahra.ts | Energy savings minimum |
| AHRA_REBATE_STANDARD | $15,000/unit | ahra.ts | 20-34% savings tier |
| AHRA_REBATE_DEEP | $30,000/unit | ahra.ts | >=35% savings tier |
| AHRA_HIGH_PRIORITY_GSF | 50,000 SF | ahra.ts | Priority threshold |
| Drift: EUI Spike | mean + 2 sigma | rules-engine.ts | Statistical threshold |
| Drift: Score Drop | >= 3 points | rules-engine.ts | Score change trigger |
| Drift: Consumption Anomaly | 3x average | rules-engine.ts | Multiplier |
| Drift: Seasonal Deviation | +/- 20% | rules-engine.ts | YoY deviation |
| Drift: Sustained | 7+ periods > 15% | rules-engine.ts | Consecutive months |
