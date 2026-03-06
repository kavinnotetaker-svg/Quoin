import { router } from "../init";
import { buildingRouter } from "./building";
import { reportRouter } from "./report";
import { capitalRouter } from "./capital";
import { driftRouter } from "./drift";

export const appRouter = router({
  building: buildingRouter,
  report: reportRouter,
  capital: capitalRouter,
  drift: driftRouter,
});

export type AppRouter = typeof appRouter;
