import { ESPMClient } from "./client";
import type { ESPMClientConfig } from "./client";
import { PropertyService } from "./property";
import { MeterService } from "./meter";
import { MetricsService } from "./metrics";
import { ConsumptionService } from "./consumption";
import { getEspmClientConfig } from "@/server/lib/config";

export class ESPM {
  public readonly property: PropertyService;
  public readonly meter: MeterService;
  public readonly metrics: MetricsService;
  public readonly consumption: ConsumptionService;

  constructor(config: ESPMClientConfig) {
    const client = new ESPMClient(config);
    this.property = new PropertyService(client);
    this.meter = new MeterService(client);
    this.metrics = new MetricsService(client);
    this.consumption = new ConsumptionService(client);
  }
}

/** Factory for creating ESPM client from env vars */
export function createESPMClient(): ESPM {
  return new ESPM(getEspmClientConfig());
}

export { ESPMClient } from "./client";
export type { ESPMClientConfig } from "./client";
export * from "./types";
export * from "./errors";
