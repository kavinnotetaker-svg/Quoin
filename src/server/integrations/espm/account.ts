import { ESPMClient } from "./client";
import { espmBuilder } from "./xml-config";
import type { DataExchangeSettings } from "./types";

export class AccountService {
    constructor(private client: ESPMClient) { }

    async updateDataExchangeSettings(
        settings: DataExchangeSettings,
    ): Promise<{ status: string; links?: unknown }> {
        const xml = espmBuilder.build({
            dataExchangeSettings: {
                termsOfUse: {
                    text: settings.termsOfUse,
                },
                supportedMeterTypes: {
                    meterType: settings.supportedMeterTypes,
                },
            },
        });

        const response = await this.client.put<{
            response: {
                "@_status": string;
                links?: {
                    link: {
                        "@_httpMethod": string;
                        "@_link": string;
                        "@_linkDescription": string;
                    };
                };
            };
        }>(`/dataExchangeSettings`, xml);

        return {
            status: response.response["@_status"],
            links: response.response.links,
        };
    }
}
