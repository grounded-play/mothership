import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateItemArt } from "@/lib/comfy";
import { ensurePrinterWorker } from "@/lib/printerWorker";
import { normalizePublicPath } from "@/lib/imagePath";

export const runtime = "nodejs";

ensurePrinterWorker();

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { itemId, inventoryItemId, stats, traits } = await req.json();

    let targetId = itemId;
    let isInstance = false;
    let prompt = "";

    if (inventoryItemId) {
        // Unique Instance Generation
        const invItem = await prisma.inventoryItem.findUnique({
            where: { id: inventoryItemId },
            include: { item: true }
        });

        if (!invItem) return NextResponse.json({ error: "Item not found" }, { status: 404 });
        const hasCustomImage = Boolean(invItem.customImage && invItem.customImage.trim() !== "");
        if (hasCustomImage) {
            return NextResponse.json({ success: true, icon: invItem.customImage });
        }
        if (invItem.imageStatus?.startsWith("GENERATING")) {
            return NextResponse.json({ success: true, status: invItem.imageStatus });
        }

        targetId = invItem.id;
        isInstance = true;

        // Construct detailed prompt from Traits + Stats + Base Name
        const statData = invItem.instanceStats ? JSON.parse(invItem.instanceStats) : {};
        const traitText = invItem.visualTraits || traits || "";

        prompt = `${invItem.visualTraits || ""} ${invItem.item.name}, ${statData.damage || ""} ${statData.type || ""} weapon, ${invItem.item.description}`;
    } else {
        // Legacy/Template Generation
        const item = await prisma.item.findUnique({ where: { id: itemId } });
        if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
        prompt = `${item.name}, ${item.rarity} ${item.type}, ${item.description}`;
    }

    // Encoder for streaming text
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const safeEnqueue = (data: string) => {
                try {
                    controller.enqueue(encoder.encode(data));
                } catch (e) {
                    // Ignore error if stream is already closed (Client disconnected)
                }
            };

            try {
                // 1. Lock Status to prevent double-processing
                if (isInstance) {
                    const locked = await prisma.inventoryItem.updateMany({
                        where: {
                            id: targetId,
                            OR: [{ customImage: null }, { customImage: "" }],
                            NOT: { imageStatus: { startsWith: "GENERATING" } }
                        },
                        data: { imageStatus: "GENERATING 0%" }
                    });
                    if (locked.count === 0) {
                        safeEnqueue(`data: ${JSON.stringify({ success: true, status: "ALREADY_RUNNING" })}\n\n`);
                        controller.close();
                        return;
                    }
                }

                let lastProgress = 0;

                // Pass 'item' type (could be generic, we use same workflow for both)
                // Use targetId (Inventory ID or Item ID) for filename to ensure uniqueness
                const iconPath = await generateItemArt(prompt, targetId, 'item', async (p) => {
                    const percentage = Math.round((p.value / p.max) * 100);

                    // Stream to client (Visual Feedback for requester)
                    safeEnqueue(`data: ${JSON.stringify({ progress: percentage })}\n\n`);

                    // 2. Update DB with Progress (Throttled: every 10% or if complete)
                    if (isInstance && (percentage - lastProgress >= 10 || percentage === 100)) {
                        lastProgress = percentage;
                        // Fire and forget DB update to avoid blocking stream heavily? 
                        // Better to await to ensure consistency, but keep it fast.
                        try {
                            await prisma.inventoryItem.update({
                                where: { id: targetId },
                                data: { imageStatus: `GENERATING ${percentage}%` }
                            });
                        } catch (err) {
                            console.error("Failed to update progress db", err);
                        }
                    }
                });

                if (iconPath) {
                    const normalizedIconPath = normalizePublicPath(iconPath) || iconPath;
                    if (isInstance) {
                        await prisma.inventoryItem.update({
                            where: { id: targetId },
                            data: { customImage: normalizedIconPath, imageStatus: "READY" }
                        });
                    } else {
                        await prisma.item.update({
                            where: { id: itemId },
                            data: { icon: normalizedIconPath }
                        });
                    }
                    safeEnqueue(`data: ${JSON.stringify({ success: true, icon: normalizedIconPath })}\n\n`);
                } else {
                    if (isInstance) {
                        await prisma.inventoryItem.update({ where: { id: targetId }, data: { imageStatus: "FAILED" } });
                    }
                    safeEnqueue(`data: ${JSON.stringify({ error: "Generation failed" })}\n\n`);
                }
            } catch (e: any) {
                console.error(e);
                if (isInstance) {
                    await prisma.inventoryItem.update({ where: { id: targetId }, data: { imageStatus: "ERROR" } });
                }
                safeEnqueue(`data: ${JSON.stringify({ error: e.message || "Unknown error" })}\n\n`);
            } finally {
                try {
                    controller.close();
                } catch (e) {
                    // Already closed
                }
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
