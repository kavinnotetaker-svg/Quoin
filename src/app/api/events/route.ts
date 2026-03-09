import { NextRequest } from "next/server";
import { prisma } from "@/server/lib/db";

// Force edge/nodejs runtime for streaming, nodejs is fine for SSE
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events (SSE) Endpoint
 * Replaces client-side tRPC polling.
 * Streams active PipelineRun statuses to the connected client.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
        return new Response("Missing organizationId", { status: 400 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            // Send initial connection established event
            controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: "connected" })}\n\n`));

            let isDisconnected = false;

            req.signal.addEventListener("abort", () => {
                isDisconnected = true;
            });

            // Simple implementation: poll DB server-side and push to client.
            // In a production environment without Redis, Postgres LISTEN/NOTIFY could be used,
            // but this isolates polling to the server, solving the UI polling issue.
            while (!isDisconnected) {
                try {
                    // Find any running or queued pipeline runs for this tenant
                    const activeRuns = await prisma.pipelineRun.findMany({
                        where: {
                            organizationId,
                            status: { in: ["RUNNING", "QUEUED"] }
                        },
                        select: {
                            id: true,
                            pipelineType: true,
              status: true
            }
                    });

                    if (activeRuns.length > 0) {
                        controller.enqueue(encoder.encode(`event: pipeline-update\ndata: ${JSON.stringify(activeRuns)}\n\n`));
                    } else {
                        // Send heartbeat to keep connection alive
                        controller.enqueue(encoder.encode(`event: ping\ndata: heartbeat\n\n`));
                    }

                } catch (err) {
                    console.error("SSE Poll error", err);
                }

                // Wait 3 seconds between polls server-side
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        },
    });
}
