const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/compliance-queue.tsx', 'utf8');

// We need to pull out the unused filter states.
// For example:
// const [readinessFilter, setReadinessFilter] = useState("");
// const [submissionStateFilter, setSubmissionStateFilter] = useState("");
// const [artifactFilter, setArtifactFilter] = useState("");
// const [nextActionFilter, setNextActionFilter] = useState("");
// const [blockingOnly, setBlockingOnly] = useState(false);
// const [penaltyOnly, setPenaltyOnly] = useState(false);
// const [syncAttentionOnly, setSyncAttentionOnly] = useState(false);
// const [anomalyAttentionOnly, setAnomalyAttentionOnly] = useState(false);
// const [retrofitOnly, setRetrofitOnly] = useState(false);
// const [systemMutedOnly, setSystemMutedOnly] = useState(false);

const linesToRemoveForState = [
  "const [readinessFilter, setReadinessFilter] = useState(\"\");",
  "const [submissionStateFilter, setSubmissionStateFilter] = useState(\"\");",
  "const [artifactFilter, setArtifactFilter] = useState(\"\");",
  "const [nextActionFilter, setNextActionFilter] = useState(\"\");",
  "const [blockingOnly, setBlockingOnly] = useState(false);",
  "const [penaltyOnly, setPenaltyOnly] = useState(false);",
  "const [syncAttentionOnly, setSyncAttentionOnly] = useState(false);",
  "const [anomalyAttentionOnly, setAnomalyAttentionOnly] = useState(false);",
  "const [retrofitOnly, setRetrofitOnly] = useState(false);",
  "const [systemMutedOnly, setSystemMutedOnly] = useState(false);",
];

linesToRemoveForState.forEach(line => {
  content = content.replace(line + "\n", "");
});

// Also in clearFilters:
// setReadinessFilter("");
// setSubmissionStateFilter("");
// setArtifactFilter("");
// setNextActionFilter("");
// setBlockingOnly(false);
// setPenaltyOnly(false);
// setSyncAttentionOnly(false);
// setAnomalyAttentionOnly(false);
// setRetrofitOnly(false);
// setSystemMutedOnly(false);

const linesToRemoveInClearFilters = [
  "    setReadinessFilter(\"\");",
  "    setSubmissionStateFilter(\"\");",
  "    setArtifactFilter(\"\");",
  "    setNextActionFilter(\"\");",
  "    setBlockingOnly(false);",
  "    setPenaltyOnly(false);",
  "    setSyncAttentionOnly(false);",
  "    setAnomalyAttentionOnly(false);",
  "    setRetrofitOnly(false);",
  "    setSystemMutedOnly(false);",
];

linesToRemoveInClearFilters.forEach(line => {
  content = content.replace(line + "\n", "");
});

fs.writeFileSync('src/components/dashboard/compliance-queue.tsx', content);
console.log("Success cleaning unused states!");
