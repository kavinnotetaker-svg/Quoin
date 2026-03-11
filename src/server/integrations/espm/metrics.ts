import { ESPMClient } from "./client";
import type {
  ESPMPropertyMetrics,
  PropertyMetrics,
  ESPMMetric,
  ESPMReasonsForNoScore,
} from "./types";

export class MetricsService {
  constructor(private readonly client: ESPMClient) { }

  /**
   * Get property metrics (score, EUI, etc.).
   * Primary call for BEPS compliance tracking.
   * Score requires 12 full calendar months of energy data.
   */
  async getPropertyMetrics(
    propertyId: number,
    year: number,
    month: number,
  ): Promise<PropertyMetrics> {
    const metricsHeader = [
      "score",
      "siteTotal",
      "sourceTotal",
      "siteIntensity",
      "sourceIntensity",
      "directGHGEmissions",
      "medianScore",
    ].join(", ");

    const raw = await this.client.get<ESPMPropertyMetrics>(
      `/property/${propertyId}/metrics?year=${year}&month=${month}&measurementSystem=EPA`,
      { "PM-Metrics": metricsHeader },
    );

    return this.parseMetrics(raw);
  }

  /**
   * Get reasons why a property has no ENERGY STAR score.
   * Common: insufficient data, property type not eligible, etc.
   */
  async getReasonsForNoScore(propertyId: number): Promise<string[]> {
    const raw = await this.client.get<ESPMReasonsForNoScore>(
      `/property/${propertyId}/reasonsForNoScore`,
    );
    return raw?.reasons?.reason ?? [];
  }

  private parseMetrics(raw: ESPMPropertyMetrics): PropertyMetrics {
    const pm = raw.propertyMetrics;
    const metrics = pm.metric ?? [];

    const getNumericValue = (name: string): number | null => {
      const metric = metrics.find((m: ESPMMetric) => m["@_name"] === name);
      if (!metric) return null;
      const val = metric.value;
      if (val === null || val === undefined || val === "") return null;
      if (typeof val === "object") return null;
      const num = Number(val);
      return isNaN(num) ? null : num;
    };

    return {
      propertyId: pm["@_propertyId"],
      year: pm["@_year"],
      month: pm["@_month"],
      score: getNumericValue("score"),
      siteTotal: getNumericValue("siteTotal"),
      sourceTotal: getNumericValue("sourceTotal"),
      siteIntensity: getNumericValue("siteIntensity"),
      sourceIntensity: getNumericValue("sourceIntensity"),
      weatherNormalizedSiteIntensity: getNumericValue("weatherNormalizedSiteIntensity"),
      weatherNormalizedSourceIntensity: getNumericValue(
        "weatherNormalizedSourceIntensity",
      ),
      directGHGEmissions: getNumericValue("directGHGEmissions"),
      medianScore: getNumericValue("medianScore"),
    };
  }
}
