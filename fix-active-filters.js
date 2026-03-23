const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/compliance-queue.tsx', 'utf8');

// The error is in `hasActiveFilters`.
/*
  const hasActiveFilters = [
    search,
    readinessFilter,
    triageFilter,
    triageUrgencyFilter,
    submissionStateFilter,
    artifactFilter,
    nextActionFilter,
    blockingOnly,
    penaltyOnly,
    syncAttentionOnly,
    anomalyAttentionOnly,
    retrofitOnly,
    systemMutedOnly,
  ].some(Boolean);
*/

const blockRegex = /const hasActiveFilters = \([\s\S]*?\]\.some\(Boolean\);/;

const newBlock = `const hasActiveFilters = [
    search,
    triageFilter,
    triageUrgencyFilter,
  ].some(Boolean);`;

if (content.match(blockRegex)) {
  fs.writeFileSync('src/components/dashboard/compliance-queue.tsx', content.replace(blockRegex, newBlock));
  console.log("Success replacing hasActiveFilters!");
} else {
  console.log("Failed to match hasActiveFilters");
}

// We should also remove the constants at the top if there are any lingering.
const constsRegex = /const (READINESS_FILTERS|ARTIFACT_FILTERS|NEXT_ACTION_FILTERS|SUBMISSION_STATE_FILTERS) = \[[\s\S]*?\] as const;/g;
content = fs.readFileSync('src/components/dashboard/compliance-queue.tsx', 'utf8');
content = content.replace(constsRegex, "");
fs.writeFileSync('src/components/dashboard/compliance-queue.tsx', content);

