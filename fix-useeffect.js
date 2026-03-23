const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/compliance-queue.tsx', 'utf8');

/*
  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
  }, [
    search,
    triageUrgencyFilter,
    triageFilter,
    readinessFilter,
    submissionStateFilter,
    artifactFilter,
    nextActionFilter,
    sortBy,
    blockingOnly,
    penaltyOnly,
    syncAttentionOnly,
    anomalyAttentionOnly,
    retrofitOnly,
  ]);
*/

const effectRegex = /useEffect\(\(\) => \{\n    setCursor\(undefined\);\n    setCursorHistory\(\[\]\);\n  \}, \[[\s\S]*?\]\);/;

const newEffect = `useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
  }, [
    search,
    triageUrgencyFilter,
    triageFilter,
    sortBy,
  ]);`;

content = content.replace(effectRegex, newEffect);
fs.writeFileSync('src/components/dashboard/compliance-queue.tsx', content);

console.log("Success replacing useEffect!");

