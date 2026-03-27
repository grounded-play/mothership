import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CardRules } from "@/lib/game/cards";
import { getClassSuit } from "@/lib/game/classSuit";
import { getBackpackCapacity } from "@/lib/game/backpack";

type PendingAction = {
    playerId: string;
    intent: "SCAN" | "SECURE" | "MOVE" | "ATTACK";
    cards: any[];
    direction?: string | null;
    auto?: boolean;
    emergency?: boolean;
};

type LogEntry = { ts: number; type: string; message: string };

const ACTION_WINDOW_MS = 15_000;
const computeBasePool = (count: number) => 3 + Math.max(0, count - 1); // base 3, +1 per extra player
const suitOpposites: Record<string, string> = { COMMAND: "VOID", VOID: "COMMAND", BIOTECH: "PLASMA", PLASMA: "BIOTECH" };

const normalizeSuit = (suit?: string | null) => (suit || "").toUpperCase();

function parseJSON(raw: any, fallback: any) {
    try { return JSON.parse(raw); } catch { return fallback; }
}

function parsePending(raw: any): PendingAction[] {
    return parseJSON(raw || "[]", []);
}

function lowestCard(hand: any[]) {
    if (!hand || hand.length === 0) return null;
    const sorted = [...hand].sort((a, b) => CardRules.getCardPower(a) - CardRules.getCardPower(b));
    return sorted[0];
}

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

