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

        updates.push((prisma as any).mapNode.update({
            where: { id: nodeId },
            data: {
                scanned: true,
                isExplored: true,
                integrity: integrityGain,
                roomPower: success ? nodePower : nodePower + 1,
                security: success ? Math.max(node.security || 0, 1) : Math.max(0, (node.security || 0) - 1),
                secretPaths: success && bestStrength >= nodePower + 4 ? JSON.stringify([{ to: "BOSS" }]) : JSON.stringify(parseJSON(node.secretPaths || "[]", []))
            }
        }));

        const winnerName = players.find(p => p.characterId === (winner?.playerId || ""))?.Character?.name || "Unknown";
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
            const newIntegrity = Math.min(100, (node.integrity || 100) + (success ? 15 : 0));

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
                    security: success ? Math.max(node.security || 0, strength) : node.security,
                    integrity: success ? newIntegrity : Math.max(0, (node.integrity || 100) - 5),
                    scanned: true,
                    isExplored: true,
                    enemies: enemiesRemoved ? "[]" : node.enemies
                }
            }));

            let msg = `${playerName} secured ${node.roomSuit} room: ${success ? "STABLE" : "UNSTABLE"}`;
            if (success && enemiesRemoved) msg += " (Hostiles routed)";

            // V22: Detailed Log
            const detailMsg = `[Base ${breakdown.base}${breakdown.weapon ? `+Wpn` : ''}${breakdown.roomMod ? `${breakdown.roomMod > 0 ? '+' : ''}Rm` : ''}]`;
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

            if (success && secureObjective && !securedNodeIds.has(node.id)) {
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
                    logs.push({ ts: now, type: "ATTACK", message: `${playerName} tried to attack without a weapon!` });
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
                // V22: Detailed Log
                const detailMsg = `[Base ${breakdown.base}${breakdown.weapon ? `+Wpn` : ''}${breakdown.roomMod ? `${breakdown.roomMod > 0 ? '+' : ''}Rm` : ''}]`;
                logs.push({ ts: now, type: "ATTACK", message: `⚠️ ${playerName} vs HOSTILES: ${strength} < ${nodePower}. ATTACK FAILED. ${detailMsg}` });

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
            let moveResult: { target: any; newFacing: Facing; direction: string } | null = null;

            if (!emergencyMove && !node.scanned && node.type !== "START") {
                logs.push({ ts: now, type: "MOVE", message: `${playerName} attempted to move but the room is unscanned.` });
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

            if ((node.security ?? 0) < 1) {
                const nextStress = Math.max(0, (player.stress ?? 0) - 1);
                updates.push((prisma as any).gamePlayer.update({ where: { id: player.id }, data: { stress: nextStress } }));
                player.stress = nextStress;
                logs.push({ ts: now, type: "MOVE", message: `${playerName} left an unsecured room: -1 energy.` });
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
            logs.push({ ts: now, type: "MOVE", message: `${playerName} moved ${moveResult.direction}.` });

            if (!gameState.deadline && !startedDeadline) {
                const diff = lobbyDifficulty || "NORMAL";
                const minutes = diff === "HARD" ? 10 : diff === "EASY" ? 20 : 15;
                startedDeadline = new Date(Date.now() + minutes * 60000);
            }
        }
    }

    // V24: Move Collision Detection
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

    await Promise.all(updates);

    // V23: Endgame Handling (Defeat Check)
    if (!phaseOverride && nextIntegrity <= 0) {
        phaseOverride = "DEFEAT"; // Or "ABORTED" if we differentiate. Let's use DEFEAT for hull collapse.
        logs.push({ ts: now, type: "MAIN", message: "CRITICAL FAILURE: Hull Integrity compromised. Mission failed." });
    }

    if (mainObjective?.isComplete && players.every(p => p.MapNode?.type === "START")) {
        phaseOverride = "VICTORY";
        logs.push({ ts: now, type: "MAIN", message: "Squad extracted. Mission complete." });
    }

    // V23: Scoring & Persistence
    if (phaseOverride) {
        const isVictory = phaseOverride === "VICTORY";
        const turnCount = gameState.currentTurn || 0;

        // Finalize Run for each player
        for (const p of players) {
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

            // Create GameRun Result
            await (prisma as any).gameRun.create({
                data: {
                    gameId: gameState.id,
                    characterId: p.characterId,
                    difficulty: lobbyDifficulty || "NORMAL",
                    outcome: phaseOverride,
                    rank,
                    score,
                    creditsEarned: Math.floor(score / 2),
                    bossDefeated: isVictory, // Simplification
                    extracted: isVictory, // Simplification
                    turns: turnCount,
                    startedAt: gameState.createdAt, // Approx
                    endedAt: new Date()
                }
            });

            // Update Character Stats
            const charUpdates: any = {
                runsCompleted: { increment: isVictory ? 1 : 0 },
                runsFailed: { increment: isVictory ? 0 : 1 },
                credits: { increment: Math.floor(score / 2) }
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
