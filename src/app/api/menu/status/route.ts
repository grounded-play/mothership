import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findUserBySessionEmail, touchUserByEmail } from "@/lib/sessionUser";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await findUserBySessionEmail(session.user.email);
    if (!user) return NextResponse.json({ error: "Session expired" }, { status: 401 });

    // Mark user as active
    await touchUserByEmail(user.email);

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    let [character, totalPlayers, onlinePlayers, activeMissions, activeLobbies, globalLastRun] = await Promise.all([
        prisma.character.findFirst({
            where: { userId: user.id },
            include: { inventory: { take: 1 } }
        }),
        prisma.user.count(),
        prisma.user.count({
            where: { updatedAt: { gte: fifteenMinutesAgo } }
        }),
        prisma.gameState.count({
            where: { 
                updatedAt: { gte: tenMinutesAgo },
                NOT: { phase: { in: ['VICTORY', 'GAMEOVER', 'ABORTED'] } }
            }
        }),
        prisma.gameLobby.count({
            where: { status: 'WAITING' }
        }),
        prisma.gameRun.findFirst({
            orderBy: { endedAt: 'desc' }
        })
    ]);

    let lastTransaction = null;
    let lastPrint = null;
    let lastRun = null;

    if (character) {
        const [runs, txs, prints]: [any[], any[], any[]] = await Promise.all([
             prisma.gameRun.findMany({
                where: { characterId: character.id },
                orderBy: { endedAt: 'desc' },
                take: 1
            }),
            prisma.marketTransaction.findMany({
                where: { OR: [{ sellerId: character.id }, { buyerId: character.id }] },
                orderBy: { timestamp: 'desc' },
                take: 1
            }),
            (prisma as any).$queryRaw`
                SELECT "imageUpdatedAt" 
                FROM "InventoryItem" 
                WHERE "characterId" = ${character.id} 
                  AND "imageStatus" = 'READY' 
                  AND "imageUpdatedAt" IS NOT NULL 
                ORDER BY "imageUpdatedAt" DESC 
                LIMIT 1
            `
        ]);
        lastRun = runs[0] || null;
        lastTransaction = txs[0] || null;
        lastPrint = prints[0] || null;
    }

    let comfyStatus = false;
    try {
        const comfyRes = await fetch("http://127.0.0.1:8188/", { next: { revalidate: 0 } }).catch(() => null);
        comfyStatus = !!comfyRes && (comfyRes.ok || comfyRes.status === 200);
    } catch (e) {
        comfyStatus = false;
    }

    return NextResponse.json({
        character,
        lastRun,
        globalLastRun,
        lastTransaction,
        lastPrint,
        totalPlayers,
        onlinePlayers,
        activeMissions,
        activeLobbies,
        comfyStatus
    });
}
