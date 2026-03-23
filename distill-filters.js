const fs = require('fs');

function distillFilters() {
  let content = fs.readFileSync('src/components/dashboard/compliance-queue.tsx', 'utf8');

  // 1. Remove Constants
  const constantsToRemove = [
    "READINESS_FILTERS",
    "ARTIFACT_FILTERS",
    "NEXT_ACTION_FILTERS",
    "SUBMISSION_STATE_FILTERS"
  ];
  
  constantsToRemove.forEach(constName => {
    const regex = new RegExp(`const ${constName} = \\[[\\s\\S]*?\\] as const;\\n*`, 'g');
    content = content.replace(regex, '');
  });

  // 2. Remove Unused UseStates
  const statesToRemove = [
    "readinessFilter",
    "submissionStateFilter",
    "artifactFilter",
    "nextActionFilter",
    "blockingOnly",
    "penaltyOnly",
    "syncAttentionOnly",
    "anomalyAttentionOnly",
    "retrofitOnly",
    "systemMutedOnly"
  ];

  statesToRemove.forEach(stateName => {
    const regex = new RegExp(`\\s*const \\[${stateName}, set[A-Za-z]+\\] = useState\\(.*\\);\\n`, 'g');
    content = content.replace(regex, '');
  });

  // 3. Fix Clear Filters function
  const clearFiltersRegex = /function clearFilters\(\) \{[\s\S]*?\}/;
  content = content.replace(clearFiltersRegex, `function clearFilters() {
    setSearch("");
    setTriageFilter("");
    setTriageUrgencyFilter("");
  }`);

  // 4. Simplify \`hasActiveFilters\`
  const hasActiveFiltersRegex = /const hasActiveFilters = \[[\s\S]*?\]\.some\(Boolean\);/;
  content = content.replace(hasActiveFiltersRegex, `const hasActiveFilters = [
    search,
    triageFilter,
    triageUrgencyFilter,
  ].some(Boolean);`);

  // 5. Fix trpc.building.portfolioWorklist.useQuery payload
  const queryPayloadRegex = /search: search \|\| undefined,[\s\S]*?sortBy,/g;
  content = content.replace(queryPayloadRegex, `search: search || undefined,
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


  // 6. Replace the gigantic JSX UI block
  const jsxStartStr = '<div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">';
  const jsxEndStr = '{canManageOperatorActions && selectedBuildingIds.length > 0 ? (';
  
  const startIndex = content.indexOf(jsxStartStr);
  const endIndex = content.indexOf(jsxEndStr, startIndex);
  
  if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find JSX boundaries");
    return;
  }

  const distilledJSX = `      <div className="flex flex-wrap items-center justify-between gap-4 mt-8 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: "All Portfolio", value: "" },
            { label: "Needs attention", value: "NOW", kind: "urgency" },
            { label: "Compliance blockers", value: "COMPLIANCE_BLOCKER" },
          ].map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => {
                if ("kind" in preset) {
                  setTriageUrgencyFilter((current) =>
                    current === preset.value ? "" : preset.value,
                  );
                  return;
                }
                setTriageFilter((current) => (current === preset.value ? "" : preset.value));
              }}
              className={\`rounded-none border border-zinc-200 px-4 py-2 text-[11px] font-mono tracking-widest uppercase transition-colors \${
                (("kind" in preset && triageUrgencyFilter === preset.value) ||
                  (!("kind" in preset) && triageFilter === preset.value))
                  ? "bg-zinc-900 border-zinc-900 text-white"
                  : "bg-transparent text-zinc-500 hover:text-zinc-900 hover:border-zinc-300"
              }\`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter building name or ID"
            className="w-72 rounded-none border border-zinc-200 bg-transparent px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-0 transition-colors"
          />
        </div>
      </div>\n\n      `;
      
  const head = content.substring(0, startIndex);
  const tail = content.substring(endIndex);
  
  content = head + distilledJSX + tail;

  fs.writeFileSync('src/components/dashboard/compliance-queue.tsx', content);
  console.log("Successfully distilled rules!");
}

distillFilters();
