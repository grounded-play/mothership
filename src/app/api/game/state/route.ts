import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get("gameId");

    if (!gameId) return NextResponse.json({ error: "Missing gameId" }, { status: 400 });

    try {
        const gameState = await (prisma as any).gameState.findUnique({
            where: { id: gameId },
            include: {
                GamePlayer: {
                    include: {
                        Character: {
                            include: { user: true }
                        },
                        MapNode: true
                    }
                },
                GameLobby: true,
                MapNode: true
            }
        });

        if (!gameState) return NextResponse.json({ error: "Game not found" }, { status: 404 });

        // CORRUPTION CHECK: Partial Initialization
        if (gameState.GamePlayer.length === 0) {
            return NextResponse.json({ error: "Game Corrupted: Initialization Failed. Please create a new lobby." }, { status: 410 });
        }

        console.log("--- DEBUG AUTH ---");
        console.log("Session User:", session.user);

        gameState.GamePlayer.forEach((gp: any) => {
            console.log(`Candidate: ${gp.Character.name} | UserID: ${gp.Character.userId} | Email: ${gp.Character.user?.email}`);
        });

        // Identify Current Player
        const currentPlayer = gameState.GamePlayer.find((gp: any) => gp.Character.userId === session.user.id) ||
            gameState.GamePlayer.find((gp: any) => gp.Character.user?.email === session.user.email); // Fallback

        // Identify current user's player
        // Assuming session.user contains character information or can be used to find it
        // The original code used `currentPlayer` which is derived from `session.user.id` or `session.user.email`
        // The instruction introduces `user?.characters[0]` which is not defined.
        // I will use `currentPlayer` as the primary player object for consistency with the original code's intent.
        const player = currentPlayer; // Renaming for clarity as per instruction's `player` variable

        // Filter other players
        const otherPlayers = gameState.GamePlayer
            .filter((p: any) => p.characterId !== player?.characterId)
            .map((p: any) => ({
                id: p.characterId,
                name: p.Character.name,
                hp: p.hp,
                maxHp: p.maxHp,
                ap: p.ap,
                class: p.Character.class,
                portrait: p.Character.portrait,
                character: p.Character
            }));

        // Calculate Distance
        let distance = 999;
        if (player?.MapNode && gameState.objectiveNodeId) {
            // We need the target node. We didn't fetch it explicitly.
            // Let's fetch all nodes? No, too heavy.
            // Let's fetch the target node specifically if we don't have it.
            // Actually, for now, let's just fetch it.
            try {
                const target = await (prisma as any).mapNode.findUnique({ where: { id: gameState.objectiveNodeId } });
                if (target) {
                    distance = Math.abs(player.MapNode.x - target.x) +
                        Math.abs(player.MapNode.y - target.y) +
                        Math.abs(player.MapNode.z - target.z);
                }
            } catch (e) { }
        }

        // Calculate Time
        const now = new Date();
        const deadline = gameState.deadline ? new Date(gameState.deadline) : new Date(now.getTime() + 30 * 60000);
        const timeLeft = Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 1000));

        // Parse JSON fields safely for the client convenience, although client also checks
        let parsedTurnOrder = [];
        try { parsedTurnOrder = JSON.parse(gameState.turnOrder); } catch (e) { }

        // Debug Log
        console.log("--- DEBUG GAME STATE ---");
        console.log("GameID:", gameId);
        console.log("ActiveIndex:", gameState.activePlayerIndex);
        console.log("TurnOrder:", parsedTurnOrder);
        console.log("PlayerID:", player?.characterId);
        console.log("HandLength:", player?.hand ? JSON.parse(player.hand).length : "No Hand");

        // Construct Response
        return NextResponse.json({
            game: {
                ...gameState,
                turnOrder: parsedTurnOrder // Ensure array
            },
            player: currentPlayer ? {
                ...currentPlayer,
                character: currentPlayer.Character
            } : null,
            otherPlayers
        });

    } catch (e) {
        console.error("Game State Error:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
