import { prisma } from "@/lib/prisma";

type LatestPrintRecord = {
    imageUpdatedAt: Date | null;
    source: "ITEM" | "PORTRAIT";
} | null;

export async function getMenuStatusSnapshot(userId: string) {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const [character, totalPlayers, onlinePlayers, activeMissions, activeLobbies, globalLastRun] = await Promise.all([
        prisma.character.findFirst({
            where: { userId },
            include: {
                inventory: { take: 1 },
            },
        }),
        prisma.user.count(),
        prisma.user.count({
            where: { updatedAt: { gte: fifteenMinutesAgo } },
        }),
        prisma.gameState.count({
            where: {
                updatedAt: { gte: tenMinutesAgo },
                NOT: { phase: { in: ["VICTORY", "GAMEOVER", "ABORTED"] } },
            },
        }),
        prisma.gameLobby.count({
            where: { status: "WAITING" },
        }),
        prisma.gameRun.findFirst({
            orderBy: { endedAt: "desc" },
        }),
    ]);

    let lastRun = null;
    let lastTransaction = null;
    let lastPrint: LatestPrintRecord = null;

    if (character) {
        const [latestRun, latestTransaction, latestItemPrint, portraitPrint] = await Promise.all([
            prisma.gameRun.findFirst({
                where: { characterId: character.id },
                orderBy: { endedAt: "desc" },
            }),
            prisma.marketTransaction.findFirst({
                where: {
                    OR: [{ sellerId: character.id }, { buyerId: character.id }],
                },
                orderBy: { timestamp: "desc" },
            }),
            prisma.inventoryItem.findFirst({
                where: {
                    characterId: character.id,
                    imageStatus: "READY",
                    imageUpdatedAt: { not: null },
                },
                orderBy: { imageUpdatedAt: "desc" },
                select: { imageUpdatedAt: true },
            }),
            prisma.character.findUnique({
                where: { id: character.id },
                select: { portraitUpdatedAt: true, portraitStatus: true },
            }),
        ]);

        lastRun = latestRun;
        lastTransaction = latestTransaction;

        const itemTime = latestItemPrint?.imageUpdatedAt?.getTime() ?? 0;
        const portraitTime = portraitPrint?.portraitStatus === "READY"
            ? (portraitPrint.portraitUpdatedAt?.getTime() ?? 0)
            : 0;

        if (itemTime || portraitTime) {
            lastPrint = itemTime >= portraitTime
                ? { imageUpdatedAt: latestItemPrint?.imageUpdatedAt ?? null, source: "ITEM" }
                : { imageUpdatedAt: portraitPrint?.portraitUpdatedAt ?? null, source: "PORTRAIT" };
        }
    }

    let comfyStatus = false;
    try {
        const comfyRes = await fetch("http://127.0.0.1:8188/", { next: { revalidate: 0 } }).catch(() => null);
        comfyStatus = !!comfyRes && (comfyRes.ok || comfyRes.status === 200);
    } catch {
        comfyStatus = false;
    }

    return {
        character,
        lastRun,
        globalLastRun,
        lastTransaction,
        lastPrint,
        totalPlayers,
        onlinePlayers,
        activeMissions,
        activeLobbies,
        comfyStatus,
    };
}
