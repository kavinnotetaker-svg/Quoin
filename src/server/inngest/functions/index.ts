import { dataIngestionJob, syncEspmMetricsJob } from "./data-ingestion";
import { driftDetectionJob } from "./drift-detection";
import { pathwayAnalysisJob, pathwayAnalysisSweepJob } from "./pathway-analysis";
import { stripeWebhookJob } from "./stripe-handler";
import { capitalStructuringJob } from "./capital-structuring";
import { greenButtonSyncJob } from "./green-button-sync";

export const inngestFunctions = [
  dataIngestionJob,
  syncEspmMetricsJob,
  greenButtonSyncJob,
  driftDetectionJob,
  pathwayAnalysisSweepJob,
  pathwayAnalysisJob,
  capitalStructuringJob,
  stripeWebhookJob,
];
