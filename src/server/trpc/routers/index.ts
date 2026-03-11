import { router } from "../init";
import { buildingRouter } from "./building";
import { reportRouter } from "./report";
import { capitalRouter } from "./capital";
import { driftRouter } from "./drift";
import { provenanceRouter } from "./provenance";
import { benchmarkingRouter } from "./benchmarking";
import { bepsRouter } from "./beps";
import { portfolioRiskRouter } from "./portfolio-risk";
import { operationsRouter } from "./operations";
import { retrofitRouter } from "./retrofit";
import { financingRouter } from "./financing";

export const appRouter = router({
  building: buildingRouter,
  report: reportRouter,
  capital: capitalRouter,
  drift: driftRouter,
  provenance: provenanceRouter,
  benchmarking: benchmarkingRouter,
  beps: bepsRouter,
  portfolioRisk: portfolioRiskRouter,
  operations: operationsRouter,
  retrofit: retrofitRouter,
  financing: financingRouter,
});

export type AppRouter = typeof appRouter;
