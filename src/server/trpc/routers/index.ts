import { router } from "../init";
import { buildingRouter } from "./building";
import { reportRouter } from "./report";
import { driftRouter } from "./drift";
import { provenanceRouter } from "./provenance";
import { benchmarkingRouter } from "./benchmarking";
import { bepsRouter } from "./beps";
import { operationsRouter } from "./operations";
import { retrofitRouter } from "./retrofit";

export const appRouter = router({
  building: buildingRouter,
  report: reportRouter,
  drift: driftRouter,
  provenance: provenanceRouter,
  benchmarking: benchmarkingRouter,
  beps: bepsRouter,
  operations: operationsRouter,
  retrofit: retrofitRouter,
});

export type AppRouter = typeof appRouter;
