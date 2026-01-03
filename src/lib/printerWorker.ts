import { prisma } from "@/lib/prisma";
import { generateItemArt } from "@/lib/comfy";

const POLL_MS = 5000;
const PROGRESS_STEP = 10;

type WorkerState = {
    started: boolean;
    running: boolean;
    timer?: ReturnType<typeof setInterval>;
};

const globalState = globalThis as typeof globalThis & {
    __printerWorkerState?: WorkerState;
};

const ensureState = () => {
    if (!globalState.__printerWorkerState) {
        globalState.__printerWorkerState = { started: false, running: false };
    }
    return globalState.__printerWorkerState;
};

const buildPrompt = (invItem: any) => {
    let statData: any = {};
    try { statData = invItem.instanceStats ? JSON.parse(invItem.instanceStats) : {}; } catch { statData = {}; }
    const traitText = invItem.visualTraits || "";
    const statBits = [statData.damage, statData.type].filter(Boolean).join(" ");
    const itemType = invItem.item?.type ? invItem.item.type.toLowerCase() : "item";
    return `${traitText} ${invItem.item?.name || "Unknown Item"}, ${statBits} ${itemType}, ${invItem.item?.description || ""}`.trim();
};

const lockItem = async (invItemId: string) => {
    const result = await prisma.inventoryItem.updateMany({
        where: {
            id: invItemId,
            customImage: null,
            NOT: { imageStatus: { startsWith: "GENERATING" } }
        },
        data: { imageStatus: "GENERATING 0%" }
    });
    return result.count > 0;
};

const processNextItem = async () => {
    const next = await prisma.inventoryItem.findFirst({
        where: {
            customImage: null,
            instanceStats: { not: null },
            OR: [
                { imageStatus: "QUEUED" },
                { imageStatus: "FAILED" },
                { imageStatus: "ERROR" },
                { imageStatus: "READY" }
            ]
        },
        include: { item: true },
        orderBy: { createdAt: "asc" }
    });

    if (!next) return;

    const locked = await lockItem(next.id);
    if (!locked) return;

    let lastProgress = 0;
    try {
        const prompt = buildPrompt(next);
        const iconPath = await generateItemArt(prompt, next.id, "item", async (p) => {
            const percentage = Math.round((p.value / p.max) * 100);
            if (percentage - lastProgress >= PROGRESS_STEP || percentage === 100) {
                lastProgress = percentage;
                await prisma.inventoryItem.update({
                    where: { id: next.id },
                    data: { imageStatus: `GENERATING ${percentage}%` }
                });
            }
        });

        if (iconPath) {
            await prisma.inventoryItem.update({
                where: { id: next.id },
                data: { customImage: iconPath, imageStatus: "READY" }
            });
        } else {
            await prisma.inventoryItem.update({
                where: { id: next.id },
                data: { imageStatus: "FAILED" }
            });
        }
    } catch (e) {
        console.error("Printer worker failed:", e);
        await prisma.inventoryItem.update({
            where: { id: next.id },
            data: { imageStatus: "ERROR" }
        });
    }
};

export const ensurePrinterWorker = () => {
    if (typeof window !== "undefined") return;
    const state = ensureState();
    if (state.started) return;
    state.started = true;
    state.timer = setInterval(async () => {
        if (state.running) return;
        state.running = true;
        try {
            await processNextItem();
        } finally {
            state.running = false;
        }
    }, POLL_MS);
};
