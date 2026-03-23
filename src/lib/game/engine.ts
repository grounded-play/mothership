import { prisma } from "@/lib/prisma";
import { DeckGenerator, CardRules } from "./cards";
import { getBackpackCapacity } from "./backpack";
import { SpaceDerelictGenerator } from "./generator";

export class GameEngine {
    static async initializeGame(lobbyId: string) {
        console.log(`[GameEngine] Initializing mission for lobby: ${lobbyId}`);

        // 1. Pre-clear any "ghost" data from failed/interrupted starts
        try {
            await Promise.all([
                (prisma as any).gameState.delete({ where: { id: lobbyId } }).catch(() => null),
                (prisma as any).mapNode.deleteMany({ where: { gameId: lobbyId } }),
                (prisma as any).gamePlayer.deleteMany({ where: { gameId: lobbyId } })
            ]);
            console.log(`[GameEngine] Sector cleared for lobby: ${lobbyId}`);
        } catch (e) {
            console.warn(`[GameEngine] Warning during cleanup for ${lobbyId}:`, e);
        }

        const lobby = await (prisma as any).gameLobby.findUnique({
            where: { id: lobbyId },
            include: {
                members: {
                    include: {
                        character: {
                            include: { inventory: { include: { item: true } } }
                        }
                    }
                }
            }
        });

        if (!lobby) throw new Error("Lobby not found");

        const gameId = lobbyId;

        const playerCount = lobby.members.length;
        const baseApPool = 2 + playerCount; // Base 3 for solo, +1 per extra player

        // 2. Create Game State
        await (prisma as any).gameState.create({
            data: {
                id: gameId,
                lobbyId: lobbyId,
                phase: "DRAW",
                roundPhase: "DRAW",
                currentTurn: 1,
                integrity: 100,
                turnOrder: JSON.stringify(lobby.members.map((m: any) => m.characterId)),
                sharedAp: baseApPool,
                sharedApMax: baseApPool,
                pendingActions: "[]",
                actionDeadline: null,
                activePlayerIndex: 0,
                updatedAt: new Date()
            }
        });

        // 3. Generate Procedural Map using SpaceDerelictGenerator
        const generatedNodes = SpaceDerelictGenerator.generate(gameId, 4);

        // Batch create nodes in DB
        for (const gNode of generatedNodes) {
            await (prisma as any).mapNode.create({
                data: {
                    id: gNode.id,
                    gameId: gameId,
                    x: gNode.x,
                    y: gNode.y,
                    z: gNode.z,
                    type: gNode.type,
                    roomSuit: gNode.roomSuit,
                    roomPower: gNode.roomPower,
                    security: 0,
                    isExplored: gNode.isExplored,
                    scanned: gNode.scanned,
                    connections: JSON.stringify(gNode.connections),
                    enemies: gNode.enemies,
                    loot: gNode.loot
                }
            });
        }

        const startNode = generatedNodes.find(n => n.type === "START")!;
        const bossNode = generatedNodes.find(n => n.type === "BOSS")!;

        // 4. Create Players & Deal Cards - NOW WITH NODE ID
        const roomDeck = DeckGenerator.generateDeck();

        // HOST RIGGING: Find 1 of COMMAND (lowest)
        const card3CIndex = roomDeck.findIndex((c: any) => c.rank === 1 && c.suit === "COMMAND");
        let card3C: any = null;
        if (card3CIndex !== -1) {
            card3C = roomDeck.splice(card3CIndex, 1)[0];
        }

        // Suit Value for sorting: COMMAND=1, PLASMA=2, BIOTECH=3, VOID=4
        // (Handled by CardRules now)

        const players = [];
        const getItemSlot = (item: any) => {
            if (item?.equipSlot) return item.equipSlot.toUpperCase();
            const type = (item?.type || "").toLowerCase();
            if (type === "weapon") return "WEAPON";
            if (type === "armor" || type.includes("suit")) return "ARMOR";
            return null;
        };
        const resolveUses = (invItem: any) => {
            const maxUses = invItem.usesMax ?? invItem.item?.maxUses ?? null;
            const remaining = invItem.usesRemaining ?? maxUses;
            return { maxUses, remaining };
        };
        for (const member of lobby.members) {
            const isHost = member.characterId === lobby.hostId;

            // Updated Hand Size: 10
            // If Host, give 9 + 3 of Clubs. Else 10.
            const handSize = (isHost && card3C) ? 9 : 10;
            const hand = roomDeck.splice(0, handSize);

            if (isHost && card3C) {
                hand.unshift(card3C); // Put 3 of Clubs at start
            }

            // Organize by Type (Suit) and Power
            CardRules.sortHand(hand);

            // Map Persistent Inventory
            const persistentInv = member.character.inventory || [];
            const equippedWeapon = persistentInv.find((invItem: any) => invItem.isEquipped && getItemSlot(invItem.item) === "WEAPON");
            const equippedArmor = persistentInv.find((invItem: any) => invItem.isEquipped && getItemSlot(invItem.item) === "ARMOR");
            const backpackLevel = member.character.backpackLevel ?? 1;
            const backpackCapacity = getBackpackCapacity(backpackLevel);
            const sessionInv: any[] = [];

            const consumeRunUse = async (invItem: any) => {
                const { maxUses, remaining } = resolveUses(invItem);
                if (!maxUses) return true;
                if (!remaining || remaining <= 0) {
                    await (prisma as any).inventoryItem.update({
                        where: { id: invItem.id },
                        data: { isEquipped: false }
                    });
                    return false;
                }
                const nextRemaining = Math.max(0, remaining - 1);
                await (prisma as any).inventoryItem.update({
                    where: { id: invItem.id },
                    data: {
                        usesRemaining: nextRemaining,
                        usesMax: maxUses
                    }
                });
                return true;
                return true;
            };

            const weaponUsable = equippedWeapon ? await consumeRunUse(equippedWeapon) : false;
            const armorUsable = equippedArmor ? await consumeRunUse(equippedArmor) : false;

            // V15 Fix: Populate sessionInv with persistent items
            // V18 Fix: Only populate sessionInv with EQUIPPED items.
            // "Everything else stays back at the pre-game".
            sessionInv.push(...persistentInv
                .filter((i: any) => i.isEquipped)
                .map((i: any) => ({
                    id: i.id,
                    name: i.item.name,
                    description: i.item.description,
                    qty: 1,
                    usesRemaining: i.usesRemaining,
                    usesMax: i.usesMax ?? i.item.maxUses, // V19: Pass max uses
                    type: (i.item.type || "").toLowerCase(),
                    isEquipped: true // Explicitly true since we filtered
                }))
            );

            const p = await (prisma as any).gamePlayer.create({
                data: {
                    id: crypto.randomUUID(),
                    gameId: gameId,
                    characterId: member.characterId,
                    nodeId: startNode.id, // Assign to Start Node
                    hp: 10,
                    maxHp: 10,
                    stress: 3,
                    ap: 3,
                    hand: JSON.stringify(hand),
                    inventory: JSON.stringify(sessionInv),
                    equippedWeaponId: weaponUsable ? equippedWeapon?.id || null : null,
                    equippedWeaponSuit: weaponUsable ? equippedWeapon?.item?.suit || null : null,
                    equippedArmorId: armorUsable ? equippedArmor?.id || null : null,
                    equippedArmorSuit: armorUsable ? equippedArmor?.item?.suit || null : null,
                    backpackLevel,
                    backpackCapacity,
                    updatedAt: new Date()
                },
                include: { Character: true }
            });
            players.push({ ...p, handCards: hand });
        }

        // 5. Determine Ordering (Low 3 Starts)
        // Find who has the 3 of Clubs (or lowest 3).
        // Powers: 3=3 ... 2=15.
        // Suits: Clubs < Diamonds < Hearts < Spades.
        // Target: Rank 3, Suit Clubs.
        let starterIndex = 0;
        let lowestCardValue = 999;

        players.forEach((p, idx) => {
            p.handCards.forEach((c: any) => {
                // We want the LOWEST Card.
                // 3 is Power 3.
                // Value = Power * 10 + SuitVal
                const val = CardRules.getCardPower(c);
                if (val < lowestCardValue) {
                    lowestCardValue = val;
                    starterIndex = idx;
                }
            });
        });

        // Calculate current depth from turn count (simplified)
        // Note: turnNumber is initialized from currentTurn above
        const turnNumber = 1; // First turn
        const currentDepth = Math.min(turnNumber, 10);

        // Construct Turn Order
        // Start with the starter, then round robin (no AI card turn; environment reacts in reaction phase)
        const turnOrder = players.map(p => p.characterId);

        // Adjust activePlayerIndex to point to the starter in the new list
        // Note: starterIndex is based on 'players' array, which matches turnOrder prefix.

        // Update GameState with remaining deck. Deadline is NULL (Starts on first card play).
        try {
            // Generate Objectives
            const objectives = [
                { id: "main-1", type: "MAIN", description: "Neutralize Station Core", target: 100, current: 0, isComplete: false },
                { id: "sub-1", type: "SUB", description: "Secure 5 Sectors", target: 5, current: 0, securedNodeIds: [], isComplete: false }
            ];

            await (prisma as any).gameState.update({
                where: { id: gameId },
                data: {
                    roomDeck: JSON.stringify(roomDeck),
                    deadline: null, // Timer paused
                    objectiveNodeId: bossNode.id,
                    turnOrder: JSON.stringify(turnOrder), // Save the correct order with AI
                    objectives: JSON.stringify(objectives)
                }
            });
        } catch (e) {
            console.error("CRITICAL: Failed to update GameState with deck/deadline:", e);
            throw e; // Rethrow to fail start
        }

        return gameId;
    }
}
