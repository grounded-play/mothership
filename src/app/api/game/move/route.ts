import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { gameId, direction } = await req.json();

        // 1. Get Game & Player
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const character = user?.characters[0];
        if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });

        // 1. Get Game state with Lobby (for Difficulty)
        const gameState = await (prisma as any).gameState.findUnique({
            where: { id: gameId },
            include: { GameLobby: true }
        });
        if (!gameState) return NextResponse.json({ error: "Game State Not Found" }, { status: 404 });

        // 2. Get Player Position
        const player = await (prisma as any).gamePlayer.findFirst({
            where: { gameId, characterId: character.id },
            include: { MapNode: true }
        });
        if (!player || !player.MapNode) return NextResponse.json({ error: "Player/Node not found" }, { status: 404 });

        // RELATIVE MOVEMENT LOGIC
        let { x, y, z } = player.MapNode;
        let facing = (player as any).facing || "NORTH";
        let newFacing = facing;
        let isTurnAction = false;
        let isMoveAction = false;

        switch (direction) {
            case "LEFT":
                isTurnAction = true;
                if (facing === "NORTH") newFacing = "WEST";
                else if (facing === "WEST") newFacing = "SOUTH";
                else if (facing === "SOUTH") newFacing = "EAST";
                else if (facing === "EAST") newFacing = "NORTH";
                break;
            case "RIGHT":
                isTurnAction = true;
                if (facing === "NORTH") newFacing = "EAST";
                else if (facing === "EAST") newFacing = "SOUTH";
                else if (facing === "SOUTH") newFacing = "WEST";
                else if (facing === "WEST") newFacing = "NORTH";
                break;
            case "FORWARD":
                isMoveAction = true;
                if (facing === "NORTH") y += 1;
                else if (facing === "SOUTH") y -= 1;
                else if (facing === "EAST") x += 1;
                else if (facing === "WEST") x -= 1;
                break;
            case "BACK":
                isMoveAction = true;
                if (facing === "NORTH") y -= 1;
                else if (facing === "SOUTH") y += 1;
                else if (facing === "EAST") x -= 1;
                else if (facing === "WEST") x += 1;
                break;
            case "UP":
                isMoveAction = true;
                z += 1;
                break;
            case "DOWN":
                isMoveAction = true;
                z -= 1;
                break;
            default: return NextResponse.json({ error: "Invalid Direction" }, { status: 400 });
        }

        // TIMER INIT LOGIC (On First Move)
        if (isMoveAction && !gameState.deadline) {
            // Difficulty: Easy=20, Normal=15, Hard=10
            const diff = gameState.GameLobby?.difficulty || "NORMAL";
            const minutes = diff === "HARD" ? 10 : diff === "EASY" ? 20 : 15;

            await (prisma as any).gameState.update({
                where: { id: gameId },
                data: {
                    deadline: new Date(Date.now() + minutes * 60000),
                    phase: gameState.phase === "AIRLOCK" ? "ACTION" : gameState.phase
                }
            });
        }

        if (isTurnAction) {
            await (prisma as any).gamePlayer.update({
                where: { id: player.id },
                data: { facing: newFacing }
            });
        } else {
            // MOVEMENT EXECUTION
            // 3. Find Target Node
            const targetNode = await (prisma as any).mapNode.findFirst({
                where: { gameId, x, y, z }
            });

            if (!targetNode) {
                return NextResponse.json({ error: "Path Blocked / Hull Breach" }, { status: 400 });
            }

            // 4. Explore Node & Trigger Encounter
            const isNewEncounter = !targetNode.isExplored && (targetNode.type === "ENEMY" || targetNode.type === "BOSS");

            await (prisma as any).mapNode.update({
                where: { id: targetNode.id },
                data: { isExplored: true }
            });

            // 5. Update Player & Cards
            const gameState = await (prisma as any).gameState.findUnique({ where: { id: gameId } });
            let roomDeck = JSON.parse(gameState.roomDeck || "[]");
            let playerHand = JSON.parse(player.hand || "[]");

            if (roomDeck.length > 0) {
                const newCard = roomDeck.shift(); // Draw 1
                playerHand.push(newCard);

                await (prisma as any).gameState.update({
                    where: { id: gameId },
                    data: {
                        roomDeck: JSON.stringify(roomDeck),
                        phase: isNewEncounter ? "COMBAT" : gameState.phase
                    }
                });

                await (prisma as any).gamePlayer.update({
                    where: { id: player.id },
                    data: {
                        nodeId: targetNode.id,
                        updatedAt: new Date(),
                        hand: JSON.stringify(playerHand),
                        facing: newFacing // Keep facing
                    }
                });
            } else {
                await (prisma as any).gamePlayer.update({
                    where: { id: player.id },
                    data: {
                        nodeId: targetNode.id,
                        updatedAt: new Date(),
                        facing: newFacing
                    }
                });
                if (isNewEncounter) {
                    await (prisma as any).gameState.update({ where: { id: gameId }, data: { phase: "COMBAT" } });
                }
            }
        }

        // 6. Advance Turn
        // Player's turn ends after MOVE.
        const currentGameState = await (prisma as any).gameState.findUnique({ where: { id: gameId } });
        const turnOrder = JSON.parse(currentGameState.turnOrder || "[]");

        // ... Logic for AI turn ...
        let nextIndex = (currentGameState.activePlayerIndex + 1) % turnOrder.length;
        let nextPlayerId = turnOrder[nextIndex];

        // AI / Environment Turn Handling (Auto-Resolve)
        // AI / Environment Turn Handling (Auto-Resolve)
        if (nextPlayerId === "STATION_CORE") {
            let currentPile = JSON.parse(currentGameState.currentPile || "[]");
            let roomDeckAI = JSON.parse(currentGameState.roomDeck || "[]");

            // 1. Get Player's Challenge Card
            const playerCard = currentPile.length > 0 ? currentPile[currentPile.length - 1] : null;

            // 2. AI Counter-Move (Smart Logic)
            let aiCard: any[] | null = null;
            let aiWins = false;

            const playerRank = playerCard?.rank || 0;
            // Infer Count
            let requiredCount = 1;
            if (playerCard) {
                for (let i = currentPile.length - 2; i >= 0; i--) {
                    if (currentPile[i].rank === playerCard.rank) requiredCount++;
                    else break;
                }
            }

            // Sort & Find
            roomDeckAI.sort((a: any, b: any) => a.rank - b.rank);
            const uniqueRanks = Array.from(new Set(roomDeckAI.map((c: any) => c.rank))).sort((a: any, b: any) => a - b);

            for (const r of uniqueRanks) {
                if ((r as number) > playerRank) {
                    const candidates = roomDeckAI.filter((c: any) => c.rank === r);
                    if (candidates.length >= requiredCount) {
                        aiCard = candidates.slice(0, requiredCount);
                        const idsToRemove = aiCard!.map((c: any) => c.id);
                        roomDeckAI = roomDeckAI.filter((c: any) => !idsToRemove.includes(c.id));
                        aiWins = true;
                        break;
                    }
                }
            }

            if (!aiWins) {
                if (roomDeckAI.length > 0) roomDeckAI.shift(); // Burn
                aiWins = false;
            }

            // 3. Update State
            let pileOwnerId = currentGameState.pileOwnerId;
            let phase = "ACTION";
            let integrity = currentGameState.integrity;

            if (aiWins && aiCard) {
                // AI WINS
                await (prisma as any).gamePlayer.update({ where: { id: player.id }, data: { hp: { decrement: 1 } } });

                const newCards = aiCard!.map((c: any) => ({ ...c, source: "AI", isCombatWin: true }));
                currentPile.push(...newCards);
                pileOwnerId = "STATION_CORE";
            } else {
                // AI PASSES -> Player Wins -> Clear Pile & Reward
                const currentNodeType = player.MapNode?.type;
                if (currentGameState.phase === "COMBAT" || currentNodeType === "BOSS" || currentNodeType === "ENEMY") {
                    // Damage Core
                    const dmg = 10;
                    integrity = Math.max(0, (integrity || 100) - dmg);
                    await (prisma as any).gameState.update({ where: { id: gameId }, data: { integrity } });
                    if (integrity <= 0) phase = "VICTORY";
                }
                if (currentNodeType === "LOOT") {
                    await (prisma as any).character.update({ where: { id: player.characterId }, data: { credits: { increment: 50 }, exp: { increment: 10 } } });
                }
                currentPile = []; // Clear
            }

            await (prisma as any).gameState.update({
                where: { id: gameId },
                data: {
                    roomDeck: JSON.stringify(roomDeckAI),
                    currentPile: JSON.stringify(currentPile),
                    phase: phase === "VICTORY" ? "VICTORY" : "ACTION",
                    pileOwnerId,
                    activePlayerIndex: (nextIndex + 1) % turnOrder.length, // Skip AI
                    integrity // Update Integrity
                }
            });

            return NextResponse.json({ success: true, message: aiWins ? "Hostile Engagement" : "Sector Secured", facing: newFacing });
        }

        // Standard Turn Advance (Non-AI)
        await (prisma as any).gameState.update({
            where: { id: gameId },
            data: { activePlayerIndex: nextIndex }
        });

        // Return new Facing for UI
        return NextResponse.json({ success: true, message: isTurnAction ? "Re-orienting..." : "Movement Successful", facing: newFacing });

    } catch (e: any) {
        console.error("Move Error:", e);
        return NextResponse.json({ error: e.message || "Movement Failed" }, { status: 500 });
    }
}
