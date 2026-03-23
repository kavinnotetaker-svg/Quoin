const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/compliance-queue.tsx', 'utf8');

// The error is: Object literal may only specify known properties, and 'triageCategory' does not exist in type '{ ... }'
// It seems the TRPC router was never updated to take "triageCategory" or "triageUrgency". 
// It expects the old filters! 

const blockRegex = /search: search \|\| undefined,[\s\S]*?sortBy,/g;

const restoreBlock = `search: search || undefined,
    readinessState: undefined,
    hasBlockingIssues: triageFilter === 'COMPLIANCE_BLOCKER' ? true : undefined,
    hasPenaltyExposure: undefined,
    submissionState: undefined,
    needsSyncAttention: undefined,
    needsAnomalyAttention: triageUrgencyFilter === 'NOW' ? true : undefined,
    hasRetrofitOpportunity: undefined,
    artifactStatus: undefined,
    nextAction: undefined,
    sortBy,`;

content = content.replace(blockRegex, restoreBlock);
fs.writeFileSync('src/components/dashboard/compliance-queue.tsx', content);

console.log("Reverted to original TRPC payload shape");
