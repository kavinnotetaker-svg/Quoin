import { ESPMClient } from "./client";
import type { ESPMProperty } from "./types";

export class PropertyService {
  constructor(private readonly client: ESPMClient) {}

  /** Get property details by ID */
  async getProperty(propertyId: number): Promise<ESPMProperty> {
    return this.client.get<ESPMProperty>(`/property/${propertyId}`);
  }

  /** List properties for a connected customer */
  async listProperties(customerId: number): Promise<unknown> {
    return this.client.get(`/account/${customerId}/property/list`);
  }

  /** Search properties (for linking flow) */
  async searchProperties(params: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  }): Promise<unknown> {
    const query = new URLSearchParams();
    if (params.name) query.set("name", params.name);
    if (params.address) query.set("address", params.address);
    if (params.city) query.set("city", params.city);
    if (params.state) query.set("state", params.state || "DC");
    if (params.postalCode) query.set("postalCode", params.postalCode);
    return this.client.get(`/property/search?${query.toString()}`);
  }
}
