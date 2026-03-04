import { router } from "../init";
import { buildingRouter } from "./building";

export const appRouter = router({
  building: buildingRouter,
});

export type AppRouter = typeof appRouter;
