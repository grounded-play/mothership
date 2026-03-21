import { prisma } from "@/lib/prisma";
import { generateItemArt } from "@/lib/comfy";
import { normalizePublicPath } from "@/lib/imagePath";
import { appendFileSync, writeFileSync } from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "printer-worker.log");
const workerLog = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try { appendFileSync(LOG_FILE, line); } catch {}
    console.log(msg);
};

const POLL_MS = 5000;
const PROGRESS_STEP = 10;
const STALE_MS = 10 * 60 * 1000;
const GENERATION_TIMEOUT_MS = 15 * 60 * 1000;

const COMFY_API = "http://127.0.0.1:8188/";
const COMFY_STATUS_TTL_MS = 30000;
const COMFY_TIMEOUT_MS = 5000;
const STALE_RESET_INTERVAL_MS = 60000;
const STALE_GENERATING_MS = 15 * 60 * 1000;
const NO_PRINT_ITEM_NAMES: string[] = ["Scrap Metal", "Nutrient Paste"];

type WorkerState = {
    started: boolean;
    running: boolean;
    timer?: ReturnType<typeof setInterval>;
    currentItemId?: string;
    lastComfyCheck?: number;
    comfyOnline?: boolean;
    lastStaleReset?: number;
    pulseCount: number;
    lastPulse?: number;
};

const globalState = globalThis as typeof globalThis & {
    __printerWorkerState?: WorkerState;
};

