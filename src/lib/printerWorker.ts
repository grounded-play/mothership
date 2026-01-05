import { prisma } from "@/lib/prisma";
import { generateItemArt } from "@/lib/comfy";

const POLL_MS = 5000;
const PROGRESS_STEP = 10;
const STALE_MS = 10 * 60 * 1000;
const GENERATION_TIMEOUT_MS = 2 * 60 * 1000;

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

const normalizeQueue = async () => {
    const staleBefore = new Date(Date.now() - STALE_MS);
    await prisma.inventoryItem.updateMany({
        where: {
            customImage: null,
            imageStatus: { startsWith: "GENERATING" },
            updatedAt: { lt: staleBefore }
        },
        data: { imageStatus: "FAILED" }
    });
    await prisma.inventoryItem.updateMany({
        where: {
            customImage: null,
            OR: [
                { imageStatus: "READY" },
                { imageStatus: "" }
            ]
        },
        data: { imageStatus: "QUEUED" }
    });
};

const processNextItem = async () => {
    await normalizeQueue();

    const next = await prisma.inventoryItem.findFirst({
        where: {
            customImage: null,
            instanceStats: { not: null },
            NOT: [{ instanceStats: "{}" }, { instanceStats: "" }],
            OR: [
                { imageStatus: "QUEUED" },
                { imageStatus: "FAILED" },
                { imageStatus: "ERROR" }
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
        const iconPath = await Promise.race([
            generateItemArt(prompt, next.id, "item", async (p) => {
                const percentage = Math.round((p.value / p.max) * 100);
                if (percentage - lastProgress >= PROGRESS_STEP || percentage === 100) {
                    lastProgress = percentage;
                    await prisma.inventoryItem.update({
                        where: { id: next.id },
                        data: { imageStatus: `GENERATING ${percentage}%` }
                    });
                }
            }),
            new Promise<null>((_, reject) => {
                setTimeout(() => reject(new Error("Generation timeout")), GENERATION_TIMEOUT_MS);
            })
        ]);

        if (iconPath) {
            await prisma.inventoryItem.update({
                where: { id: next.id },
                data: { customImage: iconPath, imageStatus: "READY", updatedAt: new Date() }
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
