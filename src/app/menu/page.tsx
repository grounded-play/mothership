import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findUserBySessionEmail, touchUserByEmail } from "@/lib/sessionUser";
import { redirect } from "next/navigation";
import MainMenu from "@/components/menu/MainMenu";
import CurrencyDisplay from "@/components/ui/CurrencyDisplay";
import StatusPanel from "@/components/menu/StatusPanel";
import AutoFitViewport from "@/components/layout/AutoFitViewport";

export default async function MenuPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        redirect("/");
    }

    const user = await findUserBySessionEmail(session.user.email);
    if (!user) {
        redirect("/");
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

    await touchUserByEmail(user.email);

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    [character, totalPlayers, onlinePlayers, activeMissions, activeLobbies, globalLastRun] = await Promise.all([
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

    if (character) {
        const [runs, txs, prints] = await Promise.all([
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
            prisma.$queryRaw<{ imageUpdatedAt: Date | null }[]>`
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
    } catch {
        comfyStatus = false;
    }

    return (
        <main className="h-full w-full overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
            <div className="mx-auto flex h-full w-full max-w-[1500px] min-h-0 flex-col">
                <AutoFitViewport contentKey={`menu-${character.id}-${activeMissions}-${activeLobbies}`}>
                    <div className="grid h-[680px] min-w-[1240px] w-full grid-cols-[320px_minmax(0,1fr)] gap-5">
                        <section className="flex h-full min-h-0 flex-col">
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
                        </section>

                        <section className="flex h-full min-h-0 flex-col gap-5">
                            <div className="flex shrink-0 items-center justify-end">
                                <CurrencyDisplay credits={character?.credits || 0} voidTokens={character?.voidTokens || 0} />
                            </div>
                            <div className="min-h-0 flex-1">
                                <MainMenu />
                            </div>
                        </section>
                    </div>
                </AutoFitViewport>
            </div>
        </main>
    );
}
