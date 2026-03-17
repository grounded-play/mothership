import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import MainMenu from "@/components/menu/MainMenu";
import CurrencyDisplay from "@/components/ui/CurrencyDisplay";
import StatusPanel from "@/components/menu/StatusPanel";

export default async function MenuPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        redirect("/");
    }

    let userId = session.user.id;

    // Backfill logic if id missing from session types (safety)
    if (!userId) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (user) userId = user.id;
    }

    let character = null;
    let lastRun = null;
    let globalLastRun = null;
    let lastTransaction = null;
    let lastPrint = null;
    let totalPlayers = 0;
    let onlinePlayers = 0;
    let activeMissions = 0;
    let activeLobbies = 0;
    let comfyStatus = false;

    if (userId) {
        // Mark user as active
        await prisma.user.update({
            where: { id: userId },
            data: { updatedAt: new Date() }
        });

        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        
        [character, totalPlayers, onlinePlayers, activeMissions, activeLobbies, globalLastRun] = await Promise.all([
            prisma.character.findFirst({
                where: { userId: userId },
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

        if (!character) {
            redirect("/character/create");
        }

        // Check ComfyUI connectivity (Standard health check endpoint)
        try {
            const comfyRes = await fetch("http://127.0.0.1:8188/", { next: { revalidate: 0 } }).catch(() => null);
            comfyStatus = !!comfyRes && (comfyRes.ok || comfyRes.status === 200);
        } catch (e) {
            comfyStatus = false;
        }
    }

    return (
        <>
            <div className="absolute top-4 left-4 z-50">
                <StatusPanel 
                    character={character} 
                    lastRun={lastRun}
                    globalLastRun={globalLastRun}
                    lastTransaction={lastTransaction}
                    lastPrint={lastPrint}
                    totalPlayers={totalPlayers}
                    onlinePlayers={onlinePlayers}
                    activeMissions={activeMissions}
                    activeLobbies={activeLobbies}
                    comfyStatus={comfyStatus}
                />
            </div>
            <div className="absolute top-4 right-4 z-50">
                <CurrencyDisplay credits={character?.credits || 0} voidTokens={character?.voidTokens || 0} />
            </div>
            <MainMenu />
        </>
    );
}
