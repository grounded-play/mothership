import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CardRules } from "@/lib/game/cards";

type PendingAction = {
    playerId: string;
    intent: "SCAN" | "SECURE" | "MOVE" | "FIGHT";
    cards: any[];
    auto?: boolean;
};

const ACTION_WINDOW_MS = 15_000;
const computeBasePool = (count: number) => 2 + count; // 3 for solo, +1 per additional player

async function beginActionPhase(gameState: any) {
    const players = await (prisma as any).gamePlayer.findMany({
        where: { gameId: gameState.id },
        include: { MapNode: true }
    });

    let deck = JSON.parse(gameState.roomDeck || "[]");

    // Draw 1 card for every player and prep AP pool
    for (const p of players) {
        const hand = JSON.parse(p.hand || "[]");
        if (deck.length > 0) {
            hand.push(deck.shift());
        }
        await (prisma as any).gamePlayer.update({
            where: { id: p.id },
            data: { hand: JSON.stringify(hand) }
        });
    }

    const basePool = computeBasePool(players.length) + players.length; // +1 AP per participant draw
    const updated = await (prisma as any).gameState.update({
        where: { id: gameState.id },
        data: {
            roundPhase: "ACTION",
            phase: "ACTION",
            sharedApMax: basePool,
            sharedAp: basePool,
            roomDeck: JSON.stringify(deck),
            pendingActions: "[]",
            actionDeadline: new Date(Date.now() + ACTION_WINDOW_MS)
        }
    });

    return updated;
}

function parsePending(raw: any): PendingAction[] {
    try { return JSON.parse(raw || "[]"); } catch { return []; }
}

function lowestCard(hand: any[]) {
    if (!hand || hand.length === 0) return null;
    const sorted = [...hand].sort((a, b) => CardRules.getCardPower(a) - CardRules.getCardPower(b));
    return sorted[0];
}

