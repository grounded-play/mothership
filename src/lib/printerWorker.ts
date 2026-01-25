import { prisma } from "@/lib/prisma";
import { generateItemArt } from "@/lib/comfy";
import { normalizePublicPath } from "@/lib/imagePath";

const POLL_MS = 5000;
const PROGRESS_STEP = 10;
const STALE_MS = 10 * 60 * 1000;
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

const COMFY_API = "http://127.0.0.1:8188/";
const COMFY_STATUS_TTL_MS = 30000;
const COMFY_TIMEOUT_MS = 5000;
const STALE_RESET_INTERVAL_MS = 60000;
const STALE_GENERATING_MS = 5 * 60 * 1000;
const NO_PRINT_ITEM_NAMES: string[] = ["Scrap Metal", "Nutrient Paste"];

type WorkerState = {
    started: boolean;
    running: boolean;
    timer?: ReturnType<typeof setInterval>;
    currentItemId?: string;
    lastComfyCheck?: number;
    comfyOnline?: boolean;
    lastStaleReset?: number;
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

const checkComfyOnline = async (state: WorkerState) => {
    const now = Date.now();
    if (state.lastComfyCheck && state.comfyOnline !== undefined && now - state.lastComfyCheck < COMFY_STATUS_TTL_MS) {
        return state.comfyOnline;
    }
    state.lastComfyCheck = now;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), COMFY_TIMEOUT_MS);
    try {
        const res = await fetch(COMFY_API, { signal: controller.signal, cache: "no-store" });
        state.comfyOnline = res.ok;
    } catch {
        state.comfyOnline = false;
    } finally {
        clearTimeout(timeout);
    }
    return Boolean(state.comfyOnline);
};

const resetStaleGenerating = async (state: WorkerState) => {
    const now = Date.now();
    if (state.lastStaleReset && now - state.lastStaleReset < STALE_RESET_INTERVAL_MS) return;
    state.lastStaleReset = now;
    const cutoff = new Date(now - STALE_GENERATING_MS);
    const excludeActive = state.currentItemId ? { NOT: { id: state.currentItemId } } : {};

    // Reset Items
    await prisma.inventoryItem.updateMany({
        where: {
            imageStatus: { startsWith: "GENERATING" },
            updatedAt: { lt: cutoff },
            ...excludeActive
        },
        data: { imageStatus: "QUEUED" }
    });

    // Reset Characters (V23)
    await prisma.character.updateMany({
        where: {
            portraitStatus: { startsWith: "GENERATING" },
            updatedAt: { lt: cutoff },
            ...excludeActive
        },
        data: { portraitStatus: "QUEUED" }
    });
};

const normalizeMissingImages = async () => {
    await prisma.inventoryItem.updateMany({
        where: {
            OR: [{ customImage: null }, { customImage: "" }],
            imageStatus: "READY",
            item: { name: { notIn: NO_PRINT_ITEM_NAMES } }
        },
        data: { imageStatus: "QUEUED" }
    });
};

const buildPrompt = (invItem: any) => {
    let statData: any = {};
    try { statData = invItem.instanceStats ? JSON.parse(invItem.instanceStats) : {}; } catch { statData = {}; }
    const traitText = invItem.visualTraits || "";
    const statBits = [statData.damage, statData.type].filter(Boolean).join(" ");
    const itemType = invItem.item?.type ? invItem.item.type.toLowerCase() : "item";
    return `${traitText} ${invItem.item?.name || "Unknown Item"}, ${statBits} ${itemType}, ${invItem.item?.description || ""}`.trim();
};

const lockItem = async (id: string, type: 'item' | 'character') => {
    if (type === 'item') {
        const result = await prisma.inventoryItem.updateMany({
            where: {
                id: id,
                OR: [{ customImage: null }, { customImage: "" }],
                NOT: { imageStatus: { startsWith: "GENERATING" } }
            },
            data: { imageStatus: "GENERATING 0%" }
        });
        return result.count > 0;
    } else {
        const result = await prisma.character.updateMany({
            where: {
                id: id,
                NOT: { portraitStatus: { startsWith: "GENERATING" } }
            },
            data: { portraitStatus: "GENERATING 0%" }
        });
        return result.count > 0;
    }
};