// V20/V22: Enhanced Combat Synergy & Breakdown
function cardStrength(cards: any[], roomSuit?: string, integrity?: number, ctx?: SuitContext) {
    const normalizedRoomSuit = normalizeSuit(roomSuit);
    const integrityMod = integrity && integrity < 50 ? -1 : 0;

    // V22: Breakdown Tracking
    const breakdown = {
        base: 0,
        weapon: 0,
        classMod: 0,
        roomMod: 0,
        integrity: integrityMod,
        total: 0
    };

    const total = cards.reduce((sum, c) => {
        const cardSuit = normalizeSuit(c.suit || c.suitName);
        let bonus = 0;

        // 1. Base Power
        const base = c.power || c.rank || 0;
        breakdown.base += base;

        // 2. Weapon Match (Card == Weapon)
        // Note: ctx.weaponSuit is the suit of the EQUIPPED WEAPON
        const weaponSuit = normalizeSuit(ctx?.weaponSuit);
        if (weaponSuit && cardSuit === weaponSuit) {
            bonus += 1;
            breakdown.weapon += 1;
        }

        // 3. Class Match (Weapon == Class)
        const classSuit = normalizeSuit(getClassSuit(ctx?.playerClass || undefined));
        if (classSuit && weaponSuit && classSuit === weaponSuit) {
            bonus += 1;
            breakdown.classMod += 1;
        }

        // 4. Room Synergy
        if (normalizedRoomSuit) {
            if (cardSuit === normalizedRoomSuit) {
                bonus += 1;
                breakdown.roomMod += 1;
            } else if (suitOpposites[cardSuit] === normalizedRoomSuit) {
                bonus -= 1;
                breakdown.roomMod -= 1;
            }
        }

        return sum + base + bonus;
    }, integrityMod);

    breakdown.total = total;
    return { strength: total, breakdown };
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
    let dx = 0, dy = 0, dz = 0;
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

type HallwayIntel = {
    direction: string;
    distance: number;
    endpointType: string;
    turns: number;
    intersections: number;
    branches: number;
    truncated: boolean;
    certainty: "LOW" | "MED" | "HIGH";
};

const directionVectors: Record<string, { x: number; y: number; z: number }> = {
    FORWARD: { x: 0, y: 1, z: 0 },
    BACK: { x: 0, y: -1, z: 0 },
    LEFT: { x: -1, y: 0, z: 0 },
    RIGHT: { x: 1, y: 0, z: 0 },
    UP: { x: 0, y: 0, z: 1 },
    DOWN: { x: 0, y: 0, z: -1 }
};
const oppositeDirections: Record<string, string> = {
    FORWARD: "BACK",
    BACK: "FORWARD",
    LEFT: "RIGHT",
    RIGHT: "LEFT",
    UP: "DOWN",
    DOWN: "UP"
};

const parseSecretIntel = (raw: any) => {
    const parsed = parseJSON(raw || "{}", {});
    if (Array.isArray(parsed)) {
        return { leads: parsed, hallwayIntel: [] as HallwayIntel[], hallwayScanDepth: 0, hallwayStops: 0 };
    }
    if (!parsed || typeof parsed !== "object") {
        return { leads: [] as any[], hallwayIntel: [] as HallwayIntel[], hallwayScanDepth: 0, hallwayStops: 0 };
    }
    return {
        ...parsed,
        leads: Array.isArray(parsed.leads) ? parsed.leads : [],
        hallwayIntel: Array.isArray(parsed.hallwayIntel) ? parsed.hallwayIntel : [],
        hallwayScanDepth: typeof parsed.hallwayScanDepth === "number" ? parsed.hallwayScanDepth : 0,
        hallwayStops: typeof parsed.hallwayStops === "number" ? parsed.hallwayStops : 0
    };
};

const isHallwayNode = (node: any) => node?.type === "CORRIDOR" || node?.type === "HUB";
const isSecureObjectiveNode = (node: any) => !!node?.type && !isHallwayNode(node) && node.type !== "START";
const getSecureTargetLabel = (node: any) => {
    if (node?.type === "START") return "airlock";
    if (node?.type === "HUB") return "junction";
    if (node?.type === "CORRIDOR") return "hallway";
    return `${node?.roomSuit || "UNKNOWN"} room`;
};

const nodeCoordKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

const directionToFacing = (direction: string, fallback: Facing): Facing => {
    switch (direction) {
        case "FORWARD": return "NORTH";
        case "RIGHT": return "EAST";
        case "BACK": return "SOUTH";
        case "LEFT": return "WEST";
        default: return fallback;
    }
};

const getConnectedNode = (node: any, direction: string, nodeByCoord: Map<string, any>) => {
    const delta = directionVectors[direction];
    if (!delta) return null;
    return nodeByCoord.get(nodeCoordKey(Number(node.x) + delta.x, Number(node.y) + delta.y, Number(node.z) + delta.z)) || null;
};

const getViableConnections = (node: any, nodeByCoord: Map<string, any>) => {
    const connections = parseJSON(node?.connections || "[]", []);
    return connections.filter((candidate: string) => {
        const delta = directionVectors[candidate];
        if (!delta) return false;
        return nodeByCoord.has(nodeCoordKey(Number(node.x) + delta.x, Number(node.y) + delta.y, Number(node.z) + delta.z));
    });
};

const getMoveCardDistance = (cards: any[]) => {
    if (!Array.isArray(cards) || cards.length === 0) return 1;
    return Math.max(1, ...cards.map((card: any) => {
        const power = Number(CardRules.getCardPower(card) ?? card?.power ?? card?.rank ?? 1);
        return Number.isFinite(power) ? power : 1;
    }));
};

const getVisibleMoveBudget = (startNode: any, direction: string, requestedDistance: number) => {
    if (startNode?.type === "START") return Math.max(1, requestedDistance);

    const secretIntel = parseSecretIntel(startNode?.secretPaths);
    const matchingIntel = (secretIntel.hallwayIntel || []).find((entry: HallwayIntel) => entry.direction === direction);
    if (!matchingIntel) {
        return Math.min(Math.max(1, requestedDistance), 1);
    }

    const revealedDistance = Math.max(1, Number(matchingIntel.distance || 1));
    return Math.min(Math.max(1, requestedDistance), revealedDistance);
};

function traverseMovePath(params: {
    startNode: any;
    firstDirection: string;
    initialFacing: Facing;
    stepBudget: number;
    nodeByCoord: Map<string, any>;
}) {
    const { startNode, firstDirection, initialFacing, stepBudget, nodeByCoord } = params;
    const path: any[] = [];
    let current = startNode;
    let currentDirection = firstDirection;
    let currentFacing = directionToFacing(firstDirection, initialFacing);
    let hallwaySteps = 0;
    let steps = 0;

    while (steps < stepBudget) {
        const nextNode = getConnectedNode(current, currentDirection, nodeByCoord);
        if (!nextNode) break;

        path.push(nextNode);
        steps += 1;
        if (current.type === "CORRIDOR" || nextNode.type === "CORRIDOR") {
            hallwaySteps += 1;
        }

        current = nextNode;
        currentFacing = directionToFacing(currentDirection, currentFacing);

        if (current.type !== "CORRIDOR") break;
        if (steps >= stepBudget) break;

        const onward = getViableConnections(current, nodeByCoord).filter((candidate: string) => candidate !== oppositeDirections[currentDirection]);
        if (onward.length !== 1) break;
        currentDirection = onward[0];
    }

    return {
        target: current,
        newFacing: currentFacing,
        direction: firstDirection,
        steps,
        hallwaySteps,
        path
    };
}

function buildHallwayIntel(node: any, nodeByCoord: Map<string, any>, scanDepth: number): HallwayIntel[] {
    const connections = parseJSON(node?.connections || "[]", []);
    return connections.map((direction: string) => {
        let current = node;
        let currentDirection = direction;
        let distance = 0;
        let turns = 0;
        let intersections = 0;
        let branches = 0;
        let endpointType = "VOID";
        let truncated = false;

        while (distance < scanDepth) {
            const delta = directionVectors[currentDirection];
            if (!delta) break;

            const nextNode = nodeByCoord.get(nodeCoordKey(current.x + delta.x, current.y + delta.y, current.z + delta.z));
            if (!nextNode) {
                endpointType = "VOID";
                break;
            }

            distance += 1;
            endpointType = nextNode.type;

            const nextConnections = parseJSON(nextNode.connections || "[]", []).filter((candidate: string) => {
                const candidateDelta = directionVectors[candidate];
                if (!candidateDelta) return false;
                return nodeByCoord.has(nodeCoordKey(nextNode.x + candidateDelta.x, nextNode.y + candidateDelta.y, nextNode.z + candidateDelta.z));
            });
            const viableOptions = nextConnections.filter((candidate: string) => candidate !== oppositeDirections[currentDirection]);

            if (viableOptions.length > 1) {
                intersections += 1;
                branches += viableOptions.length - 1;
            }

            if (nextNode.type !== "CORRIDOR" || viableOptions.length !== 1) {
                break;
            }

            const nextDirection = viableOptions[0];
            if (nextDirection !== currentDirection) turns += 1;
            currentDirection = nextDirection;
            current = nextNode;
        }

        if (distance >= scanDepth && endpointType === "CORRIDOR") {
            truncated = true;
        }

        return {
            direction,
            distance,
            endpointType,
            turns,
            intersections,
            branches,
            truncated,
            certainty: scanDepth >= 6 ? "HIGH" : scanDepth >= 4 ? "MED" : "LOW"
        };
    });
}

async function appendLog(gameId: string, existing: any, entries: LogEntry[]) {
    const log = parseJSON(existing, []) as LogEntry[];
    const merged = [...log, ...entries].slice(-50);
    await (prisma as any).gameState.update({
        where: { id: gameId },
        data: { gameLog: JSON.stringify(merged) }
    });
}

async function beginActionPhase(gameState: any) {
    return await (prisma as any).$transaction(async (tx: any) => {
        const gate = await tx.gameState.updateMany({
            where: { id: gameState.id, roundPhase: "DRAW" },
            data: { roundPhase: "ACTION", phase: "ACTION" }
        });

        if (gate.count === 0) {
            return tx.gameState.findUnique({ where: { id: gameState.id } });
        }

        const players = await tx.gamePlayer.findMany({
            where: { gameId: gameState.id },
            include: { MapNode: true }
        });

        const freshState = await tx.gameState.findUnique({ where: { id: gameState.id } });
        let deck = parseJSON(freshState?.roomDeck || "[]", []);

        // Draw 1 card for every player and prep AP pool (+1 AP per player on draw)
        for (const p of players) {
            const hand = parseJSON(p.hand || "[]", []);
            if (deck.length > 0) {
                hand.push(deck.shift());
                CardRules.sortHand(hand);
            }
            await tx.gamePlayer.update({
                where: { id: p.id },
                data: { hand: JSON.stringify(hand) }
            });
        }

        const basePool = computeBasePool(players.length) + players.length;
        const updated = await tx.gameState.update({
            where: { id: gameState.id },
            data: {
                roundPhase: "ACTION",
                phase: "ACTION",
                sharedApMax: basePool,
                sharedAp: basePool,
                roomDeck: JSON.stringify(deck),
                pendingActions: "[]",
                actionDeadline: null
            }
        });

        return updated;
    });
}

async function resolveReaction(gameState: any, players: any[], pending: PendingAction[]) {
    const logs: LogEntry[] = [];
    const updates: Promise<any>[] = [];
    const now = Date.now();
    let lobbyDifficulty = gameState?.GameLobby?.difficulty as string | undefined;
    if (!lobbyDifficulty && gameState?.lobbyId) {
        const lobby = await (prisma as any).gameLobby.findUnique({ where: { id: gameState.lobbyId } });
        lobbyDifficulty = lobby?.difficulty || "NORMAL";
    }
    let startedDeadline: Date | null = null;
    let nextIntegrity = gameState.integrity ?? 100;
    let phaseOverride: string | null = null;
    const objectives = parseJSON(gameState.objectives || "[]", []);
    const secureObjective = objectives.find((o: any) => o.id === "sub-1" || /secure/i.test(o.description || ""));
    const mainObjective = objectives.find((o: any) => o.id === "main-1" || /core|station|boss/i.test(o.description || ""));
    const securedNodeIds = new Set<string>(secureObjective?.securedNodeIds || []);
    const allNodes = await (prisma as any).mapNode.findMany({ where: { gameId: gameState.id } });
    const nodeByCoord = new Map<string, any>(
        allNodes.map((entry: any) => [nodeCoordKey(Number(entry.x), Number(entry.y), Number(entry.z)), entry])
    );

    // Group scans by node
    const scansByNode = new Map<string, PendingAction[]>();
    pending.filter(p => p.intent === "SCAN").forEach(p => {
        const player = players.find(pl => pl.characterId === p.playerId);
        if (!player?.MapNode) return;
        const nid = player.MapNode.id;
        scansByNode.set(nid, [...(scansByNode.get(nid) || []), p]);
    });

    for (const [nodeId, scanActions] of scansByNode.entries()) {
        const nodePlayers = scanActions.map(a => players.find(p => p.characterId === a.playerId)).filter(Boolean) as any[];
        if (nodePlayers.length === 0) continue;
        const node = nodePlayers[0].MapNode;
        const nodePower = node.roomPower || 0;

        // Determine combined strength: if two+ scans with same top rank, sum; otherwise highest only.
        const ranked = scanActions.map(a => {
            const player = players.find(p => p.characterId === a.playerId)!;
            return {
                action: a,
                strength: cardStrength(a.cards, node.roomSuit, node.integrity, {
                    playerClass: player?.Character?.class,
                    weaponSuit: player?.equippedWeaponSuit,
                    armorSuit: player?.equippedArmorSuit
                }).strength,
                rank: a.cards[0]?.rank || 0,
                player
            };
        }).sort((a, b) => b.strength - a.strength);

        let bestStrength = ranked[0]?.strength || 0;
        let winner: PendingAction | null = ranked[0]?.action || null;
        let combined = false;
        if (ranked.length >= 2 && ranked[0].rank && ranked[0].rank === ranked[1].rank) {
            bestStrength = ranked[0].strength + ranked[1].strength;
            combined = true;
            winner = ranked[0].action;
        }

        const integrityPenalty = node.integrity < 50 ? -2 : 0;
        const effectiveStrength = bestStrength + integrityPenalty;
        const success = effectiveStrength >= nodePower;
        const integrityDrop = success ? 0 : 5;
        const integrityGain = success ? Math.min(100, (node.integrity || 100) + 5) : Math.max(0, (node.integrity || 100) - integrityDrop);

        const scanDepth = success
            ? Math.min(8, Math.max(2, 2 + Math.floor((effectiveStrength - nodePower) / 2)))
            : 1;
        const hallwayIntel = buildHallwayIntel(node, nodeByCoord, scanDepth);
        const secretIntel = parseSecretIntel(node.secretPaths);
        const nextLeads = success && bestStrength >= nodePower + 4
            ? Array.from(new Set([...(secretIntel.leads || []).map((lead: any) => JSON.stringify(lead)), JSON.stringify({ to: "BOSS" })])).map((lead) => JSON.parse(lead))
            : secretIntel.leads;

        updates.push((prisma as any).mapNode.update({
            where: { id: nodeId },
            data: {
                scanned: true,
                isExplored: true,
                integrity: integrityGain,
                roomPower: success ? nodePower : nodePower + 1,
                security: success ? Math.max(node.security || 0, 1) : Math.max(0, (node.security || 0) - 1),
                secretPaths: JSON.stringify({
                    ...secretIntel,
                    leads: nextLeads,
                    hallwayIntel,
                    hallwayScanDepth: scanDepth
                })
            }
        }));

        const winnerName = players.find(p => p.characterId === (winner?.playerId || ""))?.Character?.name || "Unknown";
        const detectedEnemies = parseJSON(node.enemies || "[]", []).length;
        logs.push({
            ts: now,
            type: "RESOLUTION_DATA",
            message: JSON.stringify({
                type: "SCAN",
                playerId: winner?.playerId || null,
                playerName: winnerName,
                strength: effectiveStrength,
                nodePower,
                success,
                roomSuit: node.roomSuit,
                scanDepth,
                combined,
                detectedEnemies
            })
        });
        if (success) {
            if (winner) {
                const player = players.find(p => p.characterId === winner.playerId)!;
                const inv = parseJSON(player.inventory || "[]", []);
                const capacity = getBackpackCapacityForPlayer(player);
                const slotSize = 1;
                if (getSlotsUsed(inv) + slotSize <= capacity) {
                    inv.push({ id: `loot-${now}`, name: "Recovered Tech", type: "LOOT", qty: 1, slotSize, description: "Scan reward" });
                    updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { inventory: JSON.stringify(inv) } }));
                    logs.push({ ts: now, type: "LOOT", message: `${winnerName} recovered tech from the scan.` });
                } else {
                    logs.push({ ts: now, type: "LOOT", message: `${winnerName} found loot but the backpack is full.` });
                }
            }
            logs.push({ ts: now, type: "SCAN", message: `${winnerName} scanned ${node.roomSuit} room (P${nodePower})${combined ? " with assist" : ""}: SUCCESS` });
            if (hallwayIntel.length > 0) {
                logs.push({
                    ts: now,
                    type: "SCAN",
                    message: `Hallway profile: ${hallwayIntel.map((intel) => `${intel.direction} ${intel.distance}${intel.truncated ? "+" : ""}`).join(" | ")}`
                });
            }
            if (bestStrength >= nodePower + 4) {
                logs.push({ ts: now, type: "SCAN", message: `Secret tunnel mapped near ${node.roomSuit} sector.` });
            }
        } else {
            logs.push({ ts: now, type: "SCAN", message: `${winnerName} scanned ${node.roomSuit} room (P${nodePower}): FAILED, hostiles alerted.` });
        }
    }

    // Process secure / attack / move
    for (const action of pending.filter(a => a.intent !== "SCAN")) {
        const player = players.find(p => p.characterId === action.playerId);
        if (!player?.MapNode) continue;
        const node = player.MapNode;
        const nodePower = node.roomPower || 0;
        const { strength, breakdown } = cardStrength(action.cards, node.roomSuit, node.integrity, {
            playerClass: player?.Character?.class,
            weaponSuit: player?.equippedWeaponSuit,
            armorSuit: player?.equippedArmorSuit
        });
        const success = strength >= nodePower;
        const playerName = player.Character?.name || "Unknown";

        if (action.intent === "SECURE") {
            const secretIntel = parseSecretIntel(node.secretPaths);
            const hallwayTarget = isHallwayNode(node);
            const newIntegrity = Math.min(100, (node.integrity || 100) + (success ? 15 : 0));
            const nextSecurity = success
                ? hallwayTarget
                    ? Math.max(node.security || 0, strength, 2)
                    : Math.max(node.security || 0, strength)
                : node.security;

            // V20: Armor "Scare" Logic
            let enemiesRemoved = false;
            const nodeEnemies = parseJSON(node.enemies || "[]", []);
            if (success && nodeEnemies.length > 0) {
                if (node.type !== "BOSS") {
                    enemiesRemoved = true;
                }
            }

            updates.push((prisma as any).mapNode.update({
                where: { id: node.id },
                data: {
                    security: nextSecurity,
                    integrity: success ? newIntegrity : Math.max(0, (node.integrity || 100) - 5),
                    scanned: true,
                    isExplored: true,
                    secretPaths: hallwayTarget && success
                        ? JSON.stringify({ ...secretIntel, hallwayStops: 0 })
                        : node.secretPaths,
                    enemies: enemiesRemoved ? "[]" : node.enemies
                }
            }));

            let msg = hallwayTarget
                ? `${playerName} stabilized ${getSecureTargetLabel(node)}: ${success ? "STABLE" : "UNSTABLE"}`
                : `${playerName} secured ${getSecureTargetLabel(node)}: ${success ? "STABLE" : "UNSTABLE"}`;
            if (success && enemiesRemoved) msg += " (Hostiles routed)";

            // V22: Enhanced Detailed Log - explain WHY secure failed
            const detailMsg = `[Base ${breakdown.base}${breakdown.weapon ? `+${breakdown.weapon} Weapon` : ''}${breakdown.classMod ? `+${breakdown.classMod} Class` : ''}${breakdown.roomMod > 0 ? `+${breakdown.roomMod} Room` : ''}${breakdown.integrity ? `${breakdown.integrity} Damaged Room` : ''}]`;
            logs.push({ ts: now, type: "SECURE", message: `${msg} ${detailMsg} (${strength} vs ${nodePower})` });

            // V22: Visual Data Payload (Hidden from standard log, read by UI)
            logs.push({
                ts: now,
                type: "RESOLUTION_DATA",
                message: JSON.stringify({
                    type: "SECURE",
                    playerId: action.playerId,
                    playerName,
                    strength,
                    nodePower,
                    breakdown,
                    success,
                    enemiesRemoved,
                    roomSuit: node.roomSuit
                })
            });

            if (success && secureObjective && isSecureObjectiveNode(node) && !securedNodeIds.has(node.id)) {
                securedNodeIds.add(node.id);
                const target = typeof secureObjective.target === "number" ? secureObjective.target : 5;
                secureObjective.current = securedNodeIds.size;
                secureObjective.target = target;
                secureObjective.securedNodeIds = Array.from(securedNodeIds);
                secureObjective.isComplete = secureObjective.current >= target;
            }
        } else if (action.intent === "ATTACK") {
            // V20: Weapon Requirement
            if (!player.equippedWeaponSuit) {
                const pInv = parseJSON(player.inventory || "[]", []);
                const hasWeapon = pInv.some((i: any) => i.isEquipped && (i.type === "weapon" || i.item?.type === "weapon"));
                if (!hasWeapon) {
                    const suggestion = node.type === "BOSS" ? "Scan the boss room to reveal weapons" : "Scan this room to find weapons";
                    logs.push({ ts: now, type: "ATTACK", message: `${playerName} tried to attack without a weapon. ${suggestion}` });
                    continue;
                }
            }

            // V22: Validate target presence
            if (!success && node.type !== "BOSS") {
                const nodeEnemies = parseJSON(node.enemies || "[]", []);
                if (nodeEnemies.length === 0) {
                    logs.push({ ts: now, type: "ATTACK", message: `${playerName} attacked, but no hostiles present in this room.` });
                    continue;
                }
            }

            if (success) {
                if (node.type === "BOSS") {
                    const isAnomaly = (action.cards || []).some((c: any) => (c.suit || c.suitName) === "ANOMALY" || c.rank === 99);
                    const damage = isAnomaly ? 99 : 10;
                    nextIntegrity = Math.max(0, nextIntegrity - damage);
                    logs.push({ ts: now, type: "ATTACK", message: `${playerName} struck the core: -${damage} integrity.` });
                    if (mainObjective) {
                        const target = typeof mainObjective.target === "number" ? mainObjective.target : 100;
                        mainObjective.target = target;
                        mainObjective.current = Math.max(0, target - nextIntegrity);
                        mainObjective.isComplete = nextIntegrity <= 0;
                        if (mainObjective.isComplete) {
                            logs.push({ ts: now, type: "MAIN", message: "Core neutralized. Return to airlock for extraction." });
                        }
                    }
                } else {
                    // V22: Detailed Log
                    const detailMsg = `[Base ${breakdown.base}${breakdown.weapon ? `+Wpn` : ''}${breakdown.roomMod ? `${breakdown.roomMod > 0 ? '+' : ''}Rm` : ''}]`;
                    logs.push({ ts: now, type: "ATTACK", message: `⚔️ ${playerName} vs HOSTILES: ${strength} > ${nodePower}. TARGET NEUTRALIZED. ${detailMsg}` });

                    // V22: Visual Data Payload
                    logs.push({
                        ts: now,
                        type: "RESOLUTION_DATA",
                        message: JSON.stringify({
                            type: "ATTACK",
                            playerId: action.playerId,
                            playerName,
                            strength,
                            nodePower,
                            breakdown,
                            success: true,
                            targetType: "ENEMY",
                            roomSuit: node.roomSuit
                        })
                    });

                    updates.push((prisma as any).mapNode.update({
                        where: { id: node.id },
                        data: { enemies: "[]" }
                    }));
                }
            } else {
                // V22: Enhanced Detailed Log - explain WHY attack failed
                const detailMsg = `[Base ${breakdown.base}${breakdown.weapon ? `+${breakdown.weapon} Weapon` : ''}${breakdown.classMod ? `+${breakdown.classMod} Class` : ''}${breakdown.roomMod > 0 ? `+${breakdown.roomMod} Room` : ''}${breakdown.integrity ? `${breakdown.integrity} Damaged Room` : ''}]`;
                logs.push({ ts: now, type: "ATTACK", message: `⚠️ ${playerName} vs HOSTILES: ${strength} vs ${nodePower} (${node.roomSuit}). ATTACK FAILED. ${detailMsg}` });

                // V22: Visual Data Payload
                logs.push({
                    ts: now,
                    type: "RESOLUTION_DATA",
                    message: JSON.stringify({
                        type: "ATTACK",
                        playerId: action.playerId,
                        playerName,
                        strength,
                        nodePower,
                        breakdown,
                        success: false,
                        targetType: "ENEMY",
                        roomSuit: node.roomSuit
                    })
                });
            }
        } else if (action.intent === "MOVE") {
            const emergencyMove = Boolean(action.emergency);
            const facing = (player.facing || "NORTH") as Facing;
            const nodeConnections = parseJSON(node.connections || "[]", []);
            const candidateDirections = emergencyMove ? ["BACK", "LEFT", "RIGHT", "FORWARD"] : [action.direction || "FORWARD"];
            const moveDistance = getMoveCardDistance(action.cards);
            let moveResult: { target: any; newFacing: Facing; direction: string; steps: number; hallwaySteps: number; path: any[] } | null = null;

            if (!emergencyMove && !node.scanned && node.type !== "START") {
                logs.push({ ts: now, type: "MOVE", message: `${playerName} can't move without a scan. Scan this room to see where you can go.` });
                continue;
            }

            for (const dir of candidateDirections) {
                const { dx, dy, dz, newFacing } = resolveMove(dir, facing);
                const absDir = vectorToDirection(dx, dy, dz);
                if (absDir && !nodeConnections.includes(absDir)) continue;

                const target = nodeByCoord.get(nodeCoordKey(Number(node.x) + dx, Number(node.y) + dy, Number(node.z) + dz));
                if (!target) continue;
                if (emergencyMove && !target.scanned && target.type !== "START") continue;
                const visibleMoveBudget = emergencyMove ? moveDistance : getVisibleMoveBudget(node, absDir || dir, moveDistance);

                const traversed = traverseMovePath({
                    startNode: node,
                    firstDirection: absDir || dir,
                    initialFacing: newFacing,
                    stepBudget: visibleMoveBudget,
                    nodeByCoord
                });
                if (!traversed.path.length) continue;

                moveResult = {
                    target: traversed.target,
                    newFacing: traversed.newFacing,
                    direction: dir,
                    steps: traversed.steps,
                    hallwaySteps: traversed.hallwaySteps,
                    path: traversed.path
                };
                break;
            }

            if (!moveResult) {
                console.log(`[MOVE_DIAG] No valid target for player ${playerName} in directions: ${candidateDirections.join(', ')}`);
                console.log(`[MOVE_DIAG] Facing: ${facing}, Connections: ${JSON.stringify(nodeConnections)}`);
                logs.push({ ts: now, type: "MOVE", message: `${playerName} could not find a safe escape route.` });
                continue;
            }

            console.log(`[MOVE_DIAG] Success: ${playerName} moving ${moveResult.direction} to (${moveResult.target.x}, ${moveResult.target.y}, ${moveResult.target.z})`);

            if (emergencyMove) {
                const nextHp = Math.max(0, (player.hp ?? 0) - 1);
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { hp: nextHp } }));
                player.hp = nextHp;
                logs.push({ ts: now, type: "MOVE", message: `${playerName} triggered emergency escape: -1 HP.` });
            }

            const moveFatigue = moveResult.hallwaySteps;
            if (moveFatigue > 0) {
                const nextStress = Math.max(0, (player.stress ?? 0) - moveFatigue);
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { stress: nextStress } }));
                player.stress = nextStress;
                logs.push({ ts: now, type: "MOVE", message: `${playerName} burned ${moveFatigue} energy traversing the hallway.` });
            }

            if (!isHallwayNode(node) && node.type !== "START" && (node.security ?? 0) < 1) {
                const nextStress = Math.max(0, (player.stress ?? 0) - 1);
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { stress: nextStress } }));
                player.stress = nextStress;
                logs.push({ ts: now, type: "MOVE", message: `${playerName} left an unsecured room: -1 energy.` });
            }

            let collapsedHallway = false;
            if (isHallwayNode(moveResult.target)) {
                const targetSecretIntel = parseSecretIntel(moveResult.target.secretPaths);
                if ((moveResult.target.security ?? 0) >= 2) {
                    if (targetSecretIntel.hallwayStops > 0) {
                        const stabilizedIntel = { ...targetSecretIntel, hallwayStops: 0 };
                        updates.push((prisma as any).mapNode.update({
                            where: { id: moveResult.target.id },
                            data: { secretPaths: JSON.stringify(stabilizedIntel) }
                        }));
                        moveResult.target.secretPaths = JSON.stringify(stabilizedIntel);
                    }
                } else {
                    const hallwayStops = (targetSecretIntel.hallwayStops || 0) + 1;
                    const nextSecretIntel = { ...targetSecretIntel, hallwayStops };
                    updates.push((prisma as any).mapNode.update({
                        where: { id: moveResult.target.id },
                        data: { secretPaths: JSON.stringify(nextSecretIntel) }
                    }));
                    moveResult.target.secretPaths = JSON.stringify(nextSecretIntel);

                    if (hallwayStops >= 2) {
                        collapsedHallway = true;
                        phaseOverride = "FAILED";
                    }
                }
            }

            const traversedNodeIds = Array.from(new Set(moveResult.path.map((entry: any) => entry.id)));
            if (traversedNodeIds.length > 0) {
                updates.push((prisma as any).mapNode.updateMany({
                    where: { id: { in: traversedNodeIds } },
                    data: { isExplored: true }
                }));
            }
            const playerMoveUpdate: any = {
                MapNode: { connect: { id: moveResult.target.id } },
                facing: moveResult.newFacing,
                distanceTraveled: { increment: moveResult.steps }
            };
            if (collapsedHallway) {
                playerMoveUpdate.hp = 0;
            }
            updates.push((prisma as any).gamePlayer.update({
                where: { id: player.id },
                data: playerMoveUpdate
            }));
            player.MapNode = moveResult.target;
            player.nodeId = moveResult.target.id;
            player.facing = moveResult.newFacing;
            player.distanceTraveled = (player.distanceTraveled ?? 0) + moveResult.steps;
            if (collapsedHallway) {
                player.hp = 0;
            }
            logs.push({
                ts: now,
                type: "MOVE",
                message: `${playerName} moved ${moveResult.direction}${moveResult.steps > 1 ? ` ${moveResult.steps} sectors` : ""}.`
            });
            if (collapsedHallway) {
                logs.push({
                    ts: now,
                    type: "MOVE",
                    message: `${playerName} stopped in the same unstable ${getSecureTargetLabel(moveResult.target)} twice. The hull ruptured and they were lost to vacuum.`
                });
            } else if (isHallwayNode(moveResult.target) && (moveResult.target.security ?? 0) < 2) {
                logs.push({
                    ts: now,
                    type: "MOVE",
                    message: `${playerName} strained the unstable ${getSecureTargetLabel(moveResult.target)}. Stabilize it before stopping here again.`
                });
            }
            logs.push({
                ts: now,
                type: "MOVE_DATA",
                message: JSON.stringify({
                    playerId: action.playerId,
                    direction: moveResult.direction,
                    steps: moveResult.steps,
                    hallwaySteps: moveResult.hallwaySteps,
                    fromFacing: facing,
                    toFacing: moveResult.newFacing,
                    from: {
                        id: node.id,
                        x: node.x,
                        y: node.y,
                        z: node.z,
                        type: node.type,
                        roomSuit: node.roomSuit,
                        roomPower: node.roomPower,
                        security: node.security,
                        scanned: node.scanned,
                        isExplored: node.isExplored,
                        integrity: node.integrity,
                        connections: node.connections,
                        enemies: node.enemies,
                        secretPaths: node.secretPaths
                    },
                    to: {
                        id: moveResult.target.id,
                        x: moveResult.target.x,
                        y: moveResult.target.y,
                        z: moveResult.target.z,
                        type: moveResult.target.type,
                        roomSuit: moveResult.target.roomSuit,
                        roomPower: moveResult.target.roomPower,
                        security: moveResult.target.security,
                        scanned: moveResult.target.scanned,
                        isExplored: moveResult.target.isExplored,
                        integrity: moveResult.target.integrity,
                        connections: moveResult.target.connections,
                        enemies: moveResult.target.enemies,
                        secretPaths: moveResult.target.secretPaths
                    },
                    hallway: moveResult.hallwaySteps > 0,
                    path: moveResult.path.map((entry: any) => ({
                        id: entry.id,
                        x: entry.x,
                        y: entry.y,
                        z: entry.z,
                        type: entry.type,
                        roomSuit: entry.roomSuit,
                        roomPower: entry.roomPower,
                        security: entry.security,
                        scanned: entry.scanned,
                        isExplored: entry.isExplored,
                        integrity: entry.integrity,
                        connections: entry.connections,
                        enemies: entry.enemies,
                        secretPaths: entry.secretPaths
                    }))
                })
            });

            if (!gameState.deadline && !startedDeadline) {
                const diff = lobbyDifficulty || "NORMAL";
                const minutes = diff === "HARD" ? 10 : diff === "EASY" ? 20 : 15;
                startedDeadline = new Date(Date.now() + minutes * 60000);
            }

            if (collapsedHallway) {
                break;
            }
        }
    }

    // V24: Move Collision Detection
    if (!phaseOverride) {
        const nodeOccupancy = new Map<string, string[]>();
        players.forEach(p => {
            const nid = p.nodeId;
            if (!nid) return;
            const list = nodeOccupancy.get(nid) || [];
            list.push(p.Character?.name || "Unknown");
            nodeOccupancy.set(nid, list);
        });

        for (const [nid, names] of nodeOccupancy.entries()) {
            if (names.length > 1) {
                logs.push({ ts: now, type: "COLLISION", message: `COLLISION: ${names.join(", ")} bumped into each other! -1 Energy.` });
                // Apply stress penalty to all players involved
                for (const name of names) {
                    const p = players.find(pl => pl.Character?.name === name);
                    if (p) {
                        const nextStress = Math.max(0, (p.stress ?? 0) - 1);
                        updates.push((prisma as any).gamePlayer.update({ where: { id: p.id }, data: { stress: nextStress } }));
                    }
                }
            }
        }
    }

    await Promise.all(updates);

    // V23: Endgame Handling (Defeat Check)
    if (!phaseOverride && nextIntegrity <= 0) {
        phaseOverride = "FAILED";
        logs.push({ ts: now, type: "MAIN", message: "CRITICAL FAILURE: Hull Integrity compromised. Mission failed." });
    }

    if (!phaseOverride && mainObjective?.isComplete && players.every(p => p.MapNode?.type === "START")) {
        phaseOverride = "VICTORY";
        logs.push({ ts: now, type: "MAIN", message: "Squad extracted. Mission complete." });
    }

    // V23: Scoring & Persistence
    if (phaseOverride) {
        const isVictory = phaseOverride === "VICTORY";
        const turnCount = gameState.currentTurn || 0;

        // Finalize Run for each player
        for (const p of players) {
            const travelDistance = p.distanceTraveled ?? 0;
            const travelCredits = Math.floor(travelDistance / 10);
            // Calculate Score
            let score = 1000;
            if (isVictory) {
                score += 500; // Objective
                score += Math.max(0, (20 - turnCount) * 50); // Speed Bonus (assuming 20 turn par)
                score += nextIntegrity * 10; // Integrity Bonus
                // Loot Bonus
                const inv = parseJSON(p.inventory || "[]", []);
                score += inv.filter((i: any) => i.type === "LOOT").length * 100;
            } else {
                score = Math.floor(score * 0.1); // Participation trophy
            }
            score += travelDistance;
            const creditsEarned = Math.floor(score / 2) + travelCredits;

            // Determine Rank
            let rank = "F";
            if (isVictory) {
                if (score >= 2500) rank = "S";
                else if (score >= 2000) rank = "A";
                else if (score >= 1500) rank = "B";
                else rank = "C";
            } else {
                rank = "F";
            }

            const existingRun = await (prisma as any).gameRun.findFirst({
                where: { gameId: gameState.id, characterId: p.characterId },
                orderBy: { endedAt: "desc" }
            });
            if (existingRun) {
                continue;
            }

            // Create GameRun Result
            await (prisma as any).gameRun.create({
                data: {
                    gameId: gameState.id,
                    difficulty: lobbyDifficulty || "NORMAL",
                    outcome: phaseOverride,
                    rank,
                    score,
                    creditsEarned,
                    distanceTraveled: travelDistance,
                    bossDefeated: isVictory, // Simplification
                    extracted: isVictory, // Simplification
                    turns: turnCount,
                    startedAt: gameState.createdAt, // Approx
                    endedAt: new Date(),
                    character: { connect: { id: p.characterId } }
                }
            });

            // Update Character Stats
            const charUpdates: any = {
                runsCompleted: { increment: isVictory ? 1 : 0 },
                runsFailed: { increment: isVictory ? 0 : 1 },
                credits: { increment: creditsEarned }
            };
            await (prisma as any).character.update({
                where: { id: p.characterId },
                data: charUpdates
            });
        }
    }

    // Reset for next round (back to draw phase)
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
            deadline: startedDeadline ?? gameState.deadline
        }
    });

    await appendLog(gameState.id, gameState.gameLog, logs);
    return logs;
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { gameId, action, cards = [], intent, direction, itemId, emergency } = await req.json();
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

        // Allow explicit start to kick from DRAW -> ACTION
        if (action === "START") {
            const updated = await beginActionPhase(gameState);
            return NextResponse.json({ success: true, roundPhase: updated.roundPhase, sharedAp: updated.sharedAp });
        }

        if (action === "USE_ITEM") {
            let inv = parseJSON(player.inventory || "[]", []);
            const idx = inv.findIndex((i: any) => i.id === itemId || i.itemId === itemId);
            if (idx === -1) return NextResponse.json({ error: "Item not found" }, { status: 400 });

            const item = inv[idx];
            const updates: Promise<any>[] = [];
            const isCycleableLoot = String(item?.type || "").toUpperCase() === "LOOT" || /recovered tech|salvage|cache/i.test(item?.name || "");

            if (isCycleableLoot) {
                const deck = parseJSON(gameState.roomDeck || "[]", []);
                const hand = parseJSON(player.hand || "[]", []);
                const drawCard = deck.length > 0 ? deck.shift() : null;

                if (drawCard) {
                    hand.push(drawCard);
                    CardRules.sortHand(hand);
                }

                if ((item.qty ?? 1) > 1) {
                    inv[idx].qty = Math.max(0, (item.qty ?? 1) - 1);
                    if (inv[idx].qty <= 0) inv.splice(idx, 1);
                } else {
                    inv.splice(idx, 1);
                }

                updates.push((prisma as any).gamePlayer.update({
                    where: { id: player.id },
                    data: {
                        inventory: JSON.stringify(inv),
                        hand: JSON.stringify(hand)
                    }
                }));
                updates.push((prisma as any).gameState.update({
                    where: { id: gameId },
                    data: {
                        roomDeck: JSON.stringify(deck)
                    }
                }));

                await Promise.all(updates);

                const message = drawCard
                    ? `${item.name} cycled into a hard draw: ${drawCard.rank} ${drawCard.suit}.`
                    : `${item.name} cycled, but the deck was dry.`;
                await appendLog(gameId, gameState.gameLog, [
                    { ts: Date.now(), type: "ITEM", message },
                    { ts: Date.now(), type: "DRAW", message: drawCard ? `${character.name} forced a salvage draw.` : `${character.name} cycled salvage without a draw.` }
                ]);
                return NextResponse.json({
                    success: true,
                    message,
                    drawnCard: drawCard,
                    inventory: inv,
                    hand
                });
            }

            // V19: Generic Item Usage Tracking
            // If item has maxUses, we must track usages.
            if (typeof item.usesMax === 'number' || typeof item.item?.maxUses === 'number') {
                const max = item.usesMax ?? item.item?.maxUses;
                const current = item.usesRemaining ?? max;

                if (current <= 0) {
                    return NextResponse.json({ error: "Item depleted" }, { status: 400 });
                }

                const next = Math.max(0, current - 1);
                inv[idx].usesRemaining = next;

                // Update Inventory in DB
                updates.push((prisma as any).gamePlayer.update({
                    where: { id: player.id },
                    data: { inventory: JSON.stringify(inv) }
                }));

                // If persistent (has real database ID), update that too so it carries over?
                // "we should see how many uses are left and if an item is used to 0 we can't use it anymore"
                // Usually session inventory is separate, but if we want it to persist across games (like Roguelike), we might update the source.
                // For now, let's update the session inventory. The user's request "only take in two games" implies session-based?
                // Actually, if it's "Loadout", it might imply persistence.
                // Let's stick to session for safety to avoid destroying persistent items unless explicitly requested.
                // Wait, logic in Engine was updating persistent item?
                // `await (prisma as any).inventoryItem.update(...)`
                // Yes, the engine code I saw earlier updated the persistent `inventoryItem`.
                // If I only update session inventory JSON, it won't persist.
                // BUT, `inv` here is the session inventory JSON.
                // `item.id` might be the persistent ID if it came from loadout.
                // Let's try to update the persistent record IF it exists.

                const persistentItem = await (prisma as any).inventoryItem.findUnique({ where: { id: item.id } });
                if (persistentItem) {
                    updates.push((prisma as any).inventoryItem.update({
                        where: { id: item.id },
                        data: { usesRemaining: next }
                    }));
                }

                await Promise.all(updates);
                const message = `Used ${item.name}. Uses left: ${next}/${max}`;
                await appendLog(gameId, gameState.gameLog, [{ ts: Date.now(), type: "ITEM", message }]);
                return NextResponse.json({ success: true, message, usesRemaining: next });
            }

            // Fallback for Consumables (Paste) which don't have explicit MaxUses logic yet
            if (/paste/i.test(item.name || "")) {
                const heal = 2;
                const maxHp = player.maxHp ?? 10;
                const nextHp = Math.min(maxHp, (player.hp ?? 0) + heal);
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { hp: nextHp } }));

                if (item.qty && item.qty > 1) inv[idx].qty -= 1; else inv.splice(idx, 1);
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { inventory: JSON.stringify(inv) } }));

                await Promise.all(updates);
                const message = `+${heal} HP from Nutrient Paste`;
                await appendLog(gameId, gameState.gameLog, [{ ts: Date.now(), type: "ITEM", message }]);
                return NextResponse.json({ success: true, message, hp: nextHp });
            }

            // V21: Replenishment Logic (Battery / Kit)
            if (/battery|kit|charge/i.test(item.name || "")) {
                // Find an equipped item that needs charging
                const targetIdx = inv.findIndex((i: any) => i.isEquipped && typeof i.usesMax === 'number' && (i.usesRemaining ?? i.usesMax) < i.usesMax);

                if (targetIdx === -1) {
                    return NextResponse.json({ error: "No equipped items need charging." }, { status: 400 });
                }

                const target = inv[targetIdx];
                const max = target.usesMax;
                const current = target.usesRemaining ?? max;
                const chargeAmount = 3; // Arbitrary charge amount
                const next = Math.min(max, current + chargeAmount);
                inv[targetIdx].usesRemaining = next;

                // Consume the replenish item
                if (item.qty && item.qty > 1) inv[idx].qty -= 1; else inv.splice(idx, 1);

                // Update DB
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { inventory: JSON.stringify(inv) } }));

                // Also update persistent if target is persistent (likely is)
                if (target.id && !target.id.startsWith('loot-')) {
                    updates.push((prisma as any).inventoryItem.update({
                        where: { id: target.id },
                        data: { usesRemaining: next }
                    }));
                }

                await Promise.all(updates);
                const message = `Recharged ${target.name} (+${chargeAmount}). Uses: ${next}/${max}`;
                await appendLog(gameId, gameState.gameLog, [{ ts: Date.now(), type: "ITEM", message }]);
                return NextResponse.json({ success: true, message, usesRemaining: next });
            }

            if (/scrap/i.test(item.name || "")) {
                return NextResponse.json({ error: "Scrap is only usable at the 3D printer." }, { status: 400 });
            }

            return NextResponse.json({ error: "Item has no effect." }, { status: 400 });
        }

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
            const emergencyAction = Boolean(emergency);
            const existingIdx = pending.findIndex(p => p.playerId === character.id);
            if (existingIdx !== -1) {
                sharedAp += pending[existingIdx].cards.length; // refund previous lock
                pending.splice(existingIdx, 1);
            }

            // Determine cards to lock
            const currentHand = parseJSON(player.hand || "[]", []);
            let lockedCards = emergencyAction ? [] : (Array.isArray(cards) && cards.length > 0 ? cards : []);
            if (lockedCards.length === 0 && !emergencyAction) {
                const autoCard = lowestCard(currentHand);
                if (autoCard) lockedCards = [autoCard];
            }
            if (lockedCards.length > 1) {
                const ranks = new Set(lockedCards.map((c: any) => c.rank));
                if (ranks.size > 1) {
                    return NextResponse.json({ error: "Doubles must match rank." }, { status: 400 });
                }
            }
            const cost = emergencyAction ? 0 : Math.max(1, lockedCards.length);
            if (cost > 0 && sharedAp < cost) {
                return NextResponse.json({ error: "Not enough AP in shared pool" }, { status: 400 });
            }

            // Node-based intent constraints
            const node = player.MapNode;
            const nodeEnemies = node ? parseJSON(node.enemies || "[]", []) : [];
            const isBossRoom = node?.type === "BOSS";
            if (node?.type === "START" && intent !== "MOVE") {
                return NextResponse.json({ error: "First action must be MOVE FORWARD out of the airlock." }, { status: 400 });
            }
            if (node?.type === "START" && direction && direction !== "FORWARD") {
                return NextResponse.json({ error: "Only FORWARD is available from the airlock." }, { status: 400 });
            }
            if (intent === "ATTACK" && nodeEnemies.length === 0 && !isBossRoom) {
                return NextResponse.json({ error: "No enemies present to attack." }, { status: 400 });
            }

            // Prevent re-scan
            if ((intent || "SCAN") === "SCAN" && player.MapNode?.scanned) {
                return NextResponse.json({ error: "Room already scanned" }, { status: 400 });
            }

            // Remove locked cards from hand
            if (!emergencyAction) {
                const lockIds = new Set(lockedCards.map((c: any) => c.id));
                const newHand = currentHand.filter((c: any) => !lockIds.has(c.id));
                await (prisma as any).gamePlayer.update({
                    where: { id: player.id },
                    data: { hand: JSON.stringify(newHand) }
                });
            }

            pending.push({
                playerId: character.id,
                intent: (intent || "SCAN") as any,
                cards: lockedCards,
                direction: direction || null,
                auto: cards.length === 0,
                emergency: emergencyAction
            });

            sharedAp = Math.max(0, sharedAp - cost);
            const nextDeadline = gameState.actionDeadline ?? new Date(Date.now() + ACTION_WINDOW_MS);

            const updatedState = await (prisma as any).gameState.update({
                where: { id: gameId },
                data: {
                    pendingActions: JSON.stringify(pending),
                    sharedAp,
                    actionDeadline: nextDeadline
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
                    const hand = parseJSON(p.hand || "[]", []);
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
                    include: { MapNode: true, Character: true }
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