async function resolveReaction(gameState: any, players: any[], pending: PendingAction[]) {
    const results: any[] = [];
    const updates: Promise<any>[] = [];

    for (const action of pending) {
        const player = players.find(p => p.characterId === action.playerId);
        if (!player) continue;
        const node = player.MapNode;
        const nodePower = node?.roomPower || 0;
        const nodeSuit = node?.roomSuit || null;

        const cardPower = action.cards.length > 0
            ? Math.max(...action.cards.map((c: any) => CardRules.getCardPower(c, nodeSuit)))
            : 0;
        const success = cardPower >= nodePower;

        if (success) {
            if (action.intent === "SCAN" || action.intent === "SEARCH") {
                const inv = JSON.parse(player.inventory || "[]");
                inv.push({
                    id: `loot-${Date.now()}`,
                    name: "Recovered Supply",
                    type: "LOOT",
                    qty: 1,
                    description: "Found during scan"
                });
                updates.push((prisma as any).gamePlayer.update({
                    where: { id: player.id },
                    data: { inventory: JSON.stringify(inv) }
                }));
            } else if (action.intent === "SECURE") {
                updates.push((prisma as any).mapNode.update({
                    where: { id: node.id },
                    data: {
                        security: cardPower,
                        roomPower: Math.max(3, nodePower - 1)
                    }
                }));
            }
            results.push({ playerId: action.playerId, success: true, intent: action.intent, cardPower, nodePower });
        } else {
            // Failure bumps difficulty and alerts
            updates.push((prisma as any).mapNode.update({
                where: { id: node.id },
                data: {
                    roomPower: nodePower + 1,
                    security: Math.max(0, (node.security || 0) - 1)
                }
            }));
            results.push({ playerId: action.playerId, success: false, intent: action.intent, cardPower, nodePower });
        }
    }

    // Passive escalation: unsecured rooms drift harder
    for (const p of players) {
        if (!p.MapNode) continue;
        if ((p.MapNode.security || 0) <= 0 && Math.random() < 0.2) {
            updates.push((prisma as any).mapNode.update({
                where: { id: p.MapNode.id },
                data: { roomPower: p.MapNode.roomPower + 1 }
            }));
        }
    }

    await Promise.all(updates);

    // Reset for next round (back to draw phase)
    const basePool = computeBasePool(players.length);
    await (prisma as any).gameState.update({
        where: { id: gameState.id },
        data: {
            roundPhase: "DRAW",
            phase: "DRAW",
            sharedAp: basePool,
            sharedApMax: basePool,
            pendingActions: "[]",
            actionDeadline: null
        }
    });

    return results;
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { gameId, action, cards = [], intent } = await req.json();
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const character = user?.characters[0];
        if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });

        let gameState = await (prisma as any).gameState.findUnique({
            where: { id: gameId },
            include: {
                GamePlayer: { include: { MapNode: true, Character: true } },
                GameLobby: true
            }
        });
        if (!gameState) return NextResponse.json({ error: "Game not found" }, { status: 404 });

        let players: any[] = gameState.GamePlayer;
        let player = players.find((p: any) => p.characterId === character.id);
        if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

        // Kick off draw -> action phase if we're waiting at draw
        if (gameState.roundPhase === "DRAW") {
            gameState = await beginActionPhase(gameState);
            gameState = await (prisma as any).gameState.findUnique({
                where: { id: gameId },
                include: {
                    GamePlayer: { include: { MapNode: true, Character: true } },
                    GameLobby: true
                }
            });
            players = gameState?.GamePlayer || [];
            player = players.find((p: any) => p.characterId === character.id);
        }

        if (action === "LOCK_ACTION" || action === "PLAY" || action === "RESOLVE_TURN") {
            if (gameState.roundPhase !== "ACTION") {
                return NextResponse.json({ error: "Not in action phase" }, { status: 400 });
            }

            const pending = parsePending(gameState.pendingActions);
            let sharedAp = gameState.sharedAp || 0;
            const existingIdx = pending.findIndex(p => p.playerId === character.id);
            if (existingIdx !== -1) {
                sharedAp += pending[existingIdx].cards.length; // refund previous lock
                pending.splice(existingIdx, 1);
            }

            // Determine cards to lock
            const currentHand = JSON.parse(player.hand || "[]");
            let lockedCards = Array.isArray(cards) && cards.length > 0 ? cards : [];
            if (lockedCards.length === 0) {
                const autoCard = lowestCard(currentHand);
                if (autoCard) lockedCards = [autoCard];
            }
            const cost = Math.max(1, lockedCards.length);
            if (sharedAp < cost) {
                return NextResponse.json({ error: "Not enough AP in shared pool" }, { status: 400 });
            }

            // Remove locked cards from hand
            const lockIds = new Set(lockedCards.map((c: any) => c.id));
            const newHand = currentHand.filter((c: any) => !lockIds.has(c.id));
            await (prisma as any).gamePlayer.update({
                where: { id: player.id },
                data: { hand: JSON.stringify(newHand) }
            });

            pending.push({
                playerId: character.id,
                intent: (intent || "SCAN") as any,
                cards: lockedCards,
                auto: cards.length === 0
            });

            sharedAp = Math.max(0, sharedAp - cost);

            const updatedState = await (prisma as any).gameState.update({
                where: { id: gameId },
                data: {
                    pendingActions: JSON.stringify(pending),
                    sharedAp
                }
            });

            // Check completion conditions
            const allLocked = pending.length >= players.length;
            const deadline = updatedState.actionDeadline ? new Date(updatedState.actionDeadline) : null;
            const deadlinePassed = deadline ? deadline.getTime() <= Date.now() : false;

            if (allLocked || deadlinePassed) {
                let remainingAp = updatedState.sharedAp || 0;
                // Auto-lock defaults for missing players
                const lockedIds = new Set(pending.map(p => p.playerId));
                for (const p of players) {
                    if (lockedIds.has(p.characterId)) continue;
                    const hand = JSON.parse(p.hand || "[]");
                    const autoCard = lowestCard(hand);
                    if (autoCard) {
                        const newHand = hand.filter((c: any) => c.id !== autoCard.id);
                        await (prisma as any).gamePlayer.update({
                            where: { id: p.id },
                            data: { hand: JSON.stringify(newHand) }
                        });
                        pending.push({
                            playerId: p.characterId,
                            intent: "SCAN",
                            cards: [autoCard],
                            auto: true
                        });
                        remainingAp = Math.max(0, remainingAp - 1);
                    }
                }

                await (prisma as any).gameState.update({
                    where: { id: gameId },
                    data: {
                        pendingActions: JSON.stringify(pending),
                        sharedAp: remainingAp
                    }
                });

                const latestPlayers = await (prisma as any).gamePlayer.findMany({
                    where: { gameId },
                    include: { MapNode: true }
                });

                const reactionResults = await resolveReaction(updatedState, latestPlayers, pending);
                return NextResponse.json({ success: true, resolved: true, reactionResults });
            }

            return NextResponse.json({ success: true, message: "Action locked", sharedAp: updatedState.sharedAp });
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });

    } catch (e: any) {
        console.error("Action Error:", e);
        return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
    }
}
