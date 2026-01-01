import { prisma } from "@/lib/prisma";
import { DeckGenerator, CardRules } from "./cards";

export class GameEngine {
    static async initializeGame(lobbyId: string) {
        // 1. Get Lobby & Members
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
        // Starting in DRAW phase for the first round.
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

        // 3. Generate 3x3x3 Cube Map (Level 1)
        const nodes = [];
        const SIZE = 3; // 3x3x3 Cube
        const suits: ("COMMAND" | "VOID" | "BIOTECH" | "PLASMA")[] = ["COMMAND", "BIOTECH", "PLASMA", "VOID"];
        const startCoord = { x: 1, y: -1, z: 0 };

        // MANUALLY ADD START NODE (Outside Cube at 1, -1, 0)
        nodes.push({
            id: crypto.randomUUID(),
            gameId: gameId,
            x: startCoord.x, y: startCoord.y, z: startCoord.z,
            type: "START",
            isExplored: true,
            connections: JSON.stringify(["FORWARD"]), // Into the cube
            roomSuit: "COMMAND",
            roomPower: 2,
            security: 1,
            enemies: "[]",
            loot: "[]"
        });

        // Procedural Generation: 3D Grid
        for (let z = 0; z < SIZE; z++) {
            for (let y = 0; y < SIZE; y++) {
                for (let x = 0; x < SIZE; x++) {
                    const isBoss = (x === 1 && y === 2 && z === 2); // Top North Center

                    // Logic for Node 1,0,0 (Entry Point)
                    const isEntry = (x === 1 && y === 0 && z === 0);

                    let type = "EMPTY";
                    if (isBoss) type = "BOSS";
                    else {
                        const rand = Math.random();
                        if (rand > 0.8) type = "LOOT";
                        else if (rand > 0.6) type = "ENEMY"; // Increased Enemy density
                        else if (rand > 0.5) type = "TRAP";
                    }

                    const conns = [];
                    // Grid Connections
                    if (x < SIZE - 1) conns.push("RIGHT");
                    if (x > 0) conns.push("LEFT");
                    if (y < SIZE - 1) conns.push("FORWARD");
                    if (y > 0) conns.push("BACK");
                    if (z < SIZE - 1) conns.push("UP");
                    if (z > 0) conns.push("DOWN");

                    // Connect Entry to Start
                    if (isEntry) conns.push("BACK");

                    const distance = Math.abs(x - startCoord.x) + Math.abs(y - startCoord.y) + Math.abs(z - startCoord.z);
                    const roomPower = Math.min(15, 3 + distance * 2); // harder deeper in
                    const suitIdx = Math.abs(x + y + z) % suits.length;

                    nodes.push({
                        id: crypto.randomUUID(),
                        gameId: gameId,
                        x, y, z,
                        type,
                        roomSuit: suits[suitIdx],
                        roomPower,
                        security: 0,
                        isExplored: false, // Fog of War
                        connections: JSON.stringify(conns),
                        enemies: "[]",
                        loot: "[]"
                    });
                }
            }
        }

        // Batch create nodes
        for (const node of nodes) {
            await (prisma as any).mapNode.create({ data: node });
        }

        // Identify Key Nodes
        const startNode = nodes.find(n => n.type === "START")!;
        const bossNode = nodes.find(n => n.type === "BOSS")!;

        // 4. Create Players & Deal Cards - NOW WITH NODE ID
        const roomDeck = DeckGenerator.generateDeck();

        // HOST RIGGING: Find 3 of COMMAND (Clubs)
        const card3CIndex = roomDeck.findIndex((c: any) => c.power === 3 && c.suit === "COMMAND");
        let card3C: any = null;
        if (card3CIndex !== -1) {
            card3C = roomDeck.splice(card3CIndex, 1)[0];
        }

        // Suit Value for sorting: COMMAND=1, PLASMA=2, BIOTECH=3, VOID=4
        // (Handled by CardRules now)

        const players = [];
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
            const sessionInv = persistentInv.map((invItem: any) => ({
                id: invItem.id,
                itemId: invItem.itemId,
                name: invItem.item.name,
                type: invItem.item.type,
                qty: invItem.quantity,
                description: invItem.item.description
            }));

            const p = await (prisma as any).gamePlayer.create({
                data: {
                    id: crypto.randomUUID(),
                    gameId: gameId,
                    characterId: member.characterId,
                    nodeId: startNode.id, // Assign to Start Node
                    hp: 10,
                    maxHp: 10,
                    ap: 3,
                    hand: JSON.stringify(hand),
                    inventory: JSON.stringify(sessionInv),
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

        // Construct Turn Order
        // Start with the starter, then round robin (no AI card turn; environment reacts in reaction phase)
        const turnOrder = players.map(p => p.characterId);

        // Adjust activePlayerIndex to point to the starter in the new list
        // Note: starterIndex is based on 'players' array, which matches turnOrder prefix.

        // Update GameState with remaining deck. Deadline is NULL (Starts on first card play).
        try {
            // Generate Objectives
            const objectives = [
                { id: "main-1", type: "MAIN", description: "Neutralize Station Core", target: "BOSS", isComplete: false },
                { id: "sub-1", type: "SUB", description: "Secure 5 Sectors", target: 5, current: 1, isComplete: false }
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

            // Kick off first draw -> action window immediately
            const livePlayers = await (prisma as any).gamePlayer.findMany({ where: { gameId } });
            let deck = roomDeck;
            for (const p of livePlayers) {
                if (deck.length === 0) break;
                const hand = JSON.parse(p.hand || "[]");
                hand.push(deck.shift());
                await (prisma as any).gamePlayer.update({
                    where: { id: p.id },
                    data: { hand: JSON.stringify(hand) }
                });
            }
            const actionPool = baseApPool + livePlayers.length; // base + 1 per draw participant
            await (prisma as any).gameState.update({
                where: { id: gameId },
                data: {
                    roomDeck: JSON.stringify(deck),
                    phase: "ACTION",
                    roundPhase: "ACTION",
                    sharedAp: actionPool,
                    sharedApMax: actionPool,
                    pendingActions: "[]",
                    actionDeadline: new Date(Date.now() + 15_000)
                }
            });
        } catch (e) {
            console.error("CRITICAL: Failed to update GameState with deck/deadline:", e);
            throw e; // Rethrow to fail start
        }

        return gameId;
    }
}