const ensureState = () => {
    if (!globalState.__printerWorkerState) {
        globalState.__printerWorkerState = { started: false, running: false, pulseCount: 0 };
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
        if (!state.comfyOnline) {
            console.warn(`[PRINTER WORKER] ⚠️ ComfyUI health check returned status ${res.status}`);
        }
    } catch (e: any) {
        state.comfyOnline = false;
        console.warn(`[PRINTER WORKER] ⚠️ ComfyUI health check failed: ${e.message} (Likely Offline)`);
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
    // 1. Normalize Items: Anything missing an image that isn't blacklisted
    await prisma.inventoryItem.updateMany({
        where: {
            item: { name: { notIn: NO_PRINT_ITEM_NAMES } },
            AND: [
                { OR: [{ customImage: null }, { customImage: "" }, { customImage: "null" }] },
                { OR: [
                    { imageStatus: "READY" },
                    { imageStatus: "FAILED" },
                    { imageStatus: "ERROR" },
                    { imageStatus: "" }
                ]}
            ]
        },
        data: { imageStatus: "QUEUED" }
    });

    // 2. Normalize Characters: Anything missing a portrait
    await prisma.character.updateMany({
        where: {
            AND: [
                { OR: [{ portrait: null }, { portrait: "" }, { portrait: "null" }] },
                { OR: [
                    { portraitStatus: "READY" },
                    { portraitStatus: "FAILED" },
                    { portraitStatus: "ERROR" },
                    { portraitStatus: "" },
                    { portraitStatus: null as any }
                ]}
            ]
        },
        data: { portraitStatus: "QUEUED" }
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
                OR: [
                    { customImage: null },
                    { customImage: "" },
                    { customImage: "null" }
                ],
                NOT: { imageStatus: { startsWith: "GENERATING" } }
            },
            data: { imageStatus: "GENERATING 0%" }
        });
        return result.count > 0;
    } else {
        const result = await prisma.character.updateMany({
            where: {
                id: id,
                OR: [{ portrait: null }, { portrait: "" }, { portrait: "null" }],
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
        where: { 
            OR: [{ customImage: null }, { customImage: "" }, { customImage: "null" }],
            imageStatus: { startsWith: "GENERATING" }, 
            updatedAt: { lt: staleBefore } 
        },
        data: { imageStatus: "FAILED" }
    });
    await prisma.inventoryItem.updateMany({
        where: { 
            AND: [
                { OR: [{ customImage: null }, { customImage: "" }, { customImage: "null" }] },
                { OR: [{ imageStatus: "READY" }, { imageStatus: "" }] }
            ]
        },
        data: { imageStatus: "QUEUED" }
    });

    // Characters (V23)
    await prisma.character.updateMany({
        where: { 
            OR: [{ portrait: null }, { portrait: "" }, { portrait: "null" }],
            portraitStatus: { startsWith: "GENERATING" }, 
            updatedAt: { lt: staleBefore } 
        },
        data: { portraitStatus: "FAILED" }
    });
    await prisma.character.updateMany({
        where: { 
            AND: [
                { OR: [{ portrait: null }, { portrait: "" }, { portrait: "null" }] },
                { OR: [
                    { portraitStatus: "READY" },
                    { portraitStatus: "" },
                    { portraitStatus: null as any }
                ]}
            ]
        },
        data: { portraitStatus: "QUEUED" }
    });
};

const runGeneration = async (state: WorkerState, id: string, type: 'item' | 'character', prompt: string) => {
    let lastProgress = 0;
    try {
        state.currentItemId = id;
        workerLog(`[PRINTER WORKER] 🚀 STARTING FABRICATION: ${type.toUpperCase()}[${id}] | PROMPT: ${prompt.substring(0, 50)}...`);

        const iconPath = await Promise.race([
            generateItemArt(prompt, id, type, async (p) => {
                const percentage = Math.round((p.value / p.max) * 100);
                if (percentage - lastProgress >= PROGRESS_STEP || percentage === 100) {
                    lastProgress = percentage;
                    const status = `GENERATING ${percentage}%`;
                    console.log(`[PRINTER WORKER] ⚙️ PROGRESS: ${type.toUpperCase()}[${id}] - ${percentage}%`);
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
            console.log(`[PRINTER WORKER] ✅ FABRICATION COMPLETE: ${type.toUpperCase()}[${id}] -> Saved to ${iconPath}`);
            const normalizedPath = normalizePublicPath(iconPath) || iconPath;
            if (type === 'item') {
                await prisma.inventoryItem.update({
                    where: { id },
                    data: { customImage: normalizedPath, imageStatus: "READY", updatedAt: new Date() }
                });
            } else {
                await (prisma as any).$executeRaw`
                    UPDATE "Character"
                    SET portrait = ${normalizedPath},
                        portraitStatus = 'READY',
                        portraitUpdatedAt = ${new Date()},
                        updatedAt = ${new Date()}
                    WHERE id = ${id}
                `;
            }
        } else {
            console.warn(`[PRINTER WORKER] ❌ FABRICATION FAILED: ${type.toUpperCase()}[${id}] -> No image returned`);
            const status = "FAILED";
            if (type === 'item') await prisma.inventoryItem.update({ where: { id }, data: { imageStatus: status } });
            else await prisma.character.update({ where: { id }, data: { portraitStatus: status } });
        }
    } catch (e: any) {
        console.error(`[PRINTER WORKER] 🚨 CRITICAL ERROR [${id}]:`, e.message);
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

const autoReplenishQueue = async () => {
    // This is called when the processor finds nothing actively QUEUED.
    // It triggers normalization to ensure the backlog is populated.
    await normalizeMissingImages();
    return true; 
};

const buildCharacterPrompt = (char: any) => {
    const classDetails: Record<string, string> = {
        "Arcanist": "A mystical tech-sage draped in tattered digital-weave robes, holding a glowing data-tome. Neural connectors spark with arcane blue energy. Heavy cybernetic augmentations around the eyes. Dark, industrial biotech laboratory background with floating glyphs and holographic interfaces.",
        "Engineer": "A rugged industrial specialist in heavy-duty exo-rig armor, stained with oil and hydraulic fluid. Carrying a massive plasma wrench and diagnostic scanner. Thick safety goggles reflecting glowing server racks. Background of a high-tech engine room with steam pipes and spinning turbines.",
        "Marine": "A battle-hardened soldier in bulky, scarred tactical power armor. Professional stance with a high-caliber gauss rifle. Face obscured by a cracked visor glowing with HUD readouts. A grim, war-torn interior corridor background with red emergency lighting and sparking wires.",
        "Pilot": "A sleek, agility-focused operative in a pressurized flight suit with integrated neural links. Helmet features wraparound sensory arrays. Confident posture against a background of a high-tech cockpit with hundreds of glowing flick-switches and a view of the star-void.",
        "Hacker": "A shadowy figure in a reinforced trenchcoat with integrated fiber-optic cables. Multiple mobile deck-units floating around them. Intense focus on a multi-screen holographic display. A dense cyber-slum background with glowing neon signs and rain-slicked metal floors."
    };
    const defaultDetails = "A specialized operative of the Mothership, equipped with high-tech survival gear and cybernetic enhancements. Standing in a dimly lit industrial space-station corridor with flickering lights and exposed wiring. Biopunk noir aesthetic, high-fidelity digital art style.";
    const basePrompt = classDetails[char.class] || defaultDetails;
    return `${char.name}, the ${char.class}. ${basePrompt} Detailed character portrait, cinematic lighting, sharp focus, 8k resolution.`.trim();
};

const processNextItem = async (state: WorkerState) => {
    await normalizeQueue();

    // 1. Fetch Candidates (Strict chronological order across types)
    const candidates = await Promise.all([
        prisma.character.findFirst({
            where: {
                AND: [
                    { OR: [{ portrait: null }, { portrait: "" }, { portrait: "null" }] },
                    { OR: [
                        { portraitStatus: "QUEUED" }, 
                        { portraitStatus: "FAILED" },
                        { portraitStatus: "ERROR" }
                    ]}
                ]
            },
            orderBy: { updatedAt: "asc" }
        }),
        prisma.inventoryItem.findFirst({
            where: {
                item: { name: { notIn: NO_PRINT_ITEM_NAMES } },
                AND: [
                    { OR: [{ customImage: null }, { customImage: "" }, { customImage: "null" }] },
                    { OR: [
                        { imageStatus: "QUEUED" }, 
                        { imageStatus: "FAILED" },
                        { imageStatus: "ERROR" }
                    ]}
                ]
            },
            include: { item: true },
            orderBy: { updatedAt: "asc" }
        })
    ]);

    const nextChar = candidates[0];
    const nextItem = candidates[1];

    if (nextChar || nextItem) {
        console.log(`[PRINTER WORKER] 🔍 CANDIDATES: CHAR=[${nextChar?.name || 'NONE'}] ITEM=[${nextItem?.item?.name || 'NONE'}]`);
    }

    // 2. FIFO Resolution
    if (nextChar && nextItem) {
        const charTs = new Date(nextChar.updatedAt).getTime();
        const itemTs = new Date(nextItem.updatedAt).getTime();
        
        if (charTs < itemTs) {
            console.log(`[PRINTER WORKER] 🕒 FIFO PICK: CHARACTER[${nextChar.name}] (Oldest: ${new Date(charTs).toISOString()})`);
            const locked = await lockItem(nextChar.id, 'character');
            if (locked) await runGeneration(state, nextChar.id, 'character', buildCharacterPrompt(nextChar));
            return;
        } else {
            console.log(`[PRINTER WORKER] 🕒 FIFO PICK: ITEM[${nextItem.id}] (Oldest: ${new Date(itemTs).toISOString()})`);
            const locked = await lockItem(nextItem.id, 'item');
            if (locked) await runGeneration(state, nextItem.id, 'item', buildPrompt(nextItem));
            return;
        }
    }

    if (nextChar) {
        console.log(`[PRINTER WORKER] 🕒 PICK (SINGLE): CHARACTER[${nextChar.name}]`);
        const locked = await lockItem(nextChar.id, 'character');
        if (locked) await runGeneration(state, nextChar.id, 'character', buildCharacterPrompt(nextChar));
        return;
    }

    if (nextItem) {
        console.log(`[PRINTER WORKER] 🕒 PICK (SINGLE): ITEM[${nextItem.id}]`);
        const locked = await lockItem(nextItem.id, 'item');
        if (locked) await runGeneration(state, nextItem.id, 'item', buildPrompt(nextItem));
        return;
    }

    // 3. Queue Exhausted -> Try Auto-Replenish
    await autoReplenishQueue();
};

export const ensurePrinterWorker = () => {
    if (typeof window !== "undefined") return;
    const state = ensureState();
    
    if (state.timer) {
        console.log("[PRINTER WORKER] ♻️ Periodic Sync: Worker already running.");
        return;
    }

    state.started = true;
    console.log("[PRINTER WORKER] 🔋 Global Printer Background Service Initialized");
    
    const runPulse = async () => {
        if (state.running) return;
        state.running = true;
        state.pulseCount++;
        state.lastPulse = Date.now();
        
        try {
            workerLog(`[PRINTER WORKER] 💓 Heartbeat #${state.pulseCount}`);
            await normalizeMissingImages();
            await resetStaleGenerating(state);
            
            const online = await checkComfyOnline(state);
            if (!online) {
                const now = Date.now();
                if ((now - (state.lastComfyCheck || 0)) > 60000) {
                    workerLog("[PRINTER WORKER] ⚠️ ComfyUI Backend Offline/Unreachable (Waiting...)");
                }
                return;
            }
            
            await processNextItem(state);
        } catch (err: any) {
            workerLog(`[PRINTER WORKER] 🚨 CRITICAL LOOP ERROR: ${err.message}`);
        } finally {
            state.running = false;
        }
    };

    // Run first pulse immediately
    runPulse();
    state.timer = setInterval(runPulse, POLL_MS);
};
