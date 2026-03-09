import { ESPMClient } from "./client";
import type { ESPMClientConfig } from "./client";
import { PropertyService } from "./property";
import { MeterService } from "./meter";
import { MetricsService } from "./metrics";
import { ConsumptionService } from "./consumption";
import { AccountService } from "./account";

export class ESPM {
  public readonly account: AccountService;
  public readonly property: PropertyService;
  public readonly meter: MeterService;
  public readonly metrics: MetricsService;
  public readonly consumption: ConsumptionService;

  constructor(config: ESPMClientConfig) {
    const client = new ESPMClient(config);
    this.account = new AccountService(client);
    this.property = new PropertyService(client);
    this.meter = new MeterService(client);
    this.metrics = new MetricsService(client);
    this.consumption = new ConsumptionService(client);
  }
}

/** Factory for creating ESPM client from env vars */
export function createESPMClient(): ESPM {
  const baseUrl =
    process.env["ESPM_BASE_URL"] ||
    "https://portfoliomanager.energystar.gov/ws";
  const username = process.env["ESPM_USERNAME"];
  const password = process.env["ESPM_PASSWORD"];

  if (!username || !password) {
    throw new Error("ESPM_USERNAME and ESPM_PASSWORD must be set");
  }

  return new ESPM({ baseUrl, username, password });
}

export { ESPMClient } from "./client";
export type { ESPMClientConfig } from "./client";
export * from "./types";
export * from "./errors";
