const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/compliance-queue.tsx', 'utf8');

// There are multiple query usages we need to clean out. Let's just do a string replacement of everything between `cursor: "0",` and `sortBy,`.

const fixQueryRegex = /search: search \|\| undefined,[\s\S]*?sortBy,/g;
content = content.replace(fixQueryRegex, `search: search || undefined,
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
    sortBy,`);


// Now fix hasActiveFilters
const fixActiveFiltersRegex = /const hasActiveFilters = \[[\s\S]*?\]\.some\(Boolean\);/g;
content = content.replace(fixActiveFiltersRegex, `const hasActiveFilters = [
    search,
    triageFilter,
    triageUrgencyFilter,
  ].some(Boolean);`);

// the clearFilters click handler
const clearFiltersRegex = /function clearFilters\(\) \{[\s\S]*?\}/;
content = content.replace(clearFiltersRegex, `function clearFilters() {
    setSearch("");
    setTriageFilter("");
    setTriageUrgencyFilter("");
  }`);
  
fs.writeFileSync('src/components/dashboard/compliance-queue.tsx', content);
console.log("Fixed everything.");
