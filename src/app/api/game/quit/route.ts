import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseJSON(raw: any, fallback: any) {
    try { return JSON.parse(raw); } catch { return fallback; }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { gameId, reason } = await req.json();

        // 1. Get User Character
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const character = user?.characters[0];
        if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });

        // 2. Get Game
        const game = await (prisma as any).gameState.findUnique({
            where: { id: gameId },
            include: { GameLobby: true }
        });
        if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

        const isHost = game.GameLobby.hostId === character.id;
        const isVictory = reason === "VICTORY" || game.phase === "VICTORY";

        // 3. Score Calculation
        const now = new Date();
        const deadline = game.deadline ? new Date(game.deadline) : now;
        const timeRemainingSeconds = Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 1000));

        const difficulty = game.GameLobby.difficulty; // "NORMAL" or "HARD"
        const multiplier = difficulty === "HARD" ? 2 : 1;

        const baseScore = isVictory ? 100 : 10;
        const timeBonus = isVictory ? (timeRemainingSeconds * multiplier) : 0;
        const totalScore = baseScore + timeBonus;

        let rank = "F";
        if (isVictory) {
            if (totalScore >= 1000) rank = "S";
            else if (totalScore >= 750) rank = "A";
            else if (totalScore >= 500) rank = "B";
            else if (totalScore >= 250) rank = "C";
        }

        // Reward Credits
        const creditsEarned = isVictory ? totalScore : 0;
        try {
            await (prisma as any).character.update({
                where: { id: character.id },
                data: {
                    credits: { increment: creditsEarned },
                    runsCompleted: { increment: isVictory ? 1 : 0 },
                    runsFailed: { increment: isVictory ? 0 : 1 }
                }
            });
        } catch (e) { console.error("Reward Error:", e); }

        // 4. End Game if Host, or Remove Player
        if (isHost) {
            // End Game for Everyone
            await (prisma as any).gameState.update({
                where: { id: gameId },
                data: { phase: isVictory ? "VICTORY" : "ABORTED" }
            });
            // Also close lobby
            await (prisma as any).gameLobby.update({
                where: { id: game.lobbyId },
                data: { status: "ENDED" }
            });
        } else {
            // Player leaving: Remove from game logic instead of aborting.
            // 1. Delete GamePlayer entry
            await (prisma as any).gamePlayer.deleteMany({
                where: {
                    gameId: gameId,
                    characterId: character.id
                }
            });

            // 2. Clean up GameState (turnOrder, pendingActions)
            const latestGame = await (prisma as any).gameState.findUnique({ where: { id: gameId } });
            if (latestGame) {
                const turnOrder = parseJSON((latestGame as any).turnOrder || "[]", []).filter((id: string) => id !== character.id);
                const pending = parseJSON((latestGame as any).pendingActions || "[]", []).filter((p: any) => p.playerId !== character.id);

                const remainingPlayersCount = await (prisma as any).gamePlayer.count({ where: { gameId } });

                if (remainingPlayersCount === 0) {
                    // Empty game, abort
                    await (prisma as any).gameState.update({
                        where: { id: gameId },
                        data: { phase: "ABORTED" }
                    });
                } else {
                    // Check if we should trigger immediate resolution (everyone else is ready)
                    // If pending >= remaining, trigger via deadline hack (set to now)
                    // (autoProgress in state/route will pick it up)
                    const allReady = pending.length >= remainingPlayersCount;

                    await (prisma as any).gameState.update({
                        where: { id: gameId },
                        data: {
                            turnOrder: JSON.stringify(turnOrder),
                            pendingActions: JSON.stringify(pending),
                            actionDeadline: allReady ? new Date() : latestGame.actionDeadline
                        }
                    });
                }
            }
        }

        return NextResponse.json({
            success: true,
            isHost,
            score: totalScore,
            rank,
            creditsEarned,
            timeBonus,
            baseScore
        });

    } catch (e) {
        console.error("Quit Error:", e);
        return NextResponse.json({ error: "Failed to quit" }, { status: 500 });
    }
}
