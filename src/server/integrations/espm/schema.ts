import { z } from "zod";

// Validates the structure of a single metric returned by ESPM
export const ESPMMetricSchema = z.object({
    "@_name": z.string(),
    "@_uom": z.string().optional(),
    "@_year": z.number().optional().or(z.string()),
    "@_month": z.number().optional().or(z.string()),
    value: z.union([z.number(), z.string(), z.null(), z.object({})]).optional(),
});

// Validates the entire metrics response wrapper from ESPM
export const ESPMPropertyMetricsSchema = z.object({
    propertyMetrics: z.object({
        "@_propertyId": z.number(),
        "@_year": z.number(),
        "@_month": z.number(),
        metric: z.array(ESPMMetricSchema).optional(),
    }),
});

export type ValidatedESPMPropertyMetrics = z.infer<
    typeof ESPMPropertyMetricsSchema
>;
