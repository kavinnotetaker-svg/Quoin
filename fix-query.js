const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/compliance-queue.tsx', 'utf8');

// The `worklist` query uses these variables that are now gone:
/*
    readinessState:
      (readinessFilter as
        | "DATA_INCOMPLETE"
        | "READY_FOR_REVIEW"
        | "READY_TO_SUBMIT"
        | "SUBMITTED"
        | "") || undefined,
    hasBlockingIssues: blockingOnly ? true : undefined,
    hasPenaltyExposure: penaltyOnly ? true : undefined,
    submissionState:
      (submissionStateFilter as
        | "NOT_STARTED"
        | "PRE_SUBMISSION"
        | "SUBMITTED"
        | "REVIEW"
        | "APPROVED"
        | "REJECTED"
        | "") || undefined,
    needsSyncAttention: syncAttentionOnly ? true : undefined,
    needsAnomalyAttention: anomalyAttentionOnly ? true : undefined,
    isRetrofitCandidate: retrofitOnly ? true : undefined,
    isSystemMuted: systemMutedOnly ? true : undefined,
    artifactStatus:
      (artifactFilter as "NOT_STARTED" | "GENERATED" | "STALE" | "FINALIZED" | "") ||
      undefined,
    nextAction:
      (nextActionFilter as
        | "RESOLVE_BLOCKING_ISSUES"
        | "REFRESH_INTEGRATION"
        | "REGENERATE_ARTIFACT"
        | "FINALIZE_ARTIFACT"
        | "REVIEW_COMPLIANCE_RESULT"
        | "SUBMIT_ARTIFACT"
        | "MONITOR_SUBMISSION"
        | "") || undefined,
*/

// Let's replace the whole payload object for worklist.
const blockRegex = /const worklist = trpc\.building\.portfolioWorklist\.useQuery\(\{[\s\S]*?sortBy,\n  \}\);/;

const newBlock = `const worklist = trpc.building.portfolioWorklist.useQuery({
    limit: pageSize,
    cursor: "0",
    search: search || undefined,
    triageCategory:
      (triageFilter as
        | "MISSING_DATA"
        | "DATA_QUALITY_ISSUE"
        | "COMPLIANCE_RISK"
        | "DEADLINE_APPROACHING"
        | "SUBMITTED"
        | "") || undefined,
    triageUrgency:
      (triageUrgencyFilter as "NOW" | "SOON" | "LATER" | "") || undefined,
    hasBlockingIssues: triageFilter === 'COMPLIANCE_BLOCKER' ? true : undefined,
    sortBy,
  });`;

if (content.match(blockRegex)) {
  fs.writeFileSync('src/components/dashboard/compliance-queue.tsx', content.replace(blockRegex, newBlock));
  console.log("Success replacing query!");
} else {
  console.log("Failed to match blockRegex");
}
