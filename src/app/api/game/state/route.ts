import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClassSuit } from "@/lib/game/classSuit";
import { getBackpackCapacity } from "@/lib/game/backpack";

function parseJSON(raw: any, fallback: any) {
    try { return JSON.parse(raw); } catch { return fallback; }
}

const suitOpposites: Record<string, string> = { COMMAND: "VOID", VOID: "COMMAND", BIOTECH: "PLASMA", PLASMA: "BIOTECH" };
const computeBasePool = (count: number) => 3 + Math.max(0, count - 1);
const normalizeSuit = (suit?: string | null) => (suit || "").toUpperCase();

type SuitContext = { playerClass?: string | null; weaponSuit?: string | null; armorSuit?: string | null };

const getPlayerSuitBonus = (cardSuit: string, ctx?: SuitContext) => {
    if (!cardSuit) return 0;
    let bonus = 0;
    const classSuit = normalizeSuit(getClassSuit(ctx?.playerClass || undefined));
    if (classSuit && cardSuit === classSuit) bonus += 1;
    const weaponSuit = normalizeSuit(ctx?.weaponSuit);
    if (weaponSuit && cardSuit === weaponSuit) bonus += 1;
    const armorSuit = normalizeSuit(ctx?.armorSuit);
    if (armorSuit && cardSuit === armorSuit) bonus += 1;
    return bonus;
};

const getBackpackCapacityForPlayer = (player: any) => {
    if (typeof player?.backpackCapacity === "number") return player.backpackCapacity;
    return getBackpackCapacity(player?.backpackLevel ?? 1);
};

const getSlotsUsed = (inv: any[]) => inv.reduce((sum, item) => sum + (item?.slotSize || 1), 0);

function cardStrength(cards: any[], roomSuit?: string, integrity?: number, ctx?: SuitContext) {
    const normalizedRoomSuit = normalizeSuit(roomSuit);
    const modForSuit = (suit: string) => {
        if (normalizedRoomSuit && suit === normalizedRoomSuit) return 1;
        if (normalizedRoomSuit && suitOpposites[suit] === normalizedRoomSuit) return -1;
        return 0;
    };
    const integrityMod = integrity && integrity < 50 ? -1 : 0;
    return cards.reduce((sum, c) => {
        const cardSuit = normalizeSuit(c.suit || c.suitName);
        const mod = modForSuit(cardSuit);
        const bonus = getPlayerSuitBonus(cardSuit, ctx);
        const base = c.power || c.rank || 0;
        return sum + base + mod + bonus;
    }, integrityMod);
}

type Facing = "NORTH" | "EAST" | "SOUTH" | "WEST";

const forwardVectors: Record<Facing, { x: number; y: number }> = {
    NORTH: { x: 0, y: 1 },
    EAST: { x: 1, y: 0 },
    SOUTH: { x: 0, y: -1 },
    WEST: { x: -1, y: 0 }
};

const turnLeft = (facing: Facing): Facing => {
    switch (facing) {
        case "NORTH": return "WEST";
        case "WEST": return "SOUTH";
        case "SOUTH": return "EAST";
        case "EAST": return "NORTH";
        default: return "NORTH";
    }
};

const turnRight = (facing: Facing): Facing => {
    switch (facing) {
        case "NORTH": return "EAST";
        case "EAST": return "SOUTH";
        case "SOUTH": return "WEST";
        case "WEST": return "NORTH";
        default: return "NORTH";
    }
};

const resolveMove = (direction: string, facing: Facing) => {
    let dx = 0;
    let dy = 0;
    let dz = 0;
    let newFacing = facing;

    if (direction === "LEFT") {
        newFacing = turnLeft(facing);
        const vec = forwardVectors[newFacing];
        dx = vec.x;
        dy = vec.y;
    } else if (direction === "RIGHT") {
        newFacing = turnRight(facing);
        const vec = forwardVectors[newFacing];
        dx = vec.x;
        dy = vec.y;
    } else if (direction === "BACK") {
        const vec = forwardVectors[facing];
        dx = -vec.x;
        dy = -vec.y;
    } else if (direction === "UP") {
        dz = 1;
    } else if (direction === "DOWN") {
        dz = -1;
    } else {
        const vec = forwardVectors[facing];
        dx = vec.x;
        dy = vec.y;
    }

    return { dx, dy, dz, newFacing };
};

const vectorToDirection = (dx: number, dy: number, dz: number) => {
    if (dz === 1) return "UP";
    if (dz === -1) return "DOWN";
    if (dx === 1) return "RIGHT";
    if (dx === -1) return "LEFT";
    if (dy === 1) return "FORWARD";
    if (dy === -1) return "BACK";
    return null;
};

