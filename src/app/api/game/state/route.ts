import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CardRules } from "@/lib/game/cards";
import { getClassSuit } from "@/lib/game/classSuit";
import { getBackpackCapacity } from "@/lib/game/backpack";

function parseJSON(raw: any, fallback: any) {
    try { return JSON.parse(raw); } catch { return fallback; }
}

const TERMINAL_PHASES = new Set(["FAILED", "VICTORY", "DEFEAT"]);

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

async function expireMissionIfNeeded(gameState: any) {
    const deadlineMs = gameState?.deadline ? new Date(gameState.deadline).getTime() : null;
    const phase = String(gameState?.phase || "").toUpperCase();
    const roundPhase = String(gameState?.roundPhase || "").toUpperCase();
    if (!deadlineMs || deadlineMs > Date.now() || TERMINAL_PHASES.has(phase) || TERMINAL_PHASES.has(roundPhase)) {
        return false;
    }

    const players = await (prisma as any).gamePlayer.findMany({
        where: { gameId: gameState.id },
        include: { MapNode: true, Character: true }
    });
    const lobbyDifficulty = gameState?.GameLobby?.difficulty || "NORMAL";
    const turnCount = gameState.currentTurn || 0;
    const nextIntegrity = gameState.integrity ?? 100;
    const logs = [
        {
            ts: Date.now(),
            type: "MAIN",
            message: "MISSION CLOCK EXPIRED: the round is over and the squad was lost before extraction."
        }
    ];

    for (const p of players) {
        const existingRun = await (prisma as any).gameRun.findFirst({
            where: { gameId: gameState.id, characterId: p.characterId },
            orderBy: { endedAt: "desc" }
        });
        if (existingRun) continue;

        const travelDistance = p.distanceTraveled ?? 0;
        const travelCredits = Math.floor(travelDistance / 10);
        let score = Math.floor(1000 * 0.1);
        score += travelDistance;
        const creditsEarned = Math.floor(score / 2) + travelCredits;

        await (prisma as any).gameRun.create({
            data: {
                gameId: gameState.id,
                difficulty: lobbyDifficulty,
                outcome: "FAILED",
                rank: "F",
                score,
                creditsEarned,
                distanceTraveled: travelDistance,
                bossDefeated: false,
                extracted: false,
                turns: turnCount,
                startedAt: gameState.createdAt,
                endedAt: new Date(),
                character: { connect: { id: p.characterId } }
            }
        });

        await (prisma as any).character.update({
            where: { id: p.characterId },
            data: {
                runsCompleted: { increment: 0 },
                runsFailed: { increment: 1 },
                credits: { increment: creditsEarned }
            }
        });
    }

    const basePool = computeBasePool(players.length);
    await (prisma as any).gameState.update({
        where: { id: gameState.id },
        data: {
            roundPhase: "FAILED",
            phase: "FAILED",
            integrity: nextIntegrity,
            sharedAp: basePool,
            sharedApMax: basePool,
            pendingActions: "[]",
            actionDeadline: null,
            gameLog: JSON.stringify([...(parseJSON(gameState.gameLog || "[]", [])), ...logs].slice(-50))
        }
    });

    return true;
}

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
    let phaseOverride: "VICTORY" | "FAILED" | null = null;
    const objectives = parseJSON(gameState.objectives || "[]", []);
    const secureObjective = objectives.find((o: any) => o.id === "sub-1" || /secure/i.test(o.description || ""));
    const mainObjective = objectives.find((o: any) => o.id === "main-1" || /core|station|boss/i.test(o.description || ""));
    const securedNodeIds = new Set<string>(secureObjective?.securedNodeIds || []);
    const allNodes = await (prisma as any).mapNode.findMany({ where: { gameId: gameState.id } });
    const nodeByCoord = new Map<string, any>(
        allNodes.map((entry: any) => [nodeCoordKey(Number(entry.x), Number(entry.y), Number(entry.z)), entry])
    );

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

        const scanDepth = success
            ? Math.min(8, Math.max(2, 2 + Math.floor((effectiveStrength - nodePower) / 2)))
            : 1;
        const hallwayIntel = buildHallwayIntel(node, nodeByCoord, scanDepth);
        const secretIntel = parseSecretIntel(node.secretPaths);
        const nextLeads = success && (best?.strength || 0) >= nodePower + 4
            ? Array.from(new Set([...(secretIntel.leads || []).map((lead: any) => JSON.stringify(lead)), JSON.stringify({ to: "BOSS" })])).map((lead) => JSON.parse(lead))
            : secretIntel.leads;

        updates.push((prisma as any).mapNode.update({
            where: { id: nodeId },
            data: {
                scanned: true,
                isExplored: true,
                integrity: newIntegrity,
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
        const winnerPlayer = players.find((p: any) => p.characterId === best?.action?.playerId);
        const winnerName = winnerPlayer?.Character?.name || "Unknown";
        const detectedEnemies = parseJSON(node.enemies || "[]", []).length;
        logs.push({
            ts: nowTs,
            type: "RESOLUTION_DATA",
            message: JSON.stringify({
                type: "SCAN",
                playerId: best?.action?.playerId || null,
                playerName: winnerName,
                strength: effectiveStrength,
                nodePower,
                success,
                roomSuit: node.roomSuit,
                scanDepth,
                combined: strengths.length >= 2 && strengths[0]?.rank === strengths[1]?.rank,
                detectedEnemies
            })
        });
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
        if (hallwayIntel.length > 0) {
            logs.push({
                ts: nowTs,
                type: "SCAN",
                message: `Hallway profile: ${hallwayIntel.map((intel) => `${intel.direction} ${intel.distance}${intel.truncated ? "+" : ""}`).join(" | ")}`
            });
        }
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
            const secretIntel = parseSecretIntel(node.secretPaths);
            const hallwayTarget = isHallwayNode(node);
            const newIntegrity = Math.min(100, (node.integrity || 100) + (success ? 15 : 0));
            const nextSecurity = success
                ? hallwayTarget
                    ? Math.max(node.security || 0, strength, 2)
                    : Math.max(node.security || 0, strength)
                : node.security;
            updates.push((prisma as any).mapNode.update({
                where: { id: node.id },
                data: {
                    security: nextSecurity,
                    integrity: success ? newIntegrity : Math.max(0, (node.integrity || 100) - 5),
                    scanned: true,
                    isExplored: true,
                    secretPaths: hallwayTarget && success
                        ? JSON.stringify({ ...secretIntel, hallwayStops: 0 })
                        : node.secretPaths
                }
            }));
            logs.push({
                ts: nowTs,
                type: "SECURE",
                message: hallwayTarget
                    ? `${playerName} stabilized ${getSecureTargetLabel(node)}: ${success ? "STABLE" : "UNSTABLE"}`
                    : `${playerName} secured ${getSecureTargetLabel(node)}: ${success ? "STABLE" : "UNSTABLE"}`
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
            const moveDistance = getMoveCardDistance(action.cards);
            let moveResult: { target: any; newFacing: Facing; direction: string; steps: number; hallwaySteps: number; path: any[] } | null = null;

            if (!emergencyMove && !node.scanned && node.type !== "START") {
                logs.push({ ts: nowTs, type: "MOVE", message: `${playerName} attempted to move but the room is unscanned.` });
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
                logs.push({ ts: nowTs, type: "MOVE", message: `${playerName} could not find a safe escape route.` });
                continue;
            }

            if (emergencyMove) {
                const nextHp = Math.max(0, (player.hp ?? 0) - 1);
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { hp: nextHp } }));
                player.hp = nextHp;
                logs.push({ ts: nowTs, type: "MOVE", message: `${playerName} triggered emergency escape: -1 HP.` });
            }

            if (moveResult.hallwaySteps > 0) {
                const nextStress = Math.max(0, (player.stress ?? 0) - moveResult.hallwaySteps);
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { stress: nextStress } }));
                player.stress = nextStress;
                logs.push({ ts: nowTs, type: "MOVE", message: `${playerName} burned ${moveResult.hallwaySteps} energy traversing the hallway.` });
            }

            if (!isHallwayNode(node) && node.type !== "START" && (node.security ?? 0) < 1) {
                const nextStress = Math.max(0, (player.stress ?? 0) - 1);
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { stress: nextStress } }));
                player.stress = nextStress;
                logs.push({ ts: nowTs, type: "MOVE", message: `${playerName} left an unsecured room: -1 energy.` });
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
                ts: nowTs,
                type: "MOVE",
                message: `${playerName} moved ${moveResult.direction}${moveResult.steps > 1 ? ` ${moveResult.steps} sectors` : ""}.`
            });
            if (collapsedHallway) {
                logs.push({
                    ts: nowTs,
                    type: "MOVE",
                    message: `${playerName} stopped in the same unstable ${getSecureTargetLabel(moveResult.target)} twice. The hull ruptured and they were lost to vacuum.`
                });
            } else if (isHallwayNode(moveResult.target) && (moveResult.target.security ?? 0) < 2) {
                logs.push({
                    ts: nowTs,
                    type: "MOVE",
                    message: `${playerName} strained the unstable ${getSecureTargetLabel(moveResult.target)}. Stabilize it before stopping here again.`
                });
            }
            logs.push({
                ts: nowTs,
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

    await Promise.all(updates);

    if (!phaseOverride && nextIntegrity <= 0) {
        phaseOverride = "FAILED";
        logs.push({ ts: nowTs, type: "MAIN", message: "CRITICAL FAILURE: Hull Integrity compromised. Mission failed." });
    }

    if (!phaseOverride && mainObjective?.isComplete && players.every((p: any) => p.MapNode?.type === "START")) {
        phaseOverride = "VICTORY";
        logs.push({ ts: nowTs, type: "MAIN", message: "Squad extracted. Mission complete." });
    }

    if (phaseOverride) {
        const isVictory = phaseOverride === "VICTORY";
        const turnCount = gameState.currentTurn || 0;

        for (const p of players) {
            const existingRun = await (prisma as any).gameRun.findFirst({
                where: { gameId: gameState.id, characterId: p.characterId },
                orderBy: { endedAt: "desc" }
            });
            if (existingRun) continue;

            const travelDistance = p.distanceTraveled ?? 0;
            const travelCredits = Math.floor(travelDistance / 10);
            let score = 1000;
            if (isVictory) {
                score += 500;
                score += Math.max(0, (20 - turnCount) * 50);
                score += nextIntegrity * 10;
                const inv = parseJSON(p.inventory || "[]", []);
                score += inv.filter((i: any) => i.type === "LOOT").length * 100;
            } else {
                score = Math.floor(score * 0.1);
            }
            score += travelDistance;
            const creditsEarned = Math.floor(score / 2) + travelCredits;

            let rank = "F";
            if (isVictory) {
                if (score >= 2500) rank = "S";
                else if (score >= 2000) rank = "A";
                else if (score >= 1500) rank = "B";
                else rank = "C";
            }

            await (prisma as any).gameRun.create({
                data: {
                    gameId: gameState.id,
                    difficulty: lobbyDifficulty || "NORMAL",
                    outcome: phaseOverride,
                    rank,
                    score,
                    creditsEarned,
                    distanceTraveled: travelDistance,
                    bossDefeated: isVictory,
                    extracted: isVictory,
                    turns: turnCount,
                    startedAt: gameState.createdAt,
                    endedAt: new Date(),
                    character: { connect: { id: p.characterId } }
                }
            });

            await (prisma as any).character.update({
                where: { id: p.characterId },
                data: {
                    runsCompleted: { increment: isVictory ? 1 : 0 },
                    runsFailed: { increment: isVictory ? 0 : 1 },
                    credits: { increment: creditsEarned }
                }
            });
        }
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

        const missionExpired = await expireMissionIfNeeded(gameState);
        if (missionExpired) {
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
        }

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

        // Identify Current Player and set isCurrentPlayer flag
        const currentPlayer = gameState.GamePlayer.find((gp: any) => gp.Character.userId === session.user.id) ||
            gameState.GamePlayer.find((gp: any) => gp.Character.user?.email === session.user.email); // Fallback

        // Set isCurrentPlayer flag for all players
        const allPlayers = gameState.GamePlayer.map((gp: any) => ({
            ...gp,
            isCurrentPlayer: currentPlayer?.characterId === gp.characterId
        }));

        // Identify current user's player
        // Assuming session.user contains character information or can be used to find it
        // The original code used `currentPlayer` which is derived from `session.user.id` or `session.user.email`
        // I will use `currentPlayer` as the primary player object for consistency with the original code's intent.
        const player = currentPlayer; // Renaming for clarity as per instruction's `player` variable
        const run = player
            ? await (prisma as any).gameRun.findFirst({
                where: { gameId, characterId: player.characterId },
                orderBy: { endedAt: "desc" }
            })
            : null;

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
            player: player ? {
                ...player,
                character: player.Character,
                isCurrentPlayer: player.isCurrentPlayer
            } : null,
            otherPlayers,
            run
        });

    } catch (e) {
        console.error("Game State Error:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
