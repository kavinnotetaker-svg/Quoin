import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { inngest } from "@/server/inngest/client";
import { greenButtonSyncEvent } from "@/server/inngest/events";
import { prisma } from "@/server/lib/db";
import { extractSubscriptionId } from "@/server/integrations/green-button";

const webhookParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

function extractNotificationUri(parsed: Record<string, unknown>): string | null {
  const batchList = parsed["BatchList"] as Record<string, unknown> | undefined;
  if (batchList) {
    const resources = batchList["resources"] as string | undefined;
    if (resources) {
      return resources;
    }
  }

  const feed = parsed["feed"] as Record<string, unknown> | undefined;
  if (!feed) {
    return null;
  }

  const entries = feed["entry"];
  const entryArray = Array.isArray(entries) ? entries : entries ? [entries] : [];
  for (const entry of entryArray as Record<string, unknown>[]) {
    const link = entry["link"] as Record<string, unknown> | undefined;
    if (typeof link?.["@_href"] === "string") {
      return link["@_href"] as string;
    }

    const content = entry["content"] as Record<string, unknown> | undefined;
    if (typeof content?.["BatchList"] === "string") {
      return content["BatchList"];
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    if (!body.trim()) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    const parsed = webhookParser.parse(body) as Record<string, unknown>;
    const notificationUri = extractNotificationUri(parsed);

    if (!notificationUri) {
      console.warn("[Green Button Webhook] Notification URI missing");
      return NextResponse.json({ received: true });
    }

    let subscriptionId = "";
    try {
      subscriptionId = extractSubscriptionId(notificationUri);
    } catch {
      subscriptionId = "";
    }

    if (!subscriptionId) {
      console.warn("[Green Button Webhook] Subscription ID missing from notification URI");
      return NextResponse.json({ received: true });
    }

    const connection = await prisma.greenButtonConnection.findUnique({
      where: { subscriptionId },
      select: {
        id: true,
        buildingId: true,
        organizationId: true,
      },
    });

    if (!connection) {
      console.warn(
        `[Green Button Webhook] No connection found for subscription ${subscriptionId}`,
      );
      return NextResponse.json({ received: true });
    }

    await inngest.send(
      greenButtonSyncEvent({
        buildingId: connection.buildingId,
        organizationId: connection.organizationId,
        connectionId: connection.id,
        notificationUri,
        triggerType: "WEBHOOK",
      }),
    );

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[Green Button Webhook] Error processing notification:", err);
    return NextResponse.json({ received: true });
  }
}