async function autoProgress(gameState: any) {
    // Only resolve when the action deadline has expired.
    if (gameState.roundPhase !== "ACTION") return;
    const pending = parseJSON(gameState.pendingActions || "[]", []);
    const deadline = gameState.actionDeadline ? new Date(gameState.actionDeadline).getTime() : null;
    if (!deadline || deadline > Date.now()) return; // Timer not started or still running
    if (pending.length === 0) return; // Nothing to resolve

    const players = await (prisma as any).gamePlayer.findMany({
        where: { gameId: gameState.id },
        include: { MapNode: true, Character: true }
    });

    let updatedPending = [...pending];
    let sharedAp = gameState.sharedAp || 0;

    // Auto-lock defaults for any missing players once the timer is up.
    const lockedIds = new Set(updatedPending.map((p: any) => p.playerId));
    for (const p of players) {
        if (lockedIds.has(p.characterId)) continue;
        const hand = parseJSON(p.hand || "[]", []);
        if (!hand.length) continue;
        const autoCard = [...hand].sort((a: any, b: any) => (a.power || a.rank || 0) - (b.power || b.rank || 0))[0];
        const newHand = hand.filter((c: any) => c.id !== autoCard.id);
        await (prisma as any).gamePlayer.update({ where: { id: p.id }, data: { hand: JSON.stringify(newHand) } });
        updatedPending.push({ playerId: p.characterId, intent: "SCAN", cards: [autoCard], auto: true });
        sharedAp = Math.max(0, sharedAp - 1);
    }

    const logs: any[] = [];
    const updates: Promise<any>[] = [];
    const nowTs = Date.now();
    let lobbyDifficulty = gameState?.GameLobby?.difficulty as string | undefined;
    if (!lobbyDifficulty && gameState?.lobbyId) {
        const lobby = await (prisma as any).gameLobby.findUnique({ where: { id: gameState.lobbyId } });
        lobbyDifficulty = lobby?.difficulty || "NORMAL";
    }
    let startedDeadline: Date | null = null;
    let nextIntegrity = gameState.integrity ?? 100;
    let phaseOverride: "VICTORY" | null = null;
    const objectives = parseJSON(gameState.objectives || "[]", []);
    const secureObjective = objectives.find((o: any) => o.id === "sub-1" || /secure/i.test(o.description || ""));
    const mainObjective = objectives.find((o: any) => o.id === "main-1" || /core|station|boss/i.test(o.description || ""));
    const securedNodeIds = new Set<string>(secureObjective?.securedNodeIds || []);

    // Group by node for scans
    const scansByNode = new Map<string, any[]>();
    updatedPending.filter(p => p.intent === "SCAN").forEach(p => {
        const pl = players.find((x: any) => x.characterId === p.playerId);
        if (!pl?.MapNode) return;
        const nid = pl.MapNode.id;
        scansByNode.set(nid, [...(scansByNode.get(nid) || []), p]);
    });

    for (const [nodeId, scans] of scansByNode.entries()) {
        const nodePlayers = scans.map((a: any) => players.find((p: any) => p.characterId === a.playerId)).filter(Boolean) as any[];
        if (!nodePlayers.length) continue;
        const node = nodePlayers[0].MapNode;
        const nodePower = node.roomPower || 0;

        const strengths = scans.map((a: any) => ({
            action: a,
            strength: cardStrength(a.cards, node.roomSuit, node.integrity, {
                playerClass: players.find((p: any) => p.characterId === a.playerId)?.Character?.class,
                weaponSuit: players.find((p: any) => p.characterId === a.playerId)?.equippedWeaponSuit,
                armorSuit: players.find((p: any) => p.characterId === a.playerId)?.equippedArmorSuit
            }),
            rank: a.cards[0]?.rank || 0
        })).sort((a, b) => b.strength - a.strength);

        let best = strengths[0];
        if (strengths.length >= 2 && strengths[0].rank === strengths[1].rank) {
            best = { ...strengths[0], strength: strengths[0].strength + strengths[1].strength };
        }

        const integrityPenalty = node.integrity < 50 ? -2 : 0;
        const effectiveStrength = (best?.strength || 0) + integrityPenalty;
        const success = effectiveStrength >= nodePower;
        const newIntegrity = success ? Math.min(100, (node.integrity || 100) + 5) : Math.max(0, (node.integrity || 100) - 5);

        updates.push((prisma as any).mapNode.update({
            where: { id: nodeId },
            data: {
                scanned: true,
                isExplored: true,
                integrity: newIntegrity,
                roomPower: success ? nodePower : nodePower + 1,
                security: success ? Math.max(node.security || 0, 1) : Math.max(0, (node.security || 0) - 1),
                secretPaths: success && (best?.strength || 0) >= nodePower + 4 ? JSON.stringify([{ to: "BOSS" }]) : JSON.stringify(parseJSON(node.secretPaths || "[]", []))
            }
        }));
        const winnerPlayer = players.find((p: any) => p.characterId === best?.action?.playerId);
        const winnerName = winnerPlayer?.Character?.name || "Unknown";
        if (success && winnerPlayer) {
            const inv = parseJSON(winnerPlayer.inventory || "[]", []);
            const capacity = getBackpackCapacityForPlayer(winnerPlayer);
            const slotSize = 1;
            if (getSlotsUsed(inv) + slotSize <= capacity) {
                inv.push({ id: `loot-${nowTs}`, name: "Recovered Tech", type: "LOOT", qty: 1, slotSize, description: "Scan reward" });
                updates.push((prisma as any).gamePlayer.update({ where: { id: winnerPlayer.id }, data: { inventory: JSON.stringify(inv) } }));
                logs.push({ ts: nowTs, type: "LOOT", message: `${winnerName} recovered tech from the scan.` });
            } else {
                logs.push({ ts: nowTs, type: "LOOT", message: `${winnerName} found loot but the backpack is full.` });
            }
        }
        logs.push({ ts: nowTs, type: "SCAN", message: `${winnerName} scanned ${node.roomSuit} room (P${nodePower}): ${success ? "SUCCESS" : "FAIL"}` });
        if (success && (best?.strength || 0) >= nodePower + 4) {
            logs.push({ ts: nowTs, type: "SCAN", message: `Secret tunnel mapped near ${node.roomSuit} sector.` });
        }
    }

    for (const action of updatedPending.filter((a: any) => a.intent !== "SCAN")) {
        const player = players.find((p: any) => p.characterId === action.playerId);
        if (!player?.MapNode) continue;
        const node = player.MapNode;
        const nodePower = node.roomPower || 0;
        const strength = cardStrength(action.cards, node.roomSuit, node.integrity, {
            playerClass: player?.Character?.class,
            weaponSuit: player?.equippedWeaponSuit,
            armorSuit: player?.equippedArmorSuit
        });
        const success = strength >= nodePower;
        const playerName = player.Character?.name || "Unknown";

        if (action.intent === "SECURE") {
            const newIntegrity = Math.min(100, (node.integrity || 100) + (success ? 15 : 0));
            updates.push((prisma as any).mapNode.update({
                where: { id: node.id },
                data: {
                    security: success ? Math.max(node.security || 0, strength) : node.security,
                    integrity: success ? newIntegrity : Math.max(0, (node.integrity || 100) - 5),
                    scanned: true,
                    isExplored: true
                }
            }));
            logs.push({ ts: nowTs, type: "SECURE", message: `${playerName} secured ${node.roomSuit} room: ${success ? "STABLE" : "UNSTABLE"}` });
            if (success && secureObjective && !securedNodeIds.has(node.id)) {
                securedNodeIds.add(node.id);
                const target = typeof secureObjective.target === "number" ? secureObjective.target : 5;
                secureObjective.current = securedNodeIds.size;
                secureObjective.target = target;
                secureObjective.securedNodeIds = Array.from(securedNodeIds);
                secureObjective.isComplete = secureObjective.current >= target;
            }
        } else if (action.intent === "ATTACK") {
            if (success) {
                if (node.type === "BOSS") {
                    const isAnomaly = (action.cards || []).some((c: any) => (c.suit || c.suitName) === "ANOMALY" || c.rank === 99);
                    const damage = isAnomaly ? 99 : 10;
                    nextIntegrity = Math.max(0, nextIntegrity - damage);
                    logs.push({ ts: nowTs, type: "ATTACK", message: `${playerName} struck the core: -${damage} integrity.` });
                    if (mainObjective) {
                        const target = typeof mainObjective.target === "number" ? mainObjective.target : 100;
                        mainObjective.target = target;
                        mainObjective.current = Math.max(0, target - nextIntegrity);
                        mainObjective.isComplete = nextIntegrity <= 0;
                        if (mainObjective.isComplete) {
                            logs.push({ ts: nowTs, type: "MAIN", message: "Core neutralized. Return to airlock for extraction." });
                        }
                    }
                } else {
                    logs.push({ ts: nowTs, type: "ATTACK", message: `${playerName} neutralized nearby hostiles.` });
                }
            } else {
                logs.push({ ts: nowTs, type: "ATTACK", message: `${playerName} attack faltered: NO EFFECT` });
            }
        } else if (action.intent === "MOVE") {
            const emergencyMove = Boolean(action.emergency);
            const facing = (player.facing || "NORTH") as Facing;
            const nodeConnections = parseJSON(node.connections || "[]", []);
            const candidateDirections = emergencyMove ? ["BACK", "LEFT", "RIGHT", "FORWARD"] : [action.direction || "FORWARD"];
            let moveResult: { target: any; newFacing: Facing; direction: string } | null = null;

            if (!emergencyMove && !node.scanned && node.type !== "START") {
                logs.push({ ts: nowTs, type: "MOVE", message: `${playerName} attempted to move but the room is unscanned.` });
                continue;
            }

            for (const dir of candidateDirections) {
                const { dx, dy, dz, newFacing } = resolveMove(dir, facing);
                const absDir = vectorToDirection(dx, dy, dz);
                if (absDir && !nodeConnections.includes(absDir)) continue;

                const target = await (prisma as any).mapNode.findFirst({
                    where: { gameId: gameState.id, x: node.x + dx, y: node.y + dy, z: node.z + dz }
                });
                if (!target) continue;
                if (emergencyMove && !target.scanned && target.type !== "START") continue;

                moveResult = { target, newFacing, direction: dir };
                break;
            }

            if (!moveResult) {
                logs.push({ ts: nowTs, type: "MOVE", message: `${playerName} could not find a safe escape route.` });
                continue;
            }

            if (emergencyMove) {
                const nextHp = Math.max(0, (player.hp ?? 0) - 1);
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { hp: nextHp } }));
                player.hp = nextHp;
                logs.push({ ts: nowTs, type: "MOVE", message: `${playerName} triggered emergency escape: -1 HP.` });
            }

            if ((node.security ?? 0) < 1) {
                const nextStress = Math.max(0, (player.stress ?? 0) - 1);
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { stress: nextStress } }));
                player.stress = nextStress;
                logs.push({ ts: nowTs, type: "MOVE", message: `${playerName} left an unsecured room: -1 energy.` });
            }

            updates.push((prisma as any).mapNode.update({
                where: { id: moveResult.target.id },
                data: { isExplored: true }
            }));
            updates.push((prisma as any).gamePlayer.update({
                where: { id: player.id },
                data: { nodeId: moveResult.target.id, facing: moveResult.newFacing }
            }));
            player.MapNode = moveResult.target;
            player.nodeId = moveResult.target.id;
            player.facing = moveResult.newFacing;
            logs.push({ ts: nowTs, type: "MOVE", message: `${playerName} moved ${moveResult.direction}.` });

            if (!gameState.deadline && !startedDeadline) {
                const diff = lobbyDifficulty || "NORMAL";
                const minutes = diff === "HARD" ? 10 : diff === "EASY" ? 20 : 15;
                startedDeadline = new Date(Date.now() + minutes * 60000);
            }
        }
    }

    await Promise.all(updates);

    if (mainObjective?.isComplete && players.every((p: any) => p.MapNode?.type === "START")) {
        phaseOverride = "VICTORY";
        logs.push({ ts: nowTs, type: "MAIN", message: "Squad extracted. Mission complete." });
    }

    const basePool = computeBasePool(players.length);
    await (prisma as any).gameState.update({
        where: { id: gameState.id },
        data: {
            roundPhase: phaseOverride ?? "DRAW",
            phase: phaseOverride ?? "DRAW",
            integrity: nextIntegrity,
            objectives: JSON.stringify(objectives),
            sharedAp: basePool,
            sharedApMax: basePool,
            pendingActions: "[]",
            actionDeadline: null,
            deadline: startedDeadline ?? gameState.deadline,
            gameLog: JSON.stringify([...(parseJSON(gameState.gameLog || "[]", [])), ...logs].slice(-50))
        }
    });
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get("gameId");

    if (!gameId) return NextResponse.json({ error: "Missing gameId" }, { status: 400 });

    try {
        let gameState = await (prisma as any).gameState.findUnique({
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

        await autoProgress(gameState);
        // refetch after auto progression
        gameState = await (prisma as any).gameState.findUnique({
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

        // CORRUPTION CHECK: Partial Initialization
        if (gameState.GamePlayer.length === 0) {
            return NextResponse.json({ error: "Game Corrupted: Initialization Failed. Please create a new lobby." }, { status: 410 });
        }

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
                character: p.Character,
                nodeId: p.nodeId,
                node: p.MapNode ? {
                    id: p.MapNode.id,
                    x: p.MapNode.x,
                    y: p.MapNode.y,
                    z: p.MapNode.z,
                    type: p.MapNode.type
                } : null,
                facing: p.facing
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

        // Construct Response
        return NextResponse.json({
            game: {
                ...gameState,
                turnOrder: parsedTurnOrder, // Ensure array
                gameLog: parseJSON(gameState.gameLog || "[]", [])
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