const normalizeQueue = async () => {
    const staleBefore = new Date(Date.now() - STALE_MS);

    // Items
    await prisma.inventoryItem.updateMany({
        where: { customImage: null, imageStatus: { startsWith: "GENERATING" }, updatedAt: { lt: staleBefore } },
        data: { imageStatus: "FAILED" }
    });
    await prisma.inventoryItem.updateMany({
        where: { customImage: null, OR: [{ imageStatus: "READY" }, { imageStatus: "" }] },
        data: { imageStatus: "QUEUED" }
    });

    // Characters (V23)
    await prisma.character.updateMany({
        where: { portrait: null, portraitStatus: { startsWith: "GENERATING" }, updatedAt: { lt: staleBefore } },
        data: { portraitStatus: "FAILED" }
    });
};

const runGeneration = async (state: WorkerState, id: string, type: 'item' | 'character', prompt: string) => {
    let lastProgress = 0;
    try {
        state.currentItemId = id;
        const iconPath = await Promise.race([
            generateItemArt(prompt, id, type, async (p) => {
                const percentage = Math.round((p.value / p.max) * 100);
                if (percentage - lastProgress >= PROGRESS_STEP || percentage === 100) {
                    lastProgress = percentage;
                    const status = `GENERATING ${percentage}%`;
                    if (type === 'item') {
                        await prisma.inventoryItem.update({ where: { id }, data: { imageStatus: status } });
                    } else {
                        await prisma.character.update({ where: { id }, data: { portraitStatus: status } });
                    }
                }
            }),
            new Promise<string | null>((_, reject) => {
                setTimeout(() => reject(new Error("Generation timeout")), GENERATION_TIMEOUT_MS);
            })
        ]);

        if (iconPath) {
            const normalizedPath = normalizePublicPath(iconPath) || iconPath;
            if (type === 'item') {
                await prisma.inventoryItem.update({
                    where: { id },
                    data: { customImage: normalizedPath, imageStatus: "READY", updatedAt: new Date() }
                });
            } else {
                await prisma.character.update({
                    where: { id },
                    data: { portrait: normalizedPath, portraitStatus: "READY", updatedAt: new Date() }
                });
            }
        } else {
            const status = "FAILED";
            if (type === 'item') await prisma.inventoryItem.update({ where: { id }, data: { imageStatus: status } });
            else await prisma.character.update({ where: { id }, data: { portraitStatus: status } });
        }
    } catch (e: any) {
        console.error("Printer worker failed:", e);
        const isTransient = e.message?.includes("Generation timeout") || e.message?.includes("WebSocket closed");
        const status = isTransient ? "QUEUED" : "ERROR";

        if (type === 'item') await prisma.inventoryItem.update({ where: { id }, data: { imageStatus: status } });
        else await prisma.character.update({ where: { id }, data: { portraitStatus: status } });
    } finally {
        if (state.currentItemId === id) {
            state.currentItemId = undefined;
        }
    }
};

const processNextItem = async (state: WorkerState) => {
    await normalizeQueue();

    // 1. Check Characters First (Priority?)
    const nextChar = await prisma.character.findFirst({
        where: {
            OR: [
                { portraitStatus: "QUEUED" },
                { portraitStatus: "FAILED" },
                // Don't retry ERROR automatically to prevent loop
            ]
        },
        orderBy: { updatedAt: "asc" }
    });

    if (nextChar) {
        const locked = await lockItem(nextChar.id, 'character');
        if (locked) {
            await runGeneration(state, nextChar.id, 'character', nextChar.name + " " + nextChar.class);
            return;
        }
    }

    // 2. Check Items
    const nextItem = await prisma.inventoryItem.findFirst({
        where: {
            customImage: null,
            instanceStats: { not: null },
            NOT: [{ instanceStats: "{}" }, { instanceStats: "" }],
            OR: [
                { imageStatus: "QUEUED" },
                { imageStatus: "FAILED" }
            ]
        },
        include: { item: true },
        orderBy: { createdAt: "asc" }
    });

    if (nextItem) {
        const locked = await lockItem(nextItem.id, 'item');
        if (locked) {
            const prompt = buildPrompt(nextItem);
            await runGeneration(state, nextItem.id, 'item', prompt);
            return;
        }
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
            await normalizeMissingImages();
            await resetStaleGenerating(state);
            const online = await checkComfyOnline(state);
            if (!online) return;
            await processNextItem(state);
        } finally {
            state.running = false;
        }
    }, POLL_MS);
};
