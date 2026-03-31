"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Zap, Crosshair, User, Heart, AlertTriangle, Cpu, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Settings2, X } from "lucide-react";
import SectorGrid from "@/components/game/SectorGrid";
import RoomScanner from "@/components/game/RoomScanner";
import MissionLog from "@/components/game/MissionLog";
import ResolutionOverlay from "@/components/game/ResolutionOverlay";
import AudioSettingsPanel from "@/components/audio/AudioSettingsPanel";
import { useAmyGuide, type AmyGuideTransmission } from "@/components/guide/AmyGuideContext";
import AutoFitViewport from "@/components/layout/AutoFitViewport";
import { useAppChrome } from "@/components/ui/AppChromeContext";
import { useToast } from "@/components/ui/Toast";
import { soundManager } from "@/lib/soundManager";

type Facing = "NORTH" | "EAST" | "SOUTH" | "WEST";
type HandFilter = "ALL" | "COMMAND" | "VOID" | "BIOTECH" | "PLASMA" | "ANOMALY";
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
type TraversalPreview = {
    currentNode: any;
    facing: Facing;
    remainingSteps: number;
    totalSteps: number;
    stepIndex: number;
    stepDurationMs: number;
    currentDirection: string | null;
    active: boolean;
};
type RoomEffectState = {
    modifier: number;
    status: "up" | "down" | "neutral" | "unknown";
    label: string;
};

const CARD_SIZE_PRESETS = {
    sm: { width: 60, height: 90 },
    md: { width: 88, height: 120 },
    lg: { width: 96, height: 136 }
} as const;
const HAND_CARD_PRESET = { width: 78, height: 110 } as const;

const HAND_FILTER_ORDER: HandFilter[] = ["ALL", "COMMAND", "VOID", "BIOTECH", "PLASMA", "ANOMALY"];
const MIN_HAND_CARD_WIDTH = 54;
const MIN_HAND_CARD_HEIGHT = 68;
const HAND_VIEWPORT_SAFE_VERTICAL_PADDING = 64;
const HAND_VIEWPORT_FALLBACK_HEIGHT = 220;
const HALLWAY_STEP_INTERVAL_MS = 1080;
const ROOM_STEP_INTERVAL_MS = 720;
const DEFAULT_HAND_CAPACITY = 11;

const getScaledCardHeight = (width: number, preset: { width: number; height: number } = CARD_SIZE_PRESETS.lg) => {
    return Math.max(MIN_HAND_CARD_HEIGHT, Math.round((width / preset.width) * preset.height));
};

const parseJSON = (raw: any, fallback: any) => {
    try { return JSON.parse(raw); } catch { return fallback; }
};

const getLatestMovePayload = (rawLogs: any) => {
    const logs = Array.isArray(rawLogs) ? rawLogs : parseJSON(rawLogs, []);
    if (!Array.isArray(logs) || logs.length === 0) return null;
    const latestMove = [...logs].reverse().find((entry: any) => entry?.type === "MOVE_DATA");
    if (!latestMove) return null;
    const payload = parseJSON(latestMove.message, null);
    if (!payload?.from || !Array.isArray(payload.path) || payload.path.length === 0) return null;
    return { latestMove, payload };
};

const relativeToAbsolute: Record<Facing, Record<string, string>> = {
    NORTH: { FORWARD: "FORWARD", BACK: "BACK", LEFT: "LEFT", RIGHT: "RIGHT" },
    EAST: { FORWARD: "RIGHT", BACK: "LEFT", LEFT: "FORWARD", RIGHT: "BACK" },
    SOUTH: { FORWARD: "BACK", BACK: "FORWARD", LEFT: "RIGHT", RIGHT: "LEFT" },
    WEST: { FORWARD: "LEFT", BACK: "RIGHT", LEFT: "BACK", RIGHT: "FORWARD" }
};
const relativeDirectionOrder = ["FORWARD", "RIGHT", "BACK", "LEFT"] as const;
const worldDirectionVectors: Record<string, { x: number; y: number }> = {
    FORWARD: { x: 0, y: 1 },
    RIGHT: { x: 1, y: 0 },
    BACK: { x: 0, y: -1 },
    LEFT: { x: -1, y: 0 }
};
const worldDirectionVectors3D: Record<string, { x: number; y: number; z: number }> = {
    FORWARD: { x: 0, y: 1, z: 0 },
    RIGHT: { x: 1, y: 0, z: 0 },
    BACK: { x: 0, y: -1, z: 0 },
    LEFT: { x: -1, y: 0, z: 0 },
    UP: { x: 0, y: 0, z: 1 },
    DOWN: { x: 0, y: 0, z: -1 }
};
const suitOpposites: Record<string, string> = { COMMAND: "VOID", VOID: "COMMAND", BIOTECH: "PLASMA", PLASMA: "BIOTECH" };
const normalizeSuit = (suit?: string | null) => (suit || "").toUpperCase();
const getHandRankValue = (card: any) => Number(card?.rank ?? card?.power ?? 0);

const toAbsoluteDirection = (relative: string, facing: Facing) => {
    return relativeToAbsolute[facing]?.[relative] || relative;
};

const toRelativeDirection = (absolute: string, facing: Facing) => {
    if (absolute === "UP" || absolute === "DOWN") return absolute;
    const worldIndex = relativeDirectionOrder.indexOf(absolute as typeof relativeDirectionOrder[number]);
    if (worldIndex === -1) return absolute;
    const facingForward = relativeToAbsolute[facing]?.FORWARD || "FORWARD";
    const facingIndex = relativeDirectionOrder.indexOf(facingForward as typeof relativeDirectionOrder[number]);
    if (facingIndex === -1) return absolute;
    const relativeIndex = (worldIndex - facingIndex + relativeDirectionOrder.length) % relativeDirectionOrder.length;
    return relativeDirectionOrder[relativeIndex];
};

const parseSecretIntel = (raw: any) => {
    const parsed = parseJSON(raw || "{}", {});
    if (Array.isArray(parsed)) {
        return { leads: parsed, hallwayIntel: [] as HallwayIntel[], hallwayScanDepth: 0 };
    }
    if (!parsed || typeof parsed !== "object") {
        return { leads: [] as any[], hallwayIntel: [] as HallwayIntel[], hallwayScanDepth: 0 };
    }
    return {
        leads: Array.isArray(parsed.leads) ? parsed.leads : [],
        hallwayIntel: Array.isArray(parsed.hallwayIntel) ? parsed.hallwayIntel : [],
        hallwayScanDepth: typeof parsed.hallwayScanDepth === "number" ? parsed.hallwayScanDepth : 0
    };
};

const isNodeScanComplete = (node: any) => Boolean(node && (node.type === "START" || node.scanned));
const isNodeSecureComplete = (node: any) => Boolean(node && (node.type === "START" || Number(node.security ?? 0) >= 2));

const movementDirectionFromDelta = (from: any, to: any): string | null => {
    if (!from || !to) return null;
    const dx = Number(to.x) - Number(from.x);
    const dy = Number(to.y) - Number(from.y);
    const dz = Number(to.z) - Number(from.z);
    if (dz > 0) return "UP";
    if (dz < 0) return "DOWN";
    if (dx > 0) return "RIGHT";
    if (dx < 0) return "LEFT";
    if (dy > 0) return "FORWARD";
    if (dy < 0) return "BACK";
    return null;
};

const directionToFacing = (direction: string | null | undefined, fallback: Facing): Facing => {
    switch (direction) {
        case "FORWARD": return "NORTH";
        case "RIGHT": return "EAST";
        case "BACK": return "SOUTH";
        case "LEFT": return "WEST";
        default: return fallback;
    }
};

const toCardinalDirection = (direction: string | null | undefined) => {
    switch (direction) {
        case "FORWARD": return "NORTH";
        case "RIGHT": return "EAST";
        case "BACK": return "SOUTH";
        case "LEFT": return "WEST";
        case "UP": return "UP";
        case "DOWN": return "DOWN";
        default: return direction || "UNKNOWN";
    }
};

const toEndpointLabel = (endpointType: string | null | undefined) => {
    switch ((endpointType || "").toUpperCase()) {
        case "CORRIDOR": return "HALL";
        case "HUB": return "JUNCTION";
        case "START": return "AIRLOCK";
        case "BOSS": return "BOSS";
        case "VOID": return "VOID";
        default: return endpointType || "UNKNOWN";
    }
};

const getRoomEffectForCard = (card: any, roomSuit?: string | null, roomKnown = false): RoomEffectState => {
    if (!roomKnown) {
        return { modifier: 0, status: "unknown", label: "SCAN ROOM" };
    }

    const cardSuit = normalizeSuit(card?.suit || card?.suitName);
    const normalizedRoomSuit = normalizeSuit(roomSuit);
    if (!cardSuit || !normalizedRoomSuit) {
        return { modifier: 0, status: "neutral", label: "STABLE" };
    }
    if (cardSuit === normalizedRoomSuit) {
        return { modifier: 1, status: "up", label: "POWER UP" };
    }
    if (suitOpposites[cardSuit] === normalizedRoomSuit) {
        return { modifier: -1, status: "down", label: "POWER DOWN" };
    }
    return { modifier: 0, status: "neutral", label: "STABLE" };
};

export default function GameInterface() {
    const params = useParams();
    const router = useRouter();
    const { setOverride, clearOverride } = useAmyGuide();
    const { setOverride: setAppChromeOverride } = useAppChrome();
    const [gameState, setGameState] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
    const [isActing, setIsActing] = useState(false);
    const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);
    const [actionTimeLeft, setActionTimeLeft] = useState(0);
    const [missionTimeLeft, setMissionTimeLeft] = useState(0);
    const [showInventory, setShowInventory] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [pendingActionCount, setPendingActionCount] = useState(0); // Reconnect safety
    const [pendingIntent, setPendingIntent] = useState<string | null>(null); // Reconnect safety
    const [lastActionDeadline, setLastActionDeadline] = useState<number | null>(null); // Reconnect safety
    const [actionIntent, setActionIntent] = useState<"MOVE" | "SCAN" | "ATTACK" | "SECURE" | null>(null);
    const [moveDirection, setMoveDirection] = useState<string | null>(null);
    const [exitIntent, setExitIntent] = useState<"ABORT" | "DEPART" | null>(null);
    const [mapZ, setMapZ] = useState<number | null>(null);
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]); // V11 Combat Items
    const [cardFilter, setCardFilter] = useState<HandFilter>("ALL");
    const [showFullMaze, setShowFullMaze] = useState(false);
    const [fullMapFocusDeck, setFullMapFocusDeck] = useState<number | null>(null);
    const [hoveredMapNodeId, setHoveredMapNodeId] = useState<string | null>(null);
    const [selectedMapNodeId, setSelectedMapNodeId] = useState<string | null>(null);
    const [handViewportWidth, setHandViewportWidth] = useState(0);
    const [handViewportHeight, setHandViewportHeight] = useState(0);
    const [resolutionData, setResolutionData] = useState<any>(null); // V22 Visuals
    const [scanFeedback, setScanFeedback] = useState<{
        success: boolean;
        nodePower: number;
        strength: number;
        roomSuit?: string | null;
        scanDepth?: number;
        detectedEnemies?: number;
    } | null>(null);
    const [actionFeedback, setActionFeedback] = useState<{ status: "success" | "error"; label: string } | null>(null); // V23 Action Feedback
    const [roomPanelFeedback, setRoomPanelFeedback] = useState<{ status: "success" | "error"; label: string } | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false); // V23 Card Action Loading State
    const [recentMovement, setRecentMovement] = useState<any>(null);
    const [hallwayTraversal, setHallwayTraversal] = useState<TraversalPreview | null>(null);
    const hasStartedRoundRef = useRef(false);
    const handViewportRef = useRef<HTMLDivElement | null>(null);
    const prevPlayerZRef = useRef<number | null>(null);
    const prevPlayerNodeRef = useRef<any>(null);
    const lastResolutionTsRef = useRef<number>(0);
    const lastMoveDataTsRef = useRef<number>(0);
    const objectiveCompletionRef = useRef<Set<string> | null>(null);
    const traversalTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
    const { addToast } = useToast();
    const lastPileSizeRef = useRef(0);
    const hasReconnectedRef = useRef(false); // Track successful reconnections
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const actionFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const scanFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const roomPanelFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const failureHandledRef = useRef(false);
    const { game, player } = gameState ?? { game: null, player: null };

    // Helper for numeric values with color coding
    const getNumericColor = (value: number, type: "damage" | "healing" | "shield" | "neutral" = "neutral") => {
        if (type === "damage") return "text-red-400";
        if (type === "healing") return "text-green-400";
        if (type === "shield") return "text-yellow-400";
        return "text-white";
    };

    const getNumericValue = (value: number, label: string): number => {
        if (label.toLowerCase().includes("integrity") || label.toLowerCase().includes("hp") || label.toLowerCase().includes("health")) {
            return value > 0 ? 1 : -1;
        }
        return value >= 0 ? 1 : -1;
    };

    // V18: Separate Loadout (Equipped) vs Backpack (Loot)
    // Derived from single persistent inventory list
    const allItems = useMemo(() => {
        return player?.inventory ? JSON.parse(player.inventory) : [];
    }, [player?.inventory]);

    const loadoutItems = useMemo(() => {
        return allItems.filter((i: any) => i.isEquipped);
    }, [allItems]);

    const backpackItems = useMemo(() => {
        return allItems.filter((i: any) => !i.isEquipped);
    }, [allItems]);
    const mapNodes = game?.MapNode || [];
    const clearTraversalSequence = () => {
        traversalTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
        traversalTimeoutsRef.current = [];
        setRecentMovement(null);
    };
    const visualPlayerNode = hallwayTraversal?.currentNode ?? player?.MapNode ?? null;
    const visualFacing = (hallwayTraversal?.facing || player?.facing || "NORTH") as Facing;
    const movementStepsRemaining = hallwayTraversal?.remainingSteps ?? 0;
    const transitStatus = hallwayTraversal
        ? {
            direction: hallwayTraversal.currentDirection || recentMovement?.direction || null,
            stepIndex: hallwayTraversal.stepIndex || 0,
            totalSteps: hallwayTraversal.totalSteps || 0,
            remainingSteps: hallwayTraversal.remainingSteps ?? movementStepsRemaining
        }
        : recentMovement?.hallway
            ? {
                direction: recentMovement.direction || null,
                stepIndex: Math.max(1, Number(recentMovement.remainingSteps ?? 0) + 1),
                totalSteps: Math.max(1, Number(recentMovement.remainingSteps ?? 0) + 1),
                remainingSteps: Number(recentMovement.remainingSteps ?? 0)
            }
            : null;
    const showHallwayCountdown = Boolean(transitStatus);
    const transitDirectionLabel = toCardinalDirection(transitStatus?.direction || "FORWARD");

    const roomInfo = useMemo(() => {
        if (!visualPlayerNode) return null;
        const secret = parseSecretIntel(visualPlayerNode.secretPaths);
        return {
            power: visualPlayerNode.roomPower,
            suit: visualPlayerNode.roomSuit,
            integrity: visualPlayerNode.integrity,
            security: visualPlayerNode.security,
            scanned: isNodeScanComplete(visualPlayerNode),
            secretPaths: secret,
            hallwayIntel: secret.hallwayIntel as HallwayIntel[],
            hallwayScanDepth: secret.hallwayScanDepth as number
        };
    }, [visualPlayerNode]);
    const suitMeta = {
        BIOTECH: { color: "text-red-400", icon: "BIO" },
        PLASMA: { color: "text-orange-400", icon: "PLS" },
        COMMAND: { color: "text-green-400", icon: "CMD" },
        VOID: { color: "text-purple-400", icon: "VOID" },
        ANOMALY: { color: "text-white", icon: "VOID" }
    } as const;
    const roomSuitMeta = roomInfo?.suit ? suitMeta[roomInfo.suit as keyof typeof suitMeta] : null;
    const roomOpposingSuit = roomInfo?.suit ? suitOpposites[normalizeSuit(roomInfo.suit)] ?? null : null;
    const connections = useMemo(() => parseJSON(visualPlayerNode?.connections || "[]", []), [visualPlayerNode?.connections]);
    const roomEnemies = useMemo(() => parseJSON(visualPlayerNode?.enemies || "[]", []), [visualPlayerNode?.enemies]);
    const hasEnemies = roomEnemies.length > 0;
    const isAirlock = player?.MapNode?.type === "START";
    const visualIsAirlock = visualPlayerNode?.type === "START";
    const emergencyExitLabel = isAirlock ? "RETURN TO SHIP" : "ABANDON MISSION";
    const emergencyExitIntent: "DEPART" | "ABORT" = isAirlock ? "DEPART" : "ABORT";
    const roomHallwayIntel = roomInfo?.hallwayIntel || [];
    const visibleRoomHallwayIntel = useMemo(
        () => roomHallwayIntel.map((intel: HallwayIntel) => ({
            ...intel,
            directionLabel: toCardinalDirection(intel.direction),
            endpointLabel: toEndpointLabel(intel.endpointType)
        })),
        [roomHallwayIntel]
    );
    const roomChromeMeta = useMemo(() => {
        const nodeType = String(visualPlayerNode?.type || "").toUpperCase();
        const iconClassName = roomSuitMeta?.color || "text-neon-cyan";
        if (nodeType === "START") {
            return {
                title: "Airlock",
                colorClass: "text-neon-cyan",
                iconNode: <ArrowUp className="h-3 w-3" />
            };
        }
        if (nodeType === "CORRIDOR") {
            return {
                title: "Transit Corridor",
                colorClass: "text-slate-300",
                iconNode: <ArrowRight className="h-3 w-3" />
            };
        }
        if (nodeType === "BOSS") {
            return {
                title: roomInfo?.suit ? `${roomInfo.suit} Core` : "Core Chamber",
                colorClass: roomSuitMeta?.color || "text-red-400",
                iconNode: roomInfo?.suit === "COMMAND"
                    ? <Crosshair className={`h-3 w-3 ${iconClassName}`} />
                    : roomInfo?.suit === "BIOTECH"
                        ? <Heart className={`h-3 w-3 ${iconClassName}`} />
                        : roomInfo?.suit === "PLASMA"
                            ? <Zap className={`h-3 w-3 ${iconClassName}`} />
                            : roomInfo?.suit === "VOID"
                                ? <Shield className={`h-3 w-3 ${iconClassName}`} />
                                : <AlertTriangle className="h-3 w-3 text-red-400" />
            };
        }
        if (roomInfo?.scanned && roomInfo?.suit) {
            return {
                title: `${roomInfo.suit} Chamber`,
                colorClass: roomSuitMeta?.color || "text-neon-cyan",
                iconNode: roomInfo.suit === "COMMAND"
                    ? <Crosshair className={`h-3 w-3 ${iconClassName}`} />
                    : roomInfo.suit === "BIOTECH"
                        ? <Heart className={`h-3 w-3 ${iconClassName}`} />
                        : roomInfo.suit === "PLASMA"
                            ? <Zap className={`h-3 w-3 ${iconClassName}`} />
                            : roomInfo.suit === "VOID"
                                ? <Shield className={`h-3 w-3 ${iconClassName}`} />
                                : <AlertTriangle className="h-3 w-3 text-white" />
            };
        }
        return {
            title: nodeType ? `${nodeType} Node` : "Mission Deck",
            colorClass: "text-neon-cyan",
            iconNode: <Crosshair className="h-3 w-3 text-neon-cyan" />
        };
    }, [roomInfo?.scanned, roomInfo?.suit, roomSuitMeta?.color, visualPlayerNode?.type]);
    const playerMarkers = useMemo(() => {
        const markers: { id: string; x: number; y: number; z: number; isCurrent?: boolean }[] = [];
        if (visualPlayerNode) {
            markers.push({
                id: player.characterId,
                x: visualPlayerNode.x,
                y: visualPlayerNode.y,
                z: visualPlayerNode.z,
                isCurrent: true
            });
        }
        (gameState?.otherPlayers || []).forEach((op: any) => {
            if (!op?.node) return;
            markers.push({
                id: op.id,
                x: op.node.x,
                y: op.node.y,
                z: op.node.z,
                isCurrent: false
            });
        });
        return markers;
    }, [visualPlayerNode, player?.characterId, gameState?.otherPlayers]);
    const missionObjectives = Array.isArray(game?.objectives) ? game.objectives : [];
    const availableDecks = useMemo<number[]>(
        () => Array.from(new Set<number>(mapNodes.map((node: any) => Number(node.z ?? 0)))).sort((a: number, b: number) => a - b),
        [mapNodes]
    );
    const mapNodeById = useMemo<Map<string, any>>(
        () => new Map<string, any>(mapNodes.map((node: any) => [node.id, node])),
        [mapNodes]
    );
    const mapNodeByCoord = useMemo<Map<string, any>>(
        () => new Map<string, any>(mapNodes.map((node: any) => [`${Number(node.x)}:${Number(node.y)}:${Number(node.z)}`, node])),
        [mapNodes]
    );
    const hoveredMapNode: any = hoveredMapNodeId ? mapNodeById.get(hoveredMapNodeId) ?? null : null;
    const selectedMapNode: any = selectedMapNodeId ? mapNodeById.get(selectedMapNodeId) ?? null : null;
    const inspectedMapNode: any = hoveredMapNode ?? selectedMapNode ?? null;
    const inspectedMapSuitMeta = inspectedMapNode?.roomSuit ? suitMeta[inspectedMapNode.roomSuit as keyof typeof suitMeta] : null;
    const inspectedMapConnections = useMemo(
        () => inspectedMapNode ? parseJSON(inspectedMapNode.connections || "[]", []) : [],
        [inspectedMapNode?.connections]
    );
    const inspectedMapRevealState = Boolean(
        inspectedMapNode && (
            inspectedMapNode.type === "START"
            || inspectedMapNode.type === "CORRIDOR"
            || inspectedMapNode.scanned
        )
    );
    const inspectedMapConnectionLabels = useMemo(
        () => inspectedMapRevealState ? inspectedMapConnections.map((connection: string) => toCardinalDirection(connection)) : [],
        [inspectedMapConnections, inspectedMapRevealState]
    );
    const inspectedMapStatus = hoveredMapNode
        ? "HOVER"
        : selectedMapNode
            ? "LOCKED"
            : null;
    const inspectedMapIsBoss = Boolean(inspectedMapNode && (inspectedMapNode.type === "BOSS" || inspectedMapNode.id === game?.objectiveNodeId));
    const inspectedMapNodeLabel = inspectedMapNode
        ? (inspectedMapNode.type === "CORRIDOR" ? "HALL" : inspectedMapNode.type)
        : "ROOM";
    const inspectedMapStateLabel = inspectedMapNode
        ? (inspectedMapNode.scanned ? "SCANNED" : inspectedMapNode.isExplored ? "EXPLORED" : "UNSEEN")
        : "UNSEEN";
    const inspectedMapLinkSummary = !inspectedMapRevealState
        ? "UNKNOWN"
        : inspectedMapConnectionLabels.length > 0
            ? inspectedMapConnectionLabels.join(" / ")
            : "SEALED";
    const minDeck = availableDecks[0] ?? 0;
    const maxDeck = availableDecks[availableDecks.length - 1] ?? 0;
    const airlockNode = useMemo(
        () => mapNodes.find((node: any) => node?.type === "START") ?? null,
        [mapNodes]
    );
    const playerRoleDisplay = useMemo(() => {
        const cls = String(player?.character?.class || "").toLowerCase();
        if (cls === "marine") return { name: "COMMAND", color: "text-green-500", border: "border-green-500/50", bg: "bg-green-500/10" };
        if (cls === "engineer") return { name: "PLASMA", color: "text-orange-500", border: "border-orange-500/50", bg: "bg-orange-500/10" };
        if (cls === "scientist") return { name: "BIOTECH", color: "text-red-500", border: "border-red-500/50", bg: "bg-red-500/10" };
        if (cls === "scout") return { name: "VOID", color: "text-purple-500", border: "border-purple-500/50", bg: "bg-purple-500/10" };
        return { name: "UNKNOWN", color: "text-gray-500", border: "border-gray-500", bg: "bg-gray-500/10" };
    }, [player?.character?.class]);
    const playerHealthTone = !player
        ? "text-gray-400"
        : player.hp <= Math.max(1, Math.ceil((player.maxHp || 1) * 0.35))
            ? "text-red-400"
            : player.hp < (player.maxHp || 0)
                ? "text-yellow-300"
                : "text-green-400";
    const airlockDistance = useMemo(() => {
        if (!visualPlayerNode?.id || !airlockNode?.id) return null;
        if (visualPlayerNode.id === airlockNode.id) return 0;

        const queue: Array<{ node: any; distance: number }> = [{ node: visualPlayerNode, distance: 0 }];
        const visited = new Set<string>([String(visualPlayerNode.id)]);

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current?.node) continue;

            const connectionDirections = parseJSON(current.node.connections || "[]", []);
            for (const direction of connectionDirections) {
                const delta = worldDirectionVectors3D[direction];
                if (!delta) continue;

                const nextNode = mapNodeByCoord.get(
                    `${Number(current.node.x) + delta.x}:${Number(current.node.y) + delta.y}:${Number(current.node.z) + delta.z}`
                );
                if (!nextNode?.id) continue;

                const nextId = String(nextNode.id);
                if (visited.has(nextId)) continue;
                if (nextId === String(airlockNode.id)) return current.distance + 1;

                visited.add(nextId);
                queue.push({ node: nextNode, distance: current.distance + 1 });
            }
        }

        return null;
    }, [airlockNode?.id, mapNodeByCoord, visualPlayerNode]);
    const airlockDistanceLabel = airlockDistance === null
        ? "NO ROUTE"
        : airlockDistance === 0
            ? "AT AIRLOCK"
            : `${airlockDistance} sectors`;
    const playerHand = (player?.hand as any[]) || [];
    const handCapacity = Number((player as any)?.handCapacity ?? (player as any)?.maxHand ?? DEFAULT_HAND_CAPACITY) || DEFAULT_HAND_CAPACITY;
    const handEntries = useMemo(
        () => playerHand.map((card: any, index: number) => ({ card, index })),
        [playerHand]
    );
    const visibleHandEntries = useMemo(
        () => {
            const filtered = handEntries.filter(({ card }) => cardFilter === "ALL" || card.suit === cardFilter);

            if (cardFilter !== "ALL") {
                return filtered;
            }

            return [...filtered].sort((a, b) => {
                const rankDelta = getHandRankValue(b.card) - getHandRankValue(a.card);
                if (rankDelta !== 0) return rankDelta;
                return a.index - b.index;
            });
        },
        [handEntries, cardFilter]
    );
    const hiddenSelectedCount = useMemo(
        () => selectedCardIndices.filter((index) => !visibleHandEntries.some((entry) => entry.index === index)).length,
        [selectedCardIndices, visibleHandEntries]
    );
    const handLayout = useMemo(() => {
        const preset = HAND_CARD_PRESET;
        const count = visibleHandEntries.length;
        const effectiveHandViewportHeight = handViewportHeight || HAND_VIEWPORT_FALLBACK_HEIGHT;
        const maxCardHeight = Math.max(MIN_HAND_CARD_HEIGHT, effectiveHandViewportHeight - HAND_VIEWPORT_SAFE_VERTICAL_PADDING);

        if (!count || !handViewportWidth) {
            const cardHeight = Math.min(preset.height, maxCardHeight);
            return {
                cardWidth: preset.width,
                cardHeight,
                gap: 10,
                wrapperHeight: cardHeight + Math.max(28, Math.round(cardHeight * 0.14)),
                selectionLift: Math.min(9, Math.max(5, Math.round(cardHeight * 0.05))),
                shouldPan: false
            };
        }

        const edgeInset = count >= 10 ? 42 : count >= 8 ? 30 : 18;
        const availableWidth = Math.max(handViewportWidth - edgeInset, preset.width);
        let cardWidth: number = preset.width;
        let gap: number = 10;
        const fitWidth = (targetWidth: number) => {
            cardWidth = Math.max(MIN_HAND_CARD_WIDTH, Math.floor(targetWidth));
        };

        const resolveGap = () => {
            if (count <= 1) {
                gap = 0;
                return;
            }

            const fittedGap = Math.floor((availableWidth - count * cardWidth) / Math.max(count - 1, 1));
            const maxOverlap = Math.round(cardWidth * 0.94);
            gap = fittedGap >= 4
                ? Math.min(10, fittedGap)
                : Math.max(-maxOverlap, fittedGap);
        };

        if (count * cardWidth + (count - 1) * gap > availableWidth) {
            fitWidth((availableWidth - (count - 1) * 4) / count);
        }

        let cardHeight = getScaledCardHeight(cardWidth, preset);
        if (cardHeight > maxCardHeight) {
            const widthFromHeight = Math.floor((maxCardHeight / preset.height) * preset.width);
            fitWidth(Math.min(cardWidth, widthFromHeight));
            cardHeight = Math.min(maxCardHeight, getScaledCardHeight(cardWidth, preset));
        }

        resolveGap();

        if (count * cardWidth + (count - 1) * gap > availableWidth && gap >= 0) {
            fitWidth((availableWidth - (count - 1) * 2) / count);
            cardHeight = Math.min(maxCardHeight, getScaledCardHeight(cardWidth, preset));
            resolveGap();
        }

        const shouldPan = false;

        return {
            cardWidth,
            cardHeight,
            gap,
            wrapperHeight: cardHeight + Math.max(12, Math.round(cardHeight * 0.05)),
            selectionLift: Math.min(7, Math.max(4, Math.round(cardHeight * 0.04))),
            shouldPan
        };
    }, [visibleHandEntries.length, handViewportHeight, handViewportWidth]);

    // Hoisted Logic for Hooks
    const inActionPhase = game?.roundPhase === "ACTION";
    const hasActionTimer = !!game?.actionDeadline;

    useEffect(() => {
        if (!game || !player) return;
        const source = `game:${String(params.id)}`;
        const dynamicMessages: AmyGuideTransmission[] = [];

        if (hallwayTraversal) {
            dynamicMessages.push({
                kind: "guide",
                title: "Transit Relay",
                text: `Moving ${toCardinalDirection(hallwayTraversal.currentDirection || "FORWARD")} through the hull. ${hallwayTraversal.remainingSteps} sectors remain before the path resolves.`
            });
        } else if (!roomInfo?.scanned) {
            dynamicMessages.push({
                kind: "warning",
                title: "Unscanned Room",
                text: "You are inside an unresolved chamber. Scan first so the connected hallways reveal with actual depth instead of guesswork."
            });
        } else {
            dynamicMessages.push({
                kind: "guide",
                title: "Local Telemetry",
                text: `${toEndpointLabel(visualPlayerNode?.type)} node, suit ${roomInfo?.suit || "UNKNOWN"}, power ${roomInfo?.power ?? "?"}. ${visibleRoomHallwayIntel.length} scanned exits in the current readout.`
            });
        }

        if (hasEnemies) {
            dynamicMessages.push({
                kind: "warning",
                title: "Hostile Contact",
                text: `${roomEnemies.length} hostile signature${roomEnemies.length === 1 ? "" : "s"} in this sector. Attack lines are live even if your weapon loadout is weak.`
            });
        } else if (typeof airlockDistance === "number") {
            dynamicMessages.push({
                kind: "guide",
                title: "Extraction Vector",
                text: airlockDistance === 0
                    ? "You are sitting on the airlock. Return to ship if the run has paid out enough."
                    : `Airlock is ${airlockDistance} sector${airlockDistance === 1 ? "" : "s"} away. Keep an extraction route in hand before mission time collapses.`
            });
        }

        if (inActionPhase && !actionIntent && actionTimeLeft > 0 && actionTimeLeft <= 8) {
            dynamicMessages.unshift({
                kind: "warning",
                title: "Turn Expiring",
                text: `${actionTimeLeft}s left to lock an action. If you do nothing, the turn burns and the run bleeds tempo.`
            });
        } else if (missionTimeLeft > 0) {
            dynamicMessages.push({
                kind: missionTimeLeft <= 60 ? "warning" : "lore",
                title: missionTimeLeft <= 60 ? "Mission Clock" : "Archive Fragment",
                text: missionTimeLeft <= 60
                    ? `${missionTimeLeft}s remain on the mission clock. If it reaches zero, the run is over immediately.`
                    : "Celeste heard the blueprint signal first. Elias kept insisting that every word about it needed to be based in something real, or the ship would swallow the meaning."
            });
        }

        setOverride({ source, messages: dynamicMessages.slice(0, 4) });
    }, [
        actionIntent,
        actionTimeLeft,
        airlockDistance,
        game,
        hallwayTraversal,
        hasEnemies,
        inActionPhase,
        missionTimeLeft,
        params.id,
        player,
        roomEnemies.length,
        roomInfo,
        setOverride,
        visibleRoomHallwayIntel.length,
        visualPlayerNode?.type,
    ]);

    useEffect(() => {
        const source = `game:${String(params.id)}`;
        return () => clearOverride(source);
    }, [clearOverride, params.id]);

    // Fetch Game State
    useEffect(() => {
        const fetchGameState = async () => {
            try {
                const res = await fetch(`/api/game/state?gameId=${params.id}`);
                const data = await res.json();

                if (data.error) {
                    if (res.status === 410 || data.error.includes("Corrupted")) {
                        addToast(data.error, "error");
                        soundManager.actionFail();
                        router.push("/lobby/browse");
                        return;
                    }
                }

                // Parse Hand if string
                if (data.player && typeof data.player.hand === 'string') {
                    data.player.hand = JSON.parse(data.player.hand);
                }

                // Parse Pile if string
                if (data.game && typeof data.game.currentPile === 'string') {
                    data.game.currentPile = JSON.parse(data.game.currentPile);
                }

                if (data.game && typeof data.game.turnOrder === 'string') {
                    data.game.turnOrder = JSON.parse(data.game.turnOrder);
                }

                // RECONNECT SAFETY: Capture pending actions for warnings
                if (data.game && data.game.pendingActions) {
                    try {
                        const parsed = JSON.parse(data.game.pendingActions);
                        setPendingActionCount(parsed.length);
                        // Check if user has pending action
                        if (data.player && parsed.some((p: any) => p.playerId === data.player.characterId)) {
                            setPendingIntent("You have a pending action!");
                        }
                    } catch (e) {
                        setPendingActionCount(0);
                    }
                }

                if (data.game && data.game.actionDeadline) {
                    try {
                        const deadline = new Date(data.game.actionDeadline).getTime();
                        setLastActionDeadline(deadline);
                    } catch (e) {
                        setLastActionDeadline(null);
                    }
                }

                if (data.game && typeof data.game.objectives === 'string') {
                    data.game.objectives = JSON.parse(data.game.objectives);
                }

                const latestMoveData = getLatestMovePayload(data.game?.gameLog);
                if (latestMoveData) {
                    const { latestMove, payload } = latestMoveData;
                    const isFreshMove = Date.now() - (latestMove.ts || 0) < 15000;
                    const isUnconsumedMove = lastMoveDataTsRef.current !== latestMove.ts;
                    if (isFreshMove && isUnconsumedMove && data.player && payload.from?.id) {
                        data.player.MapNode = payload.from;
                        data.player.nodeId = payload.from.id;
                        if (payload.fromFacing) {
                            data.player.facing = payload.fromFacing;
                        }
                    }
                }

                setGameState(data);
                setLoading(false);

                // Track Turn Changes to Reset Phase
                const activePlayerId = data.game.turnOrder?.[data.game.activePlayerIndex];
                if (activePlayerId !== currentTurnId) {
                    setCurrentTurnId(activePlayerId);
                    setSelectedCardIndices([]);
                }

                if (!data.player) {
                    // Redirect or show error? For now just allow it to continue but don't crash
                    // This happens for spectators or errors
                }

            } catch (e) {
                console.error("Failed to fetch game state", e);
            }
        };

        fetchGameState();
        const interval = setInterval(fetchGameState, 2000); // Poll every 2s

        return () => clearInterval(interval);
    }, [params.id, currentTurnId]);

    useEffect(() => {
        const node = handViewportRef.current;
        if (!node) return;

        const updateViewportSize = () => {
            setHandViewportWidth(node.clientWidth);
            setHandViewportHeight(node.clientHeight);
        };
        updateViewportSize();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateViewportSize);
            return () => window.removeEventListener("resize", updateViewportSize);
        }

        const observer = new ResizeObserver(() => updateViewportSize());
        observer.observe(node);

        return () => observer.disconnect();
    }, [showInventory, showSettings]);

    useEffect(() => {
        return () => {
            if (actionFeedbackTimeoutRef.current) {
                clearTimeout(actionFeedbackTimeoutRef.current);
            }
            if (scanFeedbackTimeoutRef.current) {
                clearTimeout(scanFeedbackTimeoutRef.current);
            }
            if (roomPanelFeedbackTimeoutRef.current) {
                clearTimeout(roomPanelFeedbackTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!selectedMapNodeId) return;
        if (mapNodeById.has(selectedMapNodeId)) return;
        setSelectedMapNodeId(null);
    }, [mapNodeById, selectedMapNodeId]);

    useEffect(() => {
        if (!availableDecks.length) return;
        setFullMapFocusDeck((current) => {
            if (typeof current === "number" && availableDecks.includes(current)) return current;
            if (selectedMapNode?.z != null && availableDecks.includes(Number(selectedMapNode.z))) return Number(selectedMapNode.z);
            if (visualPlayerNode?.z != null && availableDecks.includes(Number(visualPlayerNode.z))) return Number(visualPlayerNode.z);
            return availableDecks[availableDecks.length - 1];
        });
    }, [availableDecks, visualPlayerNode?.z, selectedMapNode?.z]);

    // RECONNECT SAFETY: Beforeunload warning (First instance - polling interval)
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // Only warn if:
            // 1. We're in ACTION phase (timer is running)
            // 2. User has a pending action OR timer is active
            // 3. Not a navigation to a new game page
            const inAction = inActionPhase;
            const hasPending = pendingActionCount > 0;
            const hasTimer = lastActionDeadline && lastActionDeadline > Date.now();

            if ((inAction || hasPending || hasTimer) && params.id && !router.push.toString().includes(String(params.id))) {
                e.preventDefault();
                e.returnValue = ''; // Chrome requires return value
                return '';
            }

            // Set reconnect flag when user is about to reload
            hasReconnectedRef.current = true;
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [inActionPhase, pendingActionCount, lastActionDeadline, params.id, router]);

    // Auto-start round if we're stuck in DRAW
    useEffect(() => {
        if (!game?.roundPhase) return;
        if (game.roundPhase === "DRAW" && !hasStartedRoundRef.current) {
            hasStartedRoundRef.current = true;
            fetch('/api/game/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: params.id, action: "START" })
            }).finally(() => {
                setTimeout(() => { hasStartedRoundRef.current = false; }, 1000);
            });
        }
    }, [game?.roundPhase, params.id]);

    useEffect(() => {
        const failed = game?.phase === "FAILED" || game?.roundPhase === "FAILED" || game?.phase === "DEFEAT";
        if (!failed || !params.id || failureHandledRef.current) return;

        failureHandledRef.current = true;
        soundManager.setMusicScene("default");
        soundManager.actionFail();
        addToast("CRITICAL FAILURE: mission lost.", "error");

        const timeout = setTimeout(() => {
            router.push(`/game/${params.id}/summary`);
        }, 1400);

        return () => clearTimeout(timeout);
    }, [game?.phase, game?.roundPhase, params.id, router, addToast]);

    // Action Timer Logic
    useEffect(() => {
        const target = gameState?.game?.actionDeadline; // Timestamp like 1712391293022
        if (!target) {
            setActionTimeLeft(0);
            return;
        }
        const updateTimer = () => {
            const now = Date.now();
            // If target is a number (timestamp)
            const end = typeof target === 'number' ? target : new Date(target).getTime();
            const diff = Math.max(0, Math.ceil((end - now) / 1000));
            setActionTimeLeft(diff);

            // Client-side auto-play trigger for visual effect or last-ditch attempt
            // Usually server handles this, but we can animate "LOCKED"
            if (diff <= 0 && !isActing && !actionIntent && inActionPhase) {
                // Time's up!
            }
        };
        updateTimer();
        const interval = setInterval(updateTimer, 500); // 0.5s for smoother countdown if we show ms
        return () => clearInterval(interval);
    }, [gameState?.game?.actionDeadline, inActionPhase, isActing, actionIntent]);

    // Mission Timer Logic
    useEffect(() => {
        const target = gameState?.game?.deadline;
        if (!target) {
            setMissionTimeLeft(0);
            return;
        }
        const updateTimer = () => {
            const now = Date.now();
            const end = new Date(target).getTime();
            const diff = Math.max(0, Math.floor((end - now) / 1000));
            setMissionTimeLeft(diff);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [gameState?.game?.deadline]);

    // RECONNECT SAFETY: Beforeunload warning
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // Only warn if:
            // 1. We're in ACTION phase (timer is running)
            // 2. User has a pending action OR timer is active
            // 3. Not a navigation to a new game page
            const inAction = inActionPhase;
            const hasPending = pendingActionCount > 0;
            const hasTimer = lastActionDeadline && lastActionDeadline > Date.now();

            if ((inAction || hasPending || hasTimer) && params.id && !router.push.toString().includes(String(params.id))) {
                e.preventDefault();
                e.returnValue = ''; // Chrome requires return value
                return '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [inActionPhase, pendingActionCount, lastActionDeadline, params.id, router]);

    // RECONNECT SAFETY: Show confirmation modal on refresh with pending action summary
    const showReconnectWarning = inActionPhase && (pendingActionCount > 0 || (lastActionDeadline && lastActionDeadline > Date.now()));

    // RECONNECT SUCCESS: Set flag before page unload (user is reloading) - Second instance
    useEffect(() => {
        const handleBeforeUnload = () => {
            hasReconnectedRef.current = true;
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // RECONNECT SUCCESS: Detect when reconnection restored game state successfully
    useEffect(() => {
        // Clear previous reconnect timeout if any
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        // If we have no pending actions AND no active timer AND we're in action phase,
        // this means we successfully reconnected
        if (!showReconnectWarning && inActionPhase && !isActing && !actionIntent && hasReconnectedRef.current) {
            // Show success feedback
            addToast(
                "✅ Reconnected! Game state restored. Your turn is ready.",
                "success"
            );

            // Auto-hide after 4 seconds
            reconnectTimeoutRef.current = setTimeout(() => {
                hasReconnectedRef.current = false;
            }, 4000);
        }
    }, [showReconnectWarning, inActionPhase, isActing, actionIntent, addToast]);

    // Track when page was last loaded (for reconnect detection)
    useEffect(() => {
        // Reset reconnect flag on component mount (simulating initial load)
        hasReconnectedRef.current = false;
    }, [params.id]);

    // If showing warning, add a subtle indicator in UI
    useEffect(() => {
        if (showReconnectWarning && !isActing && !actionIntent) {
            addToast(
                "⚠️ You have a pending action. Press Refresh or Reload to resume.",
                "info"
            );
        }
    }, [showReconnectWarning, isActing, actionIntent, addToast]);

    // RECONNECT SAFETY: Warning Banner for Pending Actions
    if (showReconnectWarning && !isActing && !actionIntent && !resolutionData) {
        return (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-96">
                <div className="bg-yellow-500/10 border border-yellow-500/50 backdrop-blur-md rounded-lg p-3 flex items-start gap-3 animate-in slide-in-from-top-4">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <div className="text-yellow-500 text-xs font-bold uppercase tracking-widest mb-1">Reconnect Required</div>
                        <p className="text-[10px] text-yellow-200/80">
                            You have a pending action in the ACTION WINDOW.
                            Refresh or Reload this page to resume your turn.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Airlock forces a forward move to begin
    useEffect(() => {
        if (!player?.MapNode) return;
        if (isAirlock) {
            setActionIntent("MOVE");
            setMoveDirection("FORWARD");
        }
    }, [isAirlock, player?.MapNode]);

    useEffect(() => {
        const playerZ = player?.MapNode?.z;
        if (playerZ === undefined || playerZ === null) return;
        if (mapZ === null || mapZ === prevPlayerZRef.current) {
            setMapZ(playerZ);
        }
        prevPlayerZRef.current = playerZ;
    }, [player?.MapNode?.z, mapZ]);

    useEffect(() => {
        return () => clearTraversalSequence();
    }, []);

    useEffect(() => {
        const currentNode = player?.MapNode;
        if (!currentNode?.id) return;

        prevPlayerNodeRef.current = {
            id: currentNode.id,
            x: currentNode.x,
            y: currentNode.y,
            z: currentNode.z,
            type: currentNode.type
        };
    }, [player?.MapNode?.id, player?.MapNode?.x, player?.MapNode?.y, player?.MapNode?.z, player?.MapNode?.type]);

    useEffect(() => {
        if (!recentMovement?.ts) return;
        const timeout = setTimeout(() => setRecentMovement(null), Math.max(260, (recentMovement?.durationMs ?? 420) + 120));
        return () => clearTimeout(timeout);
    }, [recentMovement?.ts, recentMovement?.durationMs]);

    // V22: Listen for Resolution Data in Log stream
    useEffect(() => {
        const logs = gameState?.game?.gameLog ? parseJSON(gameState.game.gameLog, []) : [];
        if (logs.length === 0) return;

        // Check ONLY the very last log entry for a new resolution event
        const latest = logs[logs.length - 1];

        if (latest && latest.type === "RESOLUTION_DATA") {
            // Only trigger if it's fresh (within 5s) and we haven't seen it yet
            // Note: in a polled environment, we might see the same log multiple ties.
            // We track by Timestamp.
            const isFresh = Date.now() - (latest.ts || 0) < 8000; // 8s window
            if (isFresh && lastResolutionTsRef.current !== latest.ts) {
                const data = parseJSON(latest.message, null);
                if (data) {
                    if (data.type === "SCAN") {
                        setScanFeedback({
                            success: Boolean(data.success),
                            nodePower: Number(data.nodePower || 0),
                            strength: Number(data.strength || 0),
                            roomSuit: data.roomSuit || null,
                            scanDepth: Number(data.scanDepth || 0),
                            detectedEnemies: Number(data.detectedEnemies || 0)
                        });
                        if (scanFeedbackTimeoutRef.current) {
                            clearTimeout(scanFeedbackTimeoutRef.current);
                        }
                        scanFeedbackTimeoutRef.current = setTimeout(() => setScanFeedback(null), 2200);
                        triggerRoomPanelFeedback(
                            Boolean(data.success) ? "success" : "error",
                            Boolean(data.success)
                                ? `SCAN SUCCESS · PWR ${Number(data.nodePower || 0)} · DEPTH ${Number(data.scanDepth || 0)}`
                                : `SCAN FAILED · PWR ${Number(data.nodePower || 0)}`
                        );
                        soundManager.scanResolve(Boolean(data.success), Number(data.nodePower || 0));
                    } else {
                        const resolutionType = String(data.type || "ACTION").toUpperCase();
                        const resolutionLabel = resolutionType === "ATTACK"
                            ? (Boolean(data.success) ? "ENGAGE SUCCESS" : "ENGAGE FAILED")
                            : resolutionType === "SECURE"
                                ? (Boolean(data.success) ? "SECURE SUCCESS" : "SECURE FAILED")
                                : `${resolutionType} ${Boolean(data.success) ? "SUCCESS" : "FAILED"}`;
                        triggerRoomPanelFeedback(Boolean(data.success) ? "success" : "error", resolutionLabel);
                        setResolutionData(data);
                    }
                    lastResolutionTsRef.current = latest.ts;
                }
            }
        }
    }, [gameState?.game?.gameLog]);

    useEffect(() => {
        const objectives = Array.isArray(game?.objectives) ? game.objectives : [];
        const completedIds = new Set<string>(
            objectives
                .filter((objective: any) => objective?.isComplete && objective?.id)
                .map((objective: any) => String(objective.id))
        );

        if (!objectiveCompletionRef.current) {
            objectiveCompletionRef.current = completedIds;
            return;
        }

        const previous = objectiveCompletionRef.current;
        const newlyCompleted = objectives.filter((objective: any) => objective?.isComplete && objective?.id && !previous.has(String(objective.id)));
        if (newlyCompleted.length > 0) {
            soundManager.objectiveComplete();
            newlyCompleted.forEach((objective: any) => {
                addToast(`${objective.type === "MAIN" ? "PRIMARY" : "OBJECTIVE"} COMPLETE: ${objective.description}`, "success");
            });
        }

        objectiveCompletionRef.current = completedIds;
    }, [game?.objectives, addToast]);

    useEffect(() => {
        const latestMoveData = getLatestMovePayload(gameState?.game?.gameLog);
        if (!latestMoveData) return;
        const { latestMove, payload } = latestMoveData;

        const isFresh = Date.now() - (latestMove.ts || 0) < 12000;
        if (!isFresh || lastMoveDataTsRef.current === latestMove.ts) return;
        const path = Array.isArray(payload.path) ? payload.path : [];
        if (path.length === 0) return;

        clearTraversalSequence();

        const initialDirection = movementDirectionFromDelta(payload.from, path[0]) || payload.direction || null;
        const originFacing = (payload.fromFacing || player?.facing || "NORTH") as Facing;
        let rollingFacing = originFacing;
        const startNode = payload.from || path[0];
        const stepDurations = path.map((node: any, index: number) => {
            const fromNode = index === 0 ? payload.from : path[index - 1];
            const isVerticalStep = Number(fromNode?.z) !== Number(node?.z);
            const isHallwayStep = fromNode?.type === "CORRIDOR" || node?.type === "CORRIDOR";
            return isVerticalStep ? 680 : isHallwayStep ? HALLWAY_STEP_INTERVAL_MS : ROOM_STEP_INTERVAL_MS;
        });
        const startDelayMs = Math.max(180, Math.round((stepDurations[0] || ROOM_STEP_INTERVAL_MS) * 0.32));
        let elapsedMs = startDelayMs;

        setHallwayTraversal({
            currentNode: startNode,
            facing: originFacing,
            remainingSteps: path.length,
            totalSteps: path.length,
            stepIndex: 0,
            stepDurationMs: stepDurations[0] || ROOM_STEP_INTERVAL_MS,
            currentDirection: initialDirection,
            active: true
        });

        path.forEach((node: any, index: number) => {
            const fromNode = index === 0 ? payload.from : path[index - 1];
            const stepDirection = movementDirectionFromDelta(fromNode, node) || payload.direction || null;
            const stepStartFacing = rollingFacing;
            const stepFacing = directionToFacing(stepDirection, stepStartFacing);
            rollingFacing = stepFacing;
            const remainingSteps = Math.max(0, path.length - (index + 1));
            const stepDurationMs = stepDurations[index] || ROOM_STEP_INTERVAL_MS;
            const shouldPlayFootstep = path.length > 1 || fromNode?.type === "CORRIDOR" || node?.type === "CORRIDOR" || Number(fromNode?.z) !== Number(node?.z);
            const startAtMs = elapsedMs;
            const finishAtMs = startAtMs + stepDurationMs;

            const stepStartTimeout = setTimeout(() => {
                setRecentMovement({
                    from: { x: fromNode.x, y: fromNode.y, z: fromNode.z, type: fromNode.type },
                    to: { x: node.x, y: node.y, z: node.z, type: node.type },
                    direction: stepDirection,
                    hallway: fromNode.type === "CORRIDOR" || node.type === "CORRIDOR",
                    remainingSteps,
                    durationMs: stepDurationMs,
                    ts: Date.now()
                });
                setHallwayTraversal({
                    currentNode: fromNode,
                    facing: stepStartFacing,
                    remainingSteps: Math.max(1, path.length - index),
                    totalSteps: path.length,
                    stepIndex: index,
                    stepDurationMs,
                    currentDirection: stepDirection,
                    active: true
                });
                if (shouldPlayFootstep) {
                    soundManager.hallwayStep(index, Number(payload.hallwaySteps || path.length));
                }
            }, startAtMs);

            const stepFinishTimeout = setTimeout(() => {
                setHallwayTraversal({
                    currentNode: node,
                    facing: stepFacing,
                    remainingSteps,
                    totalSteps: path.length,
                    stepIndex: index + 1,
                    stepDurationMs,
                    currentDirection: remainingSteps > 0 ? stepDirection : null,
                    active: remainingSteps > 0
                });
                if (index === path.length - 1) {
                    const finishTimeout = setTimeout(() => {
                        setHallwayTraversal(null);
                    }, 120);
                    traversalTimeoutsRef.current.push(finishTimeout);
                }
            }, finishAtMs);

            traversalTimeoutsRef.current.push(stepStartTimeout, stepFinishTimeout);
            elapsedMs = finishAtMs;
        });

        lastMoveDataTsRef.current = latestMove.ts;
    }, [gameState?.game?.gameLog, player?.facing]);


    // AI Move Detector - REMOVED (Handled by Server Response)
    useEffect(() => {
        if (!gameState?.game?.currentPile) return;
        lastPileSizeRef.current = gameState.game.currentPile.length;
    }, [gameState?.game?.currentPile]);

    const handleCardFilterChange = (nextFilter: HandFilter) => {
        setCardFilter(nextFilter);
        soundManager.cardSelect();
    };

    const toggleCardSelection = (idx: number) => {
        // Prevent clicking while action is executing
        if (isActing) return;

        const hand = (player?.hand as any[]) || [];
        const card = hand[idx];
        if (!card) return;
        const current = selectedCardIndices;
        if (current.includes(idx)) {
            setSelectedCardIndices(current.filter(i => i !== idx));
            soundManager.cardSelect();
            return;
        }
        if (current.length === 0) {
            setSelectedCardIndices([...current, idx]);
            soundManager.cardPlay(card, 1);
            return;
        }
        const first = hand[current[0]];
        if (first && first.rank === card.rank) {
            setSelectedCardIndices([...current, idx]);
            soundManager.cardPlay(card, current.length + 1);
            return;
        }
        addToast("DOUBLES MUST MATCH RANK", "error");
        soundManager.actionFail();
    };

    const triggerActionFeedback = (status: "success" | "error", label?: string) => {
        if (actionFeedbackTimeoutRef.current) {
            clearTimeout(actionFeedbackTimeoutRef.current);
        }

        const nextLabel = label || (status === "success" ? "ACTION LOCKED" : "ACTION FAILED");
        setActionFeedback({ status, label: nextLabel });
        actionFeedbackTimeoutRef.current = setTimeout(() => setActionFeedback(null), status === "success" ? 900 : 1200);
    };

    const triggerRoomPanelFeedback = (status: "success" | "error", label: string, durationMs = 2200) => {
        if (roomPanelFeedbackTimeoutRef.current) {
            clearTimeout(roomPanelFeedbackTimeoutRef.current);
        }

        setRoomPanelFeedback({ status, label });
        roomPanelFeedbackTimeoutRef.current = setTimeout(() => setRoomPanelFeedback(null), durationMs);
    };

    const handleMapNodeHover = (nodeId: string | null) => {
        setHoveredMapNodeId(nodeId);
    };

    const handleMapNodeSelect = (nodeId: string) => {
        setHoveredMapNodeId(null);
        setSelectedMapNodeId(nodeId);
        soundManager.cardSelect();
    };

    const handleLocateCurrentRoom = () => {
        if (!visualPlayerNode) return;
        setHoveredMapNodeId(null);
        setShowFullMaze(false);
        setMapZ(visualPlayerNode.z);
        setSelectedMapNodeId(visualPlayerNode.id);
        soundManager.cardSelect();
    };

    const handleDeckSelect = (z: number) => {
        setHoveredMapNodeId(null);
        setShowFullMaze(false);
        setMapZ(z);
        soundManager.cardSelect();
    };

    const handleToggleFullMaze = () => {
        setHoveredMapNodeId(null);
        if (showFullMaze) {
            const focusDeck = selectedMapNode?.z ?? visualPlayerNode?.z;
            setShowFullMaze(false);
            if (typeof focusDeck === "number") setMapZ(focusDeck);
        } else {
            const focusDeck = selectedMapNode?.z ?? visualPlayerNode?.z ?? maxDeck;
            if (typeof focusDeck === "number") setFullMapFocusDeck(focusDeck);
            setShowFullMaze(true);
        }
        soundManager.cardSelect();
    };

    const handleDeckStep = (direction: "up" | "down") => {
        if (!availableDecks.length) return;
        const currentDeck = showFullMaze
            ? (typeof fullMapFocusDeck === "number" ? fullMapFocusDeck : selectedMapNode?.z ?? visualPlayerNode?.z ?? maxDeck)
            : activeDeck;
        const currentIndex = Math.max(0, availableDecks.indexOf(Number(currentDeck)));
        const nextIndex = direction === "up"
            ? Math.min(availableDecks.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex - 1);
        const nextDeck = availableDecks[nextIndex];
        if (nextDeck === Number(currentDeck)) return;

        setHoveredMapNodeId(null);
        if (showFullMaze) {
            setFullMapFocusDeck(nextDeck);
        } else {
            setMapZ(nextDeck);
        }
        soundManager.cardSelect();
    };




    const facing = visualFacing;
    const mapRotationDeg = facing === "EAST" ? 270 : facing === "SOUTH" ? 180 : facing === "WEST" ? 90 : 0;
    const isRoomScanned = isNodeScanComplete(visualPlayerNode);
    const isRoomSecured = isNodeSecureComplete(visualPlayerNode);
    const isBossRoom = visualPlayerNode?.type === "BOSS";
    const isVictory = game?.phase === "VICTORY" || game?.roundPhase === "VICTORY";
    const activeDeck = mapZ ?? (visualPlayerNode?.z ?? 0);
    const moveDirectionLabels = {
        FORWARD: toCardinalDirection(toAbsoluteDirection("FORWARD", facing)),
        LEFT: toCardinalDirection(toAbsoluteDirection("LEFT", facing)),
        BACK: toCardinalDirection(toAbsoluteDirection("BACK", facing)),
        RIGHT: toCardinalDirection(toAbsoluteDirection("RIGHT", facing))
    };
    const selectedMoveHeading = moveDirection ? moveDirectionLabels[moveDirection as keyof typeof moveDirectionLabels] ?? toCardinalDirection(toAbsoluteDirection(moveDirection, facing)) : null;
    const handStatusBanner = showHallwayCountdown ? (
        <div className="rounded-full border border-neon-cyan/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-neon-cyan shadow-[0_0_12px_rgba(34,211,238,0.16)]">
            Transit {transitDirectionLabel} · {transitStatus?.remainingSteps || 0} step{(transitStatus?.remainingSteps || 0) === 1 ? "" : "s"} left
        </div>
    ) : hiddenSelectedCount > 0 ? (
        <div className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-yellow-300">
            {hiddenSelectedCount} selected card{hiddenSelectedCount === 1 ? "" : "s"} hidden by filter
        </div>
    ) : null;
    const roomPanelStatusFeedback = roomPanelFeedback
        ?? (scanFeedback
            ? {
                status: scanFeedback.success ? "success" as const : "error" as const,
                label: scanFeedback.success
                    ? `SCAN SUCCESS · PWR ${scanFeedback.nodePower} · DEPTH ${scanFeedback.scanDepth || 0}`
                    : `SCAN FAILED · PWR ${scanFeedback.nodePower}`
            }
            : actionFeedback);
    const roomScanStatusLabel = !isRoomScanned
        ? "Awaiting Recon"
        : isRoomSecured
            ? "Ready To Move"
            : "Scan Complete";
    const mapDeckLabel = showFullMaze
        ? `CENTER DECK ${typeof fullMapFocusDeck === "number" ? fullMapFocusDeck : maxDeck}`
        : `DECK ${activeDeck}`;
    const canStepDeckDown = showFullMaze
        ? typeof fullMapFocusDeck === "number" && fullMapFocusDeck > minDeck
        : activeDeck > minDeck;
    const canStepDeckUp = showFullMaze
        ? typeof fullMapFocusDeck === "number" && fullMapFocusDeck < maxDeck
        : activeDeck < maxDeck;

    // V23: Connection & Window Calculation




    // V23: Auto-Select SCAN for unscanned rooms (Moved to top level)
    useEffect(() => {
        if (inActionPhase && !isAirlock && !isRoomScanned && !actionIntent && !isActing) {
            setActionIntent("SCAN");
        }
    }, [inActionPhase, isAirlock, isRoomScanned, actionIntent, isActing]);

    const { scannedConnections, windows } = useMemo(() => {
        if (!visualPlayerNode || !game?.MapNode) return { scannedConnections: [], windows: [] };
        const n = visualPlayerNode;
        const allNodes = game.MapNode;
        const relConns: string[] = [];
        const winList: string[] = [];

        if (!n.scanned && n.type !== "START") {
            return { scannedConnections: [], windows: [] };
        }

        // 1. Process Connections (Trust DB to prevent missing doors)
        (connections || []).forEach((abs: string) => {
            if (abs === "UP" || abs === "DOWN") relConns.push(abs);
            else relConns.push(toRelativeDirection(abs, facing));
        });

        // 2. Process Windows (Skip for Airlock/Start room)
        if (n.type !== "START") {
            relativeDirectionOrder.forEach(abs => {
                // If it's a connection (Door), skip window
                if ((connections || []).includes(abs)) return;

                const v = worldDirectionVectors[abs];
                const tx = Number(n.x) + v.x;
                const ty = Number(n.y) + v.y;
                const tz = Number(n.z);

                const neighbor = allNodes.find((x: any) =>
                    Number(x.x) === tx &&
                    Number(x.y) === ty &&
                    Number(x.z) === tz
                );

                // Window Logic:
                // Only show window if there is strictly NO ROOM (Void) or EMPTY type.
                // If a neighbor exists (Wall), do NOT show window.
                if (!neighbor || neighbor.type === "EMPTY") {
                    winList.push(toRelativeDirection(abs, facing));
                }
            });
        }

        return { scannedConnections: relConns, windows: winList };
    }, [visualPlayerNode, game?.MapNode, facing, connections]);

    const canMoveDir = (dir: string) => {
        if (!inActionPhase || !player?.MapNode) return false;
        if (isAirlock) return dir === "FORWARD";
        if (!isRoomScanned) return false;
        const absDir = toAbsoluteDirection(dir, facing);
        return connections.includes(absDir);
    };
    const canMoveForward = canMoveDir("FORWARD");
    const canMoveBack = canMoveDir("BACK");
    const canMoveLeft = canMoveDir("LEFT");
    const canMoveRight = canMoveDir("RIGHT");
    const canMoveUp = canMoveDir("UP");
    const canMoveDown = canMoveDir("DOWN");
    const missionMinutes = Math.floor(missionTimeLeft / 60);
    const missionSeconds = missionTimeLeft % 60;
    const roomSectorLabel = `${visualPlayerNode?.x ?? 0}-${visualPlayerNode?.y ?? 0}-${visualPlayerNode?.z ?? 0}`;
    const roomStateLabel = roomInfo?.scanned ? "SCANNED" : "UNSCANNED";
    const gameChromeStatusItems = useMemo(() => (
        <>
            <div className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] ${
                game?.deadline
                    ? missionTimeLeft < 300
                        ? "border-red-500/35 bg-red-500/10 text-red-300"
                        : "border-white/10 bg-black/70 text-white"
                    : "border-white/10 bg-black/55 text-gray-500"
            }`}>
                T-MINUS {game?.deadline ? `${missionMinutes}:${missionSeconds.toString().padStart(2, "0")}` : "--:--"}
            </div>
            <div className="rounded-full border border-white/10 bg-black/70 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white">
                SEC {roomSectorLabel}
            </div>
            <div className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] ${
                roomInfo?.scanned
                    ? "border-green-500/35 bg-green-500/10 text-green-300"
                    : "border-yellow-500/35 bg-yellow-500/10 text-yellow-300"
            }`}>
                STATE {roomStateLabel}
            </div>
            <div className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] ${
                airlockDistance === 0
                    ? "border-green-500/35 bg-green-500/10 text-green-300"
                    : airlockDistance === null
                        ? "border-white/10 bg-black/55 text-gray-500"
                        : "border-cyan-500/25 bg-black/70 text-cyan-200"
            }`}>
                AIRLOCK {airlockDistanceLabel}
            </div>
            {showHallwayCountdown && (
                <div className="rounded-full border border-neon-cyan/30 bg-cyan-500/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-neon-cyan">
                    {transitDirectionLabel} {transitStatus?.remainingSteps || 0}
                </div>
            )}
        </>
    ), [
        game?.deadline,
        missionMinutes,
        missionSeconds,
        missionTimeLeft,
        roomInfo?.scanned,
        roomSectorLabel,
        roomStateLabel,
        airlockDistance,
        airlockDistanceLabel,
        showHallwayCountdown,
        transitDirectionLabel,
        transitStatus?.remainingSteps
    ]);
    const gameChromeRightItems = useMemo(() => {
        const exitTone = isAirlock
            ? "border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/18"
            : "border-red-900/50 bg-black/75 text-red-300 hover:bg-red-900/35 hover:text-red-200";
        const exitButton = (
            <button
                type="button"
                onClick={() => setExitIntent(emergencyExitIntent)}
                disabled={isActing}
                className={`rounded-full border px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.2em] transition-colors ${
                    isActing ? "cursor-not-allowed opacity-45" : exitTone
                }`}
            >
                {emergencyExitLabel}
            </button>
        );

        return <div className="flex items-center gap-2">{exitButton}</div>;
    }, [emergencyExitIntent, emergencyExitLabel, isActing, isAirlock, setExitIntent]);
    const gameChromeOverride = useMemo(() => ({
        title: roomChromeMeta.title,
        icon: (
            <span className={`inline-flex min-w-[2.2rem] items-center justify-center rounded-full border border-white/10 bg-black/70 px-2 py-1 text-[8px] font-black uppercase tracking-[0.18em] ${roomChromeMeta.colorClass}`}>
                {roomChromeMeta.iconNode}
            </span>
        ),
        statusItems: gameChromeStatusItems,
        rightItems: gameChromeRightItems,
        hideBridgeTime: true,
        titleMaxWidthClassName: "max-w-[36vw]",
    }), [gameChromeRightItems, gameChromeStatusItems, roomChromeMeta]);

    useEffect(() => {
        setAppChromeOverride(gameChromeOverride);
        return () => setAppChromeOverride(null);
    }, [gameChromeOverride, setAppChromeOverride]);

    if (loading) return <div className="min-h-full flex items-center justify-center text-neon-cyan">Loading Game Protocol...</div>;
    if (!gameState) return <div className="min-h-full flex items-center justify-center text-red-500">Game Not Found</div>;

    const canScan = inActionPhase && !isAirlock && !isRoomScanned;
    const canSecure = inActionPhase && !isAirlock && isRoomScanned && !isRoomSecured;
    const canAttack = inActionPhase && !isAirlock && (hasEnemies || isBossRoom);
    const canAutoMove = inActionPhase && isAirlock && actionIntent === "MOVE";
    const canMoveSelected = moveDirection === "FORWARD" ? canMoveForward
        : moveDirection === "BACK" ? canMoveBack
            : moveDirection === "LEFT" ? canMoveLeft
                : moveDirection === "RIGHT" ? canMoveRight
                    : moveDirection === "UP" ? canMoveUp
                        : moveDirection === "DOWN" ? canMoveDown
                            : false;
    const roomExplored = Boolean(player?.MapNode?.isExplored);
    const actionInvalid = (actionIntent === "SCAN" && !canScan)
        || (actionIntent === "SECURE" && !canSecure)
        || (actionIntent === "ATTACK" && !canAttack)
        || (actionIntent === "MOVE" && (!moveDirection || !canMoveSelected));
    const actionStatus = !inActionPhase
        ? "DRAWING..."
        : hasActionTimer
            ? "ACTION WINDOW"
            : isAirlock
                ? "AIRLOCK READY"
                : "WAITING FOR READY";
    const actionTimerLabel = !inActionPhase ? "WAITING..." : (hasActionTimer ? `ACTION CLOSING IN ${actionTimeLeft}s` : "READY");
    const pileOwnerIsMe = player && game?.pileOwnerId === player.characterId; // Use CharacterID for consistent ownership
    const tacticalActionCardsHint = hiddenSelectedCount > 0
        ? `${selectedCardIndices.length} selected (${hiddenSelectedCount} filtered)`
        : `${selectedCardIndices.length} selected`;

    const getTacticalActionUi = (action: "SCAN" | "ATTACK" | "SECURE") => {
        const selected = actionIntent === action;
        const accent = action === "SCAN"
            ? {
                active: "bg-green-500/20 text-green-400 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.2)]",
                ready: "border-green-500/35 text-green-300 hover:border-green-500/55 hover:text-green-200",
                badge: "border-green-500/35 bg-green-500/12 text-green-300",
                kicker: "text-green-300/80",
            }
            : action === "ATTACK"
                ? {
                    active: "bg-red-500/20 text-red-400 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]",
                    ready: "border-red-500/35 text-red-300 hover:border-red-500/55 hover:text-red-200",
                    badge: "border-red-500/35 bg-red-500/12 text-red-300",
                    kicker: "text-red-300/80",
                }
                : {
                    active: "bg-yellow-400/20 text-yellow-400 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.2)]",
                    ready: "border-yellow-400/35 text-yellow-300 hover:border-yellow-400/55 hover:text-yellow-200",
                    badge: "border-yellow-400/35 bg-yellow-400/12 text-yellow-300",
                    kicker: "text-yellow-200/80",
                };

        if (isActing) {
            return {
                disabled: true,
                selected,
                badgeLabel: "LOCKED",
                helper: "Resolving action",
                wrapperClass: "bg-black/35 text-gray-500 border-white/10 opacity-70 cursor-not-allowed",
                badgeClass: "border-white/10 bg-black/40 text-gray-500",
                kickerClass: accent.kicker,
            };
        }

        if (!inActionPhase) {
            return {
                disabled: true,
                selected,
                badgeLabel: "WAIT",
                helper: "Wait for action phase",
                wrapperClass: "bg-black/35 text-gray-500 border-white/10 opacity-70 cursor-not-allowed",
                badgeClass: "border-white/10 bg-black/40 text-gray-500",
                kickerClass: accent.kicker,
            };
        }

        if (action === "SCAN") {
            if (isAirlock) {
                return {
                    disabled: true,
                    selected,
                    badgeLabel: "LOCKED",
                    helper: "Airlock already mapped",
                    wrapperClass: "bg-black/35 text-gray-500 border-white/10 opacity-70 cursor-not-allowed",
                    badgeClass: "border-white/10 bg-black/40 text-gray-500",
                    kickerClass: accent.kicker,
                };
            }
            if (isRoomScanned) {
                return {
                    disabled: true,
                    selected,
                    badgeLabel: "DONE",
                    helper: "Room already scanned",
                    wrapperClass: "bg-black/35 text-gray-500 border-white/10 opacity-70 cursor-not-allowed",
                    badgeClass: "border-white/10 bg-black/40 text-gray-500",
                    kickerClass: accent.kicker,
                };
            }

            return {
                disabled: false,
                selected,
                badgeLabel: selected ? tacticalActionCardsHint : roomExplored ? "READY" : "NEXT",
                helper: selected ? "Reveal room intel" : roomExplored ? "Reveal missing intel" : "Use first",
                wrapperClass: selected ? accent.active : `bg-black/55 ${accent.ready}`,
                badgeClass: selected ? accent.badge : accent.badge,
                kickerClass: accent.kicker,
            };
        }

        if (action === "ATTACK") {
            if (isAirlock) {
                return {
                    disabled: true,
                    selected,
                    badgeLabel: "LOCKED",
                    helper: "No combat in airlock",
                    wrapperClass: "bg-black/35 text-gray-500 border-white/10 opacity-70 cursor-not-allowed",
                    badgeClass: "border-white/10 bg-black/40 text-gray-500",
                    kickerClass: accent.kicker,
                };
            }
            if (!roomExplored) {
                return {
                    disabled: true,
                    selected,
                    badgeLabel: "LOCKED",
                    helper: "Explore room first",
                    wrapperClass: "bg-black/35 text-gray-500 border-white/10 opacity-70 cursor-not-allowed",
                    badgeClass: "border-white/10 bg-black/40 text-gray-500",
                    kickerClass: accent.kicker,
                };
            }
            if (!(hasEnemies || isBossRoom)) {
                return {
                    disabled: true,
                    selected,
                    badgeLabel: "CLEAR",
                    helper: "No hostile targets",
                    wrapperClass: "bg-black/35 text-gray-500 border-white/10 opacity-70 cursor-not-allowed",
                    badgeClass: "border-white/10 bg-black/40 text-gray-500",
                    kickerClass: accent.kicker,
                };
            }

            return {
                disabled: false,
                selected,
                badgeLabel: selected ? tacticalActionCardsHint : isBossRoom ? "CORE" : `TARGET ${roomEnemies.length}`,
                helper: selected ? "Commit force" : isBossRoom ? "Target room core" : "Attack hostiles",
                wrapperClass: selected ? accent.active : `bg-black/55 ${accent.ready}`,
                badgeClass: selected ? accent.badge : accent.badge,
                kickerClass: accent.kicker,
            };
        }

        if (isAirlock) {
            return {
                disabled: true,
                selected,
                badgeLabel: "LOCKED",
                helper: "Airlock cannot be secured",
                wrapperClass: "bg-black/35 text-gray-500 border-white/10 opacity-70 cursor-not-allowed",
                badgeClass: "border-white/10 bg-black/40 text-gray-500",
                kickerClass: accent.kicker,
            };
        }
        if (!roomExplored || !isRoomScanned) {
            return {
                disabled: true,
                selected,
                badgeLabel: "SCAN",
                helper: "Scan before secure",
                wrapperClass: "bg-black/35 text-gray-500 border-white/10 opacity-70 cursor-not-allowed",
                badgeClass: "border-white/10 bg-black/40 text-gray-500",
                kickerClass: accent.kicker,
            };
        }
        if (isRoomSecured) {
            return {
                disabled: true,
                selected,
                badgeLabel: "DONE",
                helper: "Ready to move",
                wrapperClass: "bg-black/35 text-gray-500 border-white/10 opacity-70 cursor-not-allowed",
                badgeClass: "border-white/10 bg-black/40 text-gray-500",
                kickerClass: accent.kicker,
            };
        }

        return {
            disabled: false,
            selected,
            badgeLabel: selected ? tacticalActionCardsHint : "READY",
            helper: selected ? "Lock room state" : "Stabilize room",
            wrapperClass: selected ? accent.active : `bg-black/55 ${accent.ready}`,
            badgeClass: selected ? accent.badge : accent.badge,
            kickerClass: accent.kicker,
        };
    };
    const scanActionUi = getTacticalActionUi("SCAN");
    const attackActionUi = getTacticalActionUi("ATTACK");
    const secureActionUi = getTacticalActionUi("SECURE");

    const toggleItemSelection = (itemId: string) => {
        setSelectedItemIds(prev =>
            prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
        );
    };

    const handleLoadoutItemClick = (item: any) => {
        if (isActing) {
            addToast("ACTION IN PROGRESS", "error");
            return;
        }

        const isWeapon = item.type === "WEAPON" || item.slot === "WEAPON";
        if (isWeapon) {
            setActionIntent("ATTACK");
            setMoveDirection(null);
            return;
        }

        toggleItemSelection(item.id);
    };

    const handleUseItem = async (itemId: string) => {
        if (isActing || !player) return;

        setIsActing(true);
        try {
            const res = await fetch('/api/game/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: params.id,
                    action: "USE_ITEM",
                    itemId
                })
            });
            const data = await res.json();
            if (data.error) {
                addToast(data.error, "error");
                soundManager.actionFail();
                return;
            }

            if (data.hand || data.inventory) {
                setGameState((prev: any) => {
                    if (!prev?.player) return prev;
                    return {
                        ...prev,
                        player: {
                            ...prev.player,
                            hand: data.hand ?? prev.player.hand,
                            inventory: JSON.stringify(data.inventory ?? parseJSON(prev.player.inventory || "[]", []))
                        }
                    };
                });
            }

            setSelectedItemIds((prev) => prev.filter((id) => id !== itemId));
            addToast(data.message || "ITEM USED", "success");
            if (data.drawnCard) {
                soundManager.cardPlay(data.drawnCard, 1);
            } else {
                soundManager.actionSuccess();
            }
        } catch (error) {
            console.error(error);
            addToast("ITEM FAILURE", "error");
            soundManager.actionFail();
        } finally {
            setIsActing(false);
        }
    };


    const handleVictoryExit = async () => {
        if (isActing) return;
        setIsActing(true);
        soundManager.setMusicScene("default");
        try {
            await fetch('/api/game/quit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: params.id, reason: "VICTORY" })
            });
            router.push(`/game/${params.id}/summary`);
        } catch (e) {
            console.error(e);
            soundManager.setMusicScene("intense");
            addToast("EXIT FAILURE", "error");
        } finally {
            setIsActing(false);
        }
    };

    const lockAction = async (intentOverride?: string, indexOverride?: number[], forceAutoLowest?: boolean) => {
        if (isActing || !player) return;

        const selected = indexOverride ?? selectedCardIndices;
        if (!intentOverride && !actionIntent) {
            addToast("ACTION REQUIRED: SELECT PROTOCOL", "error");
            return;
        }
        if ((intentOverride || actionIntent) === "MOVE" && !moveDirection) {
            addToast("NAVIGATION ERROR: SELECT DIRECTION", "error");
            return;
        }

        const hand = (player.hand as any[]) || [];
        const cardsToSend = (selected.length > 0 ? selected : []).map(idx => hand[idx]);

        const payloadCards = cardsToSend.length > 0 ? cardsToSend : (forceAutoLowest && hand.length > 0 ? [hand.reduce((lowest: any, c: any) => (lowest && lowest.power < c.power ? lowest : c), hand[0])] : []);
        setIsActing(true);
        setIsActionLoading(true); // V23: Set loading state
        try {
            const res = await fetch('/api/game/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: params.id,
                    action: "LOCK_ACTION",
                    cards: payloadCards,
                    intent: intentOverride || actionIntent || "SCAN",
                    direction: moveDirection,
                    items: selectedItemIds.filter(id => {
                        const item = allItems.find((i: any) => i.id === id);
                        if (!item) return false;
                        if (typeof item.usesMax !== 'number') return true; // Infinite uses
                        return (item.usesRemaining ?? item.usesMax) > 0;
                    })
                })
            });
            const data = await res.json();
            if (data.error) {
                addToast(data.error, "error");
                triggerActionFeedback("error", data.error);
                soundManager.actionFail();
            } else {
                triggerActionFeedback("success", data.message || "ACTION LOCKED");
                soundManager.actionSuccess();
                addToast(data.message || "ACTION LOCKED", "success");
                setSelectedCardIndices([]);
                setSelectedItemIds([]); // Clear loadout
                setActionIntent(null);
                setMoveDirection(null);
            }
        } catch (e) {
            console.error(e);
            addToast("SYSTEM FAILURE", "error");
            triggerActionFeedback("error", "SYSTEM FAILURE");
            soundManager.actionFail();
        } finally {
            setIsActing(false);
            setIsActionLoading(false); // V23: Clear loading state
        }
    };

    const confirmExit = async () => {
        if (!exitIntent) return;
        setIsActing(true);
        soundManager.setMusicScene("default");
        try {
            const payload: any = { gameId: params.id };
            if (exitIntent === "DEPART") payload.reason = "DEPART";
            await fetch('/api/game/quit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            router.push(`/game/${params.id}/summary`);
        } catch (e) {
            console.error(e);
            soundManager.setMusicScene("intense");
            addToast("EXIT FAILURE", "error");
        } finally {
            setIsActing(false);
            setExitIntent(null);
        }
    };
    const handleExecute = () => lockAction(undefined, undefined, canAutoMove && selectedCardIndices.length === 0);

    // Legacy handleMove replacement (for minimal diff impact if stuck)
    const handleMove = async () => { };
    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-black font-mono text-white">
            <style jsx global>{`
                @keyframes spinSlow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
            {/* V23: Card Action Loading Overlay */}
            {isActionLoading && (
                <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center">
                    <div className="text-center">
                        <div className="w-16 h-16 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin mb-4 mx-auto" style={{ animationDuration: '1s' }} />
                        <div className="text-neon-cyan font-bold tracking-widest text-sm animate-pulse">PROCESSING ACTION</div>
                        <div className="text-[10px] text-gray-500 mt-1">Awaiting server confirmation...</div>
                    </div>
                </div>
            )}
            {/* Portrait Mode Warning Overlay */}
            <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-8 text-center portrait:flex hidden">
                <div className="w-16 h-16 border-2 border-neon-cyan/50 rounded-lg flex items-center justify-center mb-4 animate-pulse">
                    <div className="w-8 h-12 border border-white/30 rounded flex items-center justify-center">
                        <div className="w-6 h-1 bg-white/20 rounded-full animate-[spin_3s_linear_infinite]" />
                    </div>
                </div>
                <h2 className="text-xl font-bold text-neon-cyan tracking-widest mb-2">ORIENTATION ERROR</h2>
                <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
                    Mothership interface requires landscape protocol.
                    <br /><br />
                    <span className="text-white font-bold">PLEASE ROTATE DEVICE</span>
                </p>
            </div>

            {/* Background Ambiance */}
            <div className="absolute inset-0 bg-[url('/bg-space.jpg')] bg-cover opacity-50 z-0" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 z-0" />

            <AnimatePresence>
                {isVictory && !exitIntent && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.96, opacity: 0 }}
                            className="w-[360px] rounded-xl border border-white/10 bg-black/95 p-6 text-center shadow-2xl"
                        >
                            <div className="text-xs text-neon-cyan uppercase tracking-widest mb-2">Core Neutralized</div>
                            <div className="text-sm text-white mb-4">Mission complete. Return to summary?</div>
                            <div className="flex justify-center">
                                <Button
                                    className="h-8 text-xs bg-neon-cyan text-black"
                                    onClick={handleVictoryExit}
                                    disabled={isActing}
                                >
                                    RETURN TO SUMMARY
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
                {exitIntent && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.96, opacity: 0 }}
                            className="w-[320px] rounded-xl border border-white/10 bg-black/90 p-6 text-center shadow-2xl"
                        >
                            <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">
                                {exitIntent === "DEPART" ? "Return To Ship" : "Abandon Mission"}
                            </div>
                            <div className="text-sm text-white mb-4">
                                {exitIntent === "DEPART" ? "Return through the airlock and end the run?" : "Abandon the mission and end the run now?"}
                            </div>
                            <div className="flex justify-center gap-3">
                                <Button
                                    variant="outline"
                                    className="h-8 text-xs border-white/20 text-gray-300 hover:text-white"
                                    onClick={() => setExitIntent(null)}
                                    disabled={isActing}
                                >
                                    CANCEL
                                </Button>
                                <Button
                                    className={`h-8 text-xs ${exitIntent === "DEPART" ? "bg-green-500 text-black" : "bg-red-500 text-black"}`}
                                    onClick={confirmExit}
                                    disabled={isActing}
                                >
                                    {exitIntent === "DEPART" ? "RETURN" : "ABANDON"}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>


            {/* Main Grid Layout */}
            <main className="relative z-20 mx-auto grid h-full w-full max-w-[1760px] flex-1 min-h-0 grid-cols-[296px_minmax(0,1fr)] gap-2 overflow-hidden px-2 py-2">


                {/* LEFT PANEL: Map & Info (Col Span 3) */}
                <div className="relative flex h-full min-h-0 flex-col gap-3 overflow-hidden">
                    <AutoFitViewport>
                        <div className="flex h-[664px] min-w-[296px] w-full flex-col gap-1.5">


                    {/* Map (Flex Grow) */}
                    {player?.MapNode && (
                        <div className="glass-panel p-1 border border-white/20 flex-1 min-h-0 flex flex-col animate-in slide-in-from-left duration-500 shadow-lg relative">
                            <div className="shrink-0 border-b border-white/10 bg-black/35 px-2 py-1">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[10px] uppercase tracking-widest text-gray-500">Sector Map</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.24em] text-white">
                                            Room
                                        </span>
                                        <span className="rounded border border-slate-700 bg-slate-900/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.24em] text-slate-300">
                                            Hall
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="w-full flex-1 min-h-0 bg-black/50 border border-white/5 relative overflow-hidden rounded">
                                <div
                                    className="flex h-full w-full items-center justify-center"
                                    style={showFullMaze ? { transform: "scale(0.88)", transformOrigin: "center center" } : undefined}
                                >
                                    {/* Removed outer rotation, passing rotation to SectorGrid */}
                                    <SectorGrid
                                        nodes={game.MapNode || []}
                                        currentPlayerNodeId={visualPlayerNode?.id || player?.nodeId}
                                        activeZ={showFullMaze ? undefined : activeDeck}
                                        playerMarkers={playerMarkers}
                                        rotation={mapRotationDeg}
                                        facing={facing}
                                        fullMap={showFullMaze}
                                        fullMapFocusZ={fullMapFocusDeck ?? undefined}
                                        selectedNodeId={selectedMapNodeId}
                                        onNodeHover={handleMapNodeHover}
                                        onNodeSelect={handleMapNodeSelect}
                                        recentMovement={recentMovement}
                                    />
                                </div>
                                <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-neon-cyan/20 bg-black/80 shadow-[0_0_14px_rgba(34,211,238,0.16),inset_0_0_16px_rgba(0,0,0,0.9)] backdrop-blur-sm">
                                    <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[7px] font-black uppercase tracking-[0.18em] text-neon-cyan">
                                        N
                                    </div>
                                    <div
                                        className="absolute inset-[9px] transition-transform duration-300 ease-out"
                                        style={{ transform: `rotate(${mapRotationDeg}deg)` }}
                                    >
                                        <div className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[4px] border-x-transparent border-b-[7px] border-b-neon-cyan" />
                                        <div className="absolute left-1/2 top-[3px] h-4 w-[2px] -translate-x-1/2 rounded-full bg-neon-cyan shadow-[0_0_8px_rgba(34,211,238,0.55)]" />
                                        <div className="absolute bottom-[3px] left-1/2 h-3 w-[1px] -translate-x-1/2 rounded-full bg-white/15" />
                                    </div>
                                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.85)]" />
                                </div>
                            </div>

                            {/* Dock Deck & Info (Bottom) */}
                            <div className="border-t border-white/10 bg-black/40 p-1 flex flex-col gap-1">
                                <div className="flex flex-col gap-1">
                                    <div className="flex flex-wrap items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleDeckStep("down")}
                                            disabled={!canStepDeckDown}
                                            className="h-5.5 w-5.5 text-[9px] flex items-center justify-center rounded border transition-colors bg-black/50 text-gray-300 border-white/10 hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed"
                                            aria-label={showFullMaze ? "Center lower deck" : "Move to lower deck"}
                                        >
                                            <ChevronDown className="w-3 h-3" />
                                        </button>
                                        <div className="min-w-[76px] px-1.5 text-center text-[8px] font-mono uppercase tracking-[0.2em] text-gray-300">
                                            {mapDeckLabel}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleDeckStep("up")}
                                            disabled={!canStepDeckUp}
                                            className="h-5.5 w-5.5 text-[9px] flex items-center justify-center rounded border transition-colors bg-black/50 text-gray-300 border-white/10 hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed"
                                            aria-label={showFullMaze ? "Center higher deck" : "Move to higher deck"}
                                        >
                                            <ChevronUp className="w-3 h-3" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleLocateCurrentRoom}
                                            className="h-5.5 px-1.5 text-[8px] rounded border bg-black/50 text-neon-cyan border-white/10 hover:border-white/30 uppercase"
                                        >
                                            LOCATE
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleToggleFullMaze}
                                            className={`h-5.5 px-1.5 text-[8px] rounded border uppercase transition-colors ${showFullMaze ? "bg-neon-cyan text-black border-neon-cyan font-bold" : "bg-black/50 text-gray-300 border-white/10 hover:border-white/30 hover:text-white"}`}
                                        >
                                            FULL
                                        </button>
                                    </div>
                                    <div className="flex items-end justify-between gap-2">
                                        <span className={`min-w-0 text-xs font-bold uppercase leading-tight ${showFullMaze ? "text-neon-cyan" : "text-white"}`}>
                                            {showFullMaze ? "DECK MATRIX" : `DECK ${activeDeck} VIEW`}
                                        </span>
                                        <span className="shrink-0 text-[9px] font-mono text-gray-400 bg-gray-900 px-1 rounded">
                                            {showFullMaze ? `${game.MapNode?.length || 0} NODES` : `SEC ${visualPlayerNode?.x ?? 0}-${visualPlayerNode?.y ?? 0}-${visualPlayerNode?.z ?? 0}`}
                                        </span>
                                    </div>
                                </div>
                                <div className="rounded border border-white/10 bg-black/55 px-2 py-1.5">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <div className="text-[9px] uppercase tracking-[0.32em] text-gray-500">Map Readout</div>
                                        {inspectedMapNode && (
                                            <div className="flex items-center gap-1">
                                                {inspectedMapStatus && (
                                                    <div className={`rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.2em] ${
                                                        inspectedMapStatus === "LOCKED"
                                                            ? "border-white/20 text-white"
                                                            : "border-yellow-500/40 text-yellow-400"
                                                    }`}>
                                                        {inspectedMapStatus}
                                                    </div>
                                                )}
                                                {inspectedMapIsBoss && (
                                                    <div className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-red-300">
                                                        Boss
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {inspectedMapNode ? (
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-gray-500">Focus</span>
                                                <span className={`font-bold uppercase ${inspectedMapNode.type === "CORRIDOR" ? "text-slate-300" : inspectedMapSuitMeta?.color || "text-white"}`}>
                                                    {inspectedMapNodeLabel}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-gray-500">Sector</span>
                                                <span className="font-mono text-white">{inspectedMapNode.x}-{inspectedMapNode.y}-{inspectedMapNode.z}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-gray-500">State</span>
                                                <span className="font-bold text-white">{inspectedMapStateLabel}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-gray-500">Links</span>
                                                <span className="truncate text-right font-bold uppercase text-gray-200">{inspectedMapLinkSummary}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded border border-dashed border-white/10 bg-black/25 px-2 py-2 text-[9px] uppercase tracking-[0.18em] text-gray-500">
                                            Hover or lock a sector for intel.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                        </div>
                    </AutoFitViewport>
                </div>

                {/* CENTER/RIGHT PANEL: HUD & Hand (Col Span 9) */}
                <div className="relative flex h-full min-h-0 flex-col items-center gap-3">
                    <AutoFitViewport>
                        <div className="relative flex h-[664px] min-w-[920px] w-full flex-col items-center gap-1.5 overflow-visible">

                    {/* Main Interaction Area */}
                    <div className="glass-panel border border-white/20 animate-fade-in relative overflow-visible w-full flex-1 min-h-0 flex flex-col items-center bg-black/40 p-2 backdrop-blur-md shadow-2xl">

                        {/* 3. BOTTOM: CONTROL CONSOLE (Retro Dashboard w/ Central Compass) */}
                        <div className="mx-auto flex-1 min-h-0 w-full max-w-[1016px] pt-0 pb-0">

                            {/* The Console Chassis */}
                            <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-t-3xl border-t-4 border-slate-700 bg-slate-900/90 p-1.5 shadow-2xl">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-cyan to-transparent opacity-50" />
                                <div className="mb-1 min-h-[8px]" />

                                {/* Console Grid */}
                                <div className="grid flex-1 min-h-0 grid-cols-[1.16fr_224px_0.82fr] items-stretch gap-2">

                                    {/* Left Panel: Room Scan + Primary Actions */}
                                    <div className="order-1 flex h-full w-full flex-col gap-1 rounded-xl border border-white/5 bg-black/40 p-1.5">
                                        <div className="flex flex-1 min-h-0 flex-col rounded-xl border border-white/10 bg-black/35 p-1.5">
                                            <div className="mb-1 flex items-center justify-between gap-2 border-b border-white/5 pb-1">
                                                <div className="text-[10px] uppercase tracking-widest text-gray-500">Room Scan</div>
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {roomInfo?.scanned && roomInfo?.suit && (
                                                        <div className="rounded-full border border-white/10 bg-black/70 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-white">
                                                            <span className="text-gray-400">Effect</span>
                                                            <span className={`ml-1.5 ${roomSuitMeta?.color || "text-neon-cyan"}`}>{roomInfo.suit} +1</span>
                                                            {roomOpposingSuit && <span className="ml-1.5 text-red-300">{roomOpposingSuit} -1</span>}
                                                        </div>
                                                    )}
                                                    <div className="text-[8px] uppercase tracking-[0.24em] text-gray-600">
                                                        {roomScanStatusLabel}
                                                    </div>
                                                </div>
                                            </div>
                                            <AnimatePresence initial={false}>
                                                {roomPanelStatusFeedback && (
                                                    <motion.div
                                                        key={roomPanelStatusFeedback.label}
                                                        initial={{ opacity: 0, y: -6 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -8 }}
                                                        transition={{ duration: 0.22 }}
                                                        className={`mb-1 rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] ${
                                                            roomPanelStatusFeedback.status === "success"
                                                                ? "border-green-400/35 bg-green-500/10 text-green-300"
                                                                : "border-red-500/35 bg-red-500/10 text-red-300"
                                                        }`}
                                                    >
                                                        {roomPanelStatusFeedback.label}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                            <div className="flex flex-1 min-h-0 items-center justify-center rounded-2xl border border-white/10 bg-black/50 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                                <div className="aspect-square h-full max-h-[320px] w-full max-w-[320px]">
                                                    <RoomScanner
                                                        key={`console-${visualPlayerNode?.id || "node"}-${facing}`}
                                                        type={visualPlayerNode?.type || player?.MapNode?.type || "UNKNOWN"}
                                                        isExplored={Boolean(visualPlayerNode?.isExplored)}
                                                        integrity={game.integrity}
                                                        suit={isRoomScanned ? roomInfo?.suit : undefined}
                                                        suitColor={isRoomScanned ? roomSuitMeta?.color : undefined}
                                                        connections={scannedConnections}
                                                        windows={windows}
                                                        scanned={isRoomScanned}
                                                        facing={facing}
                                                        relativeNorth={["FORWARD", "RIGHT", "BACK", "LEFT"][(4 - ["NORTH", "EAST", "SOUTH", "WEST"].indexOf(facing || "NORTH")) % 4]}
                                                        hallwayIntel={[]}
                                                        movementDirection={showHallwayCountdown ? transitDirectionLabel : null}
                                                        movementActive={showHallwayCountdown}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>


                                    {/* Center Panel: Navigation & Tactical Actions */}
                                    <div className="relative order-2 flex h-full w-full flex-col items-center justify-start gap-2 pt-0.5">
                                        {player && (
                                            <div className="w-full max-w-[236px] rounded-2xl border border-white/10 bg-black/55 px-2 py-1 shadow-[0_10px_24px_rgba(0,0,0,0.32)] backdrop-blur-sm">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-neon-cyan/60 bg-slate-900 shadow-[0_0_14px_rgba(34,211,238,0.22)]">
                                                        {player.character?.portrait ? (
                                                            <img
                                                                src={player.character.portrait}
                                                                alt={`${player.character.name} portrait`}
                                                                title={`${player.character.name} portrait`}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <User className="h-4.5 w-4.5 text-neon-cyan/70" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-neon-cyan">
                                                                {player.character?.name || "Operative"}
                                                            </div>
                                                            <span className={`shrink-0 rounded border px-1 py-0.5 font-mono text-[8px] ${playerRoleDisplay.border} ${playerRoleDisplay.color} ${playerRoleDisplay.bg}`}>
                                                                {playerRoleDisplay.name}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 grid grid-cols-4 gap-1 text-[7px] font-bold uppercase tracking-[0.12em]">
                                                            <div className={`rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 ${playerHealthTone}`}>
                                                                <div className="flex items-center gap-1">
                                                                    <Heart className="h-3 w-3" />
                                                                    <span>HP</span>
                                                                </div>
                                                                <div className="mt-0.5 font-mono text-[10px]">{player.hp}/{player.maxHp}</div>
                                                            </div>
                                                            <div className="rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-yellow-400">
                                                                <div className="flex items-center gap-1">
                                                                    <Zap className="h-3 w-3" />
                                                                    <span>AP</span>
                                                                </div>
                                                                <div className="mt-0.5 font-mono text-[10px]">{player.ap}</div>
                                                            </div>
                                                            <div className="rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-cyan-300">
                                                                <div className="flex items-center gap-1">
                                                                    <Cpu className="h-3 w-3" />
                                                                    <span>STR</span>
                                                                </div>
                                                                <div className="mt-0.5 font-mono text-[10px]">{player.stress ?? 0}</div>
                                                            </div>
                                                            <div className="rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-purple-300">
                                                                <div className="flex items-center gap-1">
                                                                    <User className="h-3 w-3" />
                                                                    <span>LVL</span>
                                                                </div>
                                                                <div className="mt-0.5 font-mono text-[10px]">{player.character?.level ?? 1}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Navigation & Action Lock */}
                                        <div className="z-10 flex w-full max-w-[236px] items-end justify-center gap-1.5 rounded-3xl border border-slate-600 bg-slate-800 p-1.5 pb-1 pt-4 shadow-xl">
                                            <div className="flex w-full max-w-[144px] flex-col items-center gap-1 rounded-2xl border border-slate-500 bg-black/85 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">

                                                {/* Deck Controls (Up/Down) */}
                                                <div className="flex w-full gap-1">
                                                    <Button onClick={() => {
                                                    if (isActing) return;
                                                    setActionIntent("MOVE");
                                                    setMoveDirection("UP");
                                                }} disabled={!canMoveUp || !player.MapNode.isExplored || isActing} className={`h-5.5 min-w-0 flex-1 rounded-md border text-[7px] font-bold flex items-center justify-center gap-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${moveDirection === "UP" && actionIntent === "MOVE" ? "bg-neon-cyan text-black border-cyan-300" : "bg-slate-900 text-gray-300 border-slate-600 hover:bg-slate-800"} ${!player.MapNode.isExplored ? "opacity-30 cursor-not-allowed" : ""}`}>
                                                        <ChevronUp className="w-3 h-3" /> UP
                                                    </Button>
                                                    <Button onClick={() => {
                                                    if (isActing) return;
                                                    setActionIntent("MOVE");
                                                    setMoveDirection("DOWN");
                                                }} disabled={!canMoveDown || !player.MapNode.isExplored || isActing} className={`h-5.5 min-w-0 flex-1 rounded-md border text-[7px] font-bold flex items-center justify-center gap-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${moveDirection === "DOWN" && actionIntent === "MOVE" ? "bg-neon-cyan text-black border-cyan-300" : "bg-slate-900 text-gray-300 border-slate-600 hover:bg-slate-800"} ${!player.MapNode.isExplored ? "opacity-30 cursor-not-allowed" : ""}`}>
                                                        <ChevronDown className="w-3 h-3" /> DN
                                                    </Button>
                                                </div>

                                                {/* Directional Arrows (Inverted T) */}
                                                <div className="grid w-full grid-cols-3 gap-1">
                                                    <div /> {/* Spacer */}
                                                    <Button onClick={() => {
                                                    if (isActing) return;
                                                    setActionIntent("MOVE");
                                                    setMoveDirection("FORWARD");
                                                }} disabled={!canMoveForward || !player.MapNode.isExplored || isActing} className={`flex h-8 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_6px_14px_rgba(0,0,0,0.18)] ${moveDirection === "FORWARD" && actionIntent === "MOVE" ? "bg-neon-cyan text-black border-cyan-300" : "bg-slate-900 text-gray-200 border-slate-600 hover:bg-slate-800"} ${!player.MapNode.isExplored ? "opacity-30 cursor-not-allowed" : ""}`}>
                                                    <ArrowUp className="w-4 h-4 shrink-0" />
                                                    <span className="whitespace-nowrap text-[7px] font-black leading-none tracking-[0.1em]">{moveDirectionLabels.FORWARD}</span>
                                                </Button>
                                                    <div /> {/* Spacer */}

                                                    <Button onClick={() => {
                                                    if (isActing) return;
                                                    setActionIntent("MOVE");
                                                    setMoveDirection("LEFT");
                                                }} disabled={!canMoveLeft || !player.MapNode.isExplored || isActing} className={`flex h-8 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_6px_14px_rgba(0,0,0,0.18)] ${moveDirection === "LEFT" && actionIntent === "MOVE" ? "bg-neon-cyan text-black border-cyan-300" : "bg-slate-900 text-gray-200 border-slate-600 hover:bg-slate-800"} ${!player.MapNode.isExplored ? "opacity-30 cursor-not-allowed" : ""}`}>
                                                    <ArrowLeft className="w-4 h-4 shrink-0" />
                                                    <span className="whitespace-nowrap text-[7px] font-black leading-none tracking-[0.1em]">{moveDirectionLabels.LEFT}</span>
                                                </Button>
                                                    <Button onClick={() => {
                                                    if (isActing) return;
                                                    setActionIntent("MOVE");
                                                    setMoveDirection("BACK");
                                                }} disabled={!canMoveBack || !player.MapNode.isExplored || isActing} className={`flex h-8 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_6px_14px_rgba(0,0,0,0.18)] ${moveDirection === "BACK" && actionIntent === "MOVE" ? "bg-neon-cyan text-black border-cyan-300" : "bg-slate-900 text-gray-200 border-slate-600 hover:bg-slate-800"} ${!player.MapNode.isExplored ? "opacity-30 cursor-not-allowed" : ""}`}>
                                                    <ArrowDown className="w-4 h-4 shrink-0" />
                                                    <span className="whitespace-nowrap text-[7px] font-black leading-none tracking-[0.1em]">{moveDirectionLabels.BACK}</span>
                                                </Button>
                                                    <Button onClick={() => {
                                                    if (isActing) return;
                                                    setActionIntent("MOVE");
                                                    setMoveDirection("RIGHT");
                                                }} disabled={!canMoveRight || !player.MapNode.isExplored || isActing} className={`flex h-8 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_6px_14px_rgba(0,0,0,0.18)] ${moveDirection === "RIGHT" && actionIntent === "MOVE" ? "bg-neon-cyan text-black border-cyan-300" : "bg-slate-900 text-gray-200 border-slate-600 hover:bg-slate-800"} ${!player.MapNode.isExplored ? "opacity-30 cursor-not-allowed" : ""}`}>
                                                    <ArrowRight className="w-4 h-4 shrink-0" />
                                                    <span className="whitespace-nowrap text-[7px] font-black leading-none tracking-[0.1em]">{moveDirectionLabels.RIGHT}</span>
                                                </Button>
                                                </div>
                                            </div>

                                            {/* Execute Button */}
                                            <div className="flex flex-col items-center gap-0.5">
                                                {/* Clear Status Indicators */}
                                                {actionIntent && !actionInvalid && selectedCardIndices.length > 0 && (
                                                    <div className="text-[9px] font-bold uppercase tracking-widest text-neon-cyan animate-pulse-slow">
                                                        Cards Selected: {selectedCardIndices.length}
                                                    </div>
                                                )}
                                                {actionIntent === 'MOVE' && moveDirection && (
                                                    <div className="text-[9px] font-bold uppercase tracking-widest text-neon-cyan">
                                                        Heading: {selectedMoveHeading}
                                                    </div>
                                                )}
                                                {(!actionIntent || actionInvalid) && (
                                                    <div className="text-[9px] text-gray-500">
                                                        Select Action & Card
                                                    </div>
                                                )}
                                                <Button
                                                    onClick={handleExecute}
                                                    disabled={(!actionIntent || actionInvalid || (selectedCardIndices.length === 0 && !canAutoMove)) || isActing || !inActionPhase || backpackItems.length > 5}
                                                    className={`
                                                        h-12 w-[66px] rounded-lg font-black text-[9px] tracking-widest border-b-4 transition-all active:border-b-0 active:translate-y-1
                                                        flex flex-col items-center justify-center gap-1
                                                        ${(actionIntent && !actionInvalid && (selectedCardIndices.length > 0 || canAutoMove) && inActionPhase && backpackItems.length <= 5)
                                                            ? 'bg-neon-cyan text-black border-cyan-700 shadow-[0_0_20px_#0ff] animate-pulse-slow hover:brightness-110'
                                                            : backpackItems.length > 5
                                                                ? 'bg-red-900/50 text-red-500 border-red-900 cursor-not-allowed animate-pulse'
                                                                : 'bg-gray-800 text-gray-600 border-black cursor-not-allowed'}
                                                    `}
                                                >
                                                    {backpackItems.length > 5 ? (
                                                        <span className="text-[9px] leading-tight">BACKPACK<br />FULL</span>
                                                    ) : (
                                                        <span>EXEC</span>
                                                    )}
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="w-full max-w-[236px]">
                                            <div className="mb-1 flex items-center justify-between border-b border-white/5 pb-0.5">
                                                <div className="text-[9px] uppercase tracking-[0.24em] text-gray-500">Tactical Actions</div>
                                                <div className="text-[8px] uppercase tracking-[0.22em] text-gray-600">
                                                    Recon / Combat / Stabilize
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-1">
                                                <Button
                                                    onClick={() => {
                                                        if (isActing) return;
                                                        setActionIntent("SCAN");
                                                        setMoveDirection(null);
                                                    }}
                                                    disabled={scanActionUi.disabled}
                                                    className={`h-[46px] border px-2 transition-all ${scanActionUi.wrapperClass}`}
                                                >
                                                    <div className="flex h-full w-full flex-col items-start justify-between">
                                                        <div className="flex w-full items-center justify-between gap-2">
                                                            <div className={`min-w-0 flex items-center gap-1 text-[7px] uppercase tracking-[0.18em] ${scanActionUi.kickerClass}`}>
                                                                <Zap className="h-3 w-3" />
                                                                Recon
                                                            </div>
                                                            <span className={`rounded-full border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.18em] ${scanActionUi.badgeClass}`}>
                                                                {scanActionUi.badgeLabel}
                                                            </span>
                                                        </div>
                                                        <div className="min-w-0 text-left">
                                                            <div className="text-[9px] font-black tracking-[0.18em]">SCAN</div>
                                                            <div className="whitespace-normal break-words text-[7px] leading-tight tracking-[0.08em] text-gray-400">{scanActionUi.helper}</div>
                                                        </div>
                                                    </div>
                                                </Button>
                                                <Button
                                                    onClick={() => {
                                                        if (isActing) return;
                                                        setActionIntent("ATTACK");
                                                        setMoveDirection(null);
                                                    }}
                                                    disabled={attackActionUi.disabled}
                                                    className={`h-[46px] border px-2 transition-all ${attackActionUi.wrapperClass}`}
                                                >
                                                    <div className="flex h-full w-full flex-col items-start justify-between">
                                                        <div className="flex w-full items-center justify-between gap-2">
                                                            <div className={`min-w-0 flex items-center gap-1 text-[7px] uppercase tracking-[0.18em] ${attackActionUi.kickerClass}`}>
                                                                <Crosshair className="h-3 w-3" />
                                                                Combat
                                                            </div>
                                                            <span className={`rounded-full border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.18em] ${attackActionUi.badgeClass}`}>
                                                                {attackActionUi.badgeLabel}
                                                            </span>
                                                        </div>
                                                        <div className="min-w-0 text-left">
                                                            <div className="text-[9px] font-black tracking-[0.18em]">ENGAGE</div>
                                                            <div className="whitespace-normal break-words text-[7px] leading-tight tracking-[0.08em] text-gray-400">{attackActionUi.helper}</div>
                                                        </div>
                                                    </div>
                                                </Button>
                                                <Button
                                                    onClick={() => {
                                                        if (isActing) return;
                                                        setActionIntent("SECURE");
                                                        setMoveDirection(null);
                                                    }}
                                                    disabled={secureActionUi.disabled}
                                                    className={`h-[46px] border px-2 transition-all ${secureActionUi.wrapperClass}`}
                                                >
                                                    <div className="flex h-full w-full flex-col items-start justify-between">
                                                        <div className="flex w-full items-center justify-between gap-2">
                                                            <div className={`min-w-0 flex items-center gap-1 text-[7px] uppercase tracking-[0.18em] ${secureActionUi.kickerClass}`}>
                                                                <Shield className="h-3 w-3" />
                                                                Stabilize
                                                            </div>
                                                            <span className={`rounded-full border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.18em] ${secureActionUi.badgeClass}`}>
                                                                {secureActionUi.badgeLabel}
                                                            </span>
                                                        </div>
                                                        <div className="min-w-0 text-left">
                                                            <div className="text-[9px] font-black tracking-[0.18em]">SECURE</div>
                                                            <div className="whitespace-normal break-words text-[7px] leading-tight tracking-[0.08em] text-gray-400">{secureActionUi.helper}</div>
                                                        </div>
                                                    </div>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Panel: Systems & Emergency */}
                                    <div className="order-3 flex h-full w-full flex-col justify-start gap-1 rounded-xl border border-white/5 bg-black/40 p-1.5">
                                        <div className="rounded-lg border border-white/10 bg-black/45 p-1.5">
                                            <div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.24em]">
                                                <span className="text-gray-500">Airlock Range</span>
                                                <span className={`font-bold ${airlockDistance === 0 ? "text-green-400" : airlockDistance === null ? "text-gray-500" : "text-cyan-300"}`}>
                                                    {airlockDistanceLabel}
                                                </span>
                                            </div>
                                        </div>

                                        <MissionLog
                                            objectives={missionObjectives}
                                            compact
                                            className="min-h-0 flex-1"
                                            footer={
                                                <div className="space-y-1.5">
                                                    <div className="rounded border border-white/10 bg-black/45 p-2">
                                                        <div className="mb-2 flex items-center justify-between gap-2">
                                                            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-neon-cyan">
                                                                Equipment
                                                            </div>
                                                            <div className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[8px] font-mono uppercase tracking-[0.18em] text-gray-400">
                                                                {loadoutItems.length}
                                                            </div>
                                                        </div>
                                                        {loadoutItems.length === 0 ? (
                                                            <div className="rounded border border-dashed border-white/10 bg-black/30 px-2 py-2 text-[9px] uppercase tracking-[0.18em] text-gray-500">
                                                                No equipped items ready
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-1">
                                                                {loadoutItems.map((item: any, idx: number) => {
                                                                    const isWeapon = item.type === "WEAPON" || item.slot === "WEAPON";
                                                                    const hasUses = typeof item.usesMax === "number";
                                                                    const depleted = hasUses && (item.usesRemaining ?? item.usesMax) <= 0;
                                                                    const isSelected = selectedItemIds.includes(item.id) || (isWeapon && actionIntent === "ATTACK");

                                                                    return (
                                                                        <div
                                                                            key={`objective-loadout-${idx}`}
                                                                            className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 transition-colors ${
                                                                                isSelected
                                                                                    ? "border-neon-cyan bg-cyan-500/10"
                                                                                    : "border-white/10 bg-black/35"
                                                                            }`}
                                                                        >
                                                                            <div className="min-w-0">
                                                                                <div className={`truncate text-[9px] font-bold uppercase tracking-[0.16em] ${isSelected ? "text-neon-cyan" : "text-gray-200"}`}>
                                                                                    {item.name}
                                                                                </div>
                                                                                <div className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-gray-500">
                                                                                    {isWeapon ? "Combat loadout" : "Turn item"}
                                                                                    {hasUses && (
                                                                                        <span className={`ml-2 font-mono ${depleted ? "text-red-400" : "text-gray-400"}`}>
                                                                                            {item.usesRemaining ?? item.usesMax}/{item.usesMax}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <Button
                                                                                onClick={() => !depleted && handleLoadoutItemClick(item)}
                                                                                disabled={depleted || isActing}
                                                                                className={`h-7 min-w-[64px] border px-2 text-[8px] font-bold uppercase tracking-[0.18em] ${
                                                                                    depleted
                                                                                        ? "bg-black/40 text-gray-500 border-white/10 cursor-not-allowed"
                                                                                        : isSelected
                                                                                            ? "bg-neon-cyan text-black border-neon-cyan"
                                                                                            : "bg-black/50 text-gray-300 border-white/10 hover:bg-white/10"
                                                                                }`}
                                                                            >
                                                                                {depleted ? "EMPTY" : isWeapon ? (actionIntent === "ATTACK" ? "ARMED" : "ATTACK") : (isSelected ? "ACTIVE" : "ARM")}
                                                                            </Button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <Button
                                                        onClick={() => setShowInventory(!showInventory)}
                                                        className={`flex h-9 w-full items-center justify-between rounded border px-3 text-[9px] font-bold tracking-widest ${showInventory ? "bg-white text-black border-white" : "bg-black/50 text-gray-300 border-white/10 hover:bg-white/10"}`}
                                                    >
                                                        <span>BACKPACK</span>
                                                        <span>{backpackItems.length}</span>
                                                    </Button>

                                                    <Button
                                                        onClick={() => {
                                                            setShowInventory(false);
                                                            setShowSettings((current) => !current);
                                                        }}
                                                        className={`flex h-9 w-full items-center justify-between rounded border px-3 text-[9px] font-bold tracking-widest ${showSettings ? "bg-neon-cyan text-black border-neon-cyan" : "bg-black/50 text-gray-300 border-white/10 hover:bg-white/10"}`}
                                                    >
                                                        <span>SETTINGS</span>
                                                        <Settings2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            }
                                        />
                                    </div>

                                </div>

                                <div className="mt-1 flex-none rounded-b-3xl border border-white/6 bg-black/25 px-2 pb-1.5 pt-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                    <div className="flex min-h-[28px] items-center justify-between gap-2 px-1 pb-1">
                                        <div className="min-w-0 flex-1">
                                            {handStatusBanner ?? (
                                                <div className="text-[8px] uppercase tracking-[0.28em] text-gray-500">Hand Bay</div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                                            {HAND_FILTER_ORDER.map((filter) => {
                                                const isActive = cardFilter === filter;
                                                const tone = filter === "ALL"
                                                    ? "border-white/20 text-white"
                                                    : filter === "COMMAND"
                                                        ? "border-green-500/40 text-green-400"
                                                        : filter === "VOID"
                                                            ? "border-purple-500/40 text-purple-400"
                                                            : filter === "BIOTECH"
                                                                ? "border-red-500/40 text-red-400"
                                                                : filter === "PLASMA"
                                                                    ? "border-orange-500/40 text-orange-400"
                                                                    : "border-white/30 text-gray-200";

                                                return (
                                                    <button
                                                        key={`footer-filter-${filter}`}
                                                        type="button"
                                                        onClick={() => handleCardFilterChange(filter)}
                                                        className={`rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] transition-all ${
                                                            isActive
                                                                ? `${tone} bg-white/10 shadow-[0_0_10px_rgba(255,255,255,0.08)]`
                                                                : "border-white/10 text-gray-500 hover:border-white/30 hover:text-white"
                                                        }`}
                                                    >
                                                        {filter}
                                                    </button>
                                                );
                                            })}
                                            <div className="rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[10px] font-mono text-gray-400">
                                                {handEntries.length}/{handCapacity}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative rounded-2xl border border-white/6 bg-black/20 px-1.5 pt-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                        <div ref={handViewportRef} className="h-[148px] w-full overflow-hidden px-1 pt-1">
                                            <div
                                                className="flex w-full items-end justify-center perspective-[1000px]"
                                                style={handLayout.gap > 0 ? { gap: `${handLayout.gap}px` } : undefined}
                                            >
                                                <AnimatePresence initial={false}>
                                                    {visibleHandEntries.length > 0 ? visibleHandEntries.map(({ card, index }) => {
                                                        const centerOffset = index - ((visibleHandEntries.length - 1) / 2);
                                                        const fanDepth = Math.abs(centerOffset);
                                                        const fanRotationStep = visibleHandEntries.length >= 11
                                                            ? 1.05
                                                            : visibleHandEntries.length >= 9
                                                                ? 1.25
                                                                : visibleHandEntries.length >= 7
                                                                    ? 1.5
                                                                    : 1.8;
                                                        const fanRotate = centerOffset * fanRotationStep;
                                                        const fanLift = Math.min(4, Math.round(fanDepth * 0.75));
                                                        const baseZ = 120 + Math.round((visibleHandEntries.length * 2) - fanDepth * 8);

                                                        return (
                                                            <motion.div
                                                                key={card.id || index}
                                                                initial={{ y: 16 + fanLift, opacity: 0, scale: 0.94, rotate: fanRotate * 0.45 }}
                                                                animate={{
                                                                    y: fanLift + (selectedCardIndices.includes(index) ? -handLayout.selectionLift : 0),
                                                                    opacity: 1,
                                                                    scale: selectedCardIndices.includes(index) ? 1.03 : 1,
                                                                    rotate: fanRotate
                                                                }}
                                                                whileHover={{
                                                                    y: fanLift + (selectedCardIndices.includes(index) ? -handLayout.selectionLift : 0) - 4,
                                                                    scale: selectedCardIndices.includes(index) ? 1.04 : 1.03,
                                                                    rotate: fanRotate * 0.4,
                                                                    zIndex: 640 + index
                                                                }}
                                                                exit={{
                                                                    y: 14 + fanLift,
                                                                    opacity: 0,
                                                                    scale: 0.8,
                                                                    rotate: fanRotate * 0.35,
                                                                    transition: { duration: 0.3, ease: "easeOut" }
                                                                }}
                                                                transition={{
                                                                    y: { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] },
                                                                    opacity: { duration: 0.3 },
                                                                    scale: { duration: 0.3 },
                                                                    rotate: { duration: 0.35 }
                                                                }}
                                                                onClick={() => toggleCardSelection(index)}
                                                                className="group relative flex cursor-pointer select-none items-end justify-center active:scale-95 active:brightness-90"
                                                                style={{
                                                                    width: `${handLayout.cardWidth}px`,
                                                                    minWidth: `${handLayout.cardWidth}px`,
                                                                    height: `${handLayout.wrapperHeight}px`,
                                                                    marginLeft: index > 0 && handLayout.gap < 0 ? `${handLayout.gap}px` : undefined,
                                                                    zIndex: selectedCardIndices.includes(index) ? 520 + index : baseZ,
                                                                    transformOrigin: "center bottom"
                                                                }}
                                                            >
                                                                <NavCard
                                                                    card={card}
                                                                    selected={selectedCardIndices.includes(index)}
                                                                    size="lg"
                                                                    dimensions={{ width: handLayout.cardWidth, height: handLayout.cardHeight }}
                                                                    roomEffect={roomInfo?.scanned ? getRoomEffectForCard(card, roomInfo?.suit, true) : undefined}
                                                                />
                                                            </motion.div>
                                                        );
                                                    }) : (
                                                        <div className="text-xs text-center text-gray-500 border border-white/5 bg-white/5 p-4 rounded uppercase tracking-widest w-full max-w-sm">
                                                            {handEntries.length > 0 ? "No cards match that filter" : "No Signal Detected"}
                                                        </div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Inventory Overlay (Kept logic, just ensured z-index) */}
                        {showInventory && (
                            <>
                                {/* Backdrop for Click-Outside Closure */}
                                <div className="fixed inset-0 bg-black/50 z-[90]" onClick={() => setShowInventory(false)} />
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-black/95 border border-yellow-500/50 p-4 rounded-xl backdrop-blur-xl z-[100] shadow-2xl animate-in zoom-in-95">
                                    <h3 className="text-yellow-500 text-xs font-bold uppercase tracking-widest mb-4 flex justify-between">
                                        <span>Supply Manifest</span>
                                        <span className="cursor-pointer hover:text-white" onClick={() => setShowInventory(false)}>X</span>
                                    </h3>

                                    <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                        {/* COMBAT LOADOUT Section */}
                                        <div className="space-y-2">
                                            <div className="text-[10px] text-neon-cyan uppercase tracking-wider font-bold border-b border-neon-cyan/20 pb-1">Combat Loadout</div>
                                            {loadoutItems.length === 0 ? (
                                                <div className="text-gray-500 text-[10px] italic">No Equipment Assigned</div>
                                            ) : (
                                                loadoutItems.map((item: any, idx: number) => {
                                                    const hasUses = typeof item.usesMax === 'number';
                                                    const depleted = hasUses && (item.usesRemaining ?? item.usesMax) <= 0;
                                                    return (
                                                        <motion.div
                                                            key={`loadout-${idx}`}
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ duration: 0.3, delay: idx * 0.05 }}
                                                            className={`flex items-center justify-between p-2 rounded border transition-colors ${selectedItemIds.includes(item.id) ? "bg-neon-cyan/20 border-neon-cyan" : "bg-white/5 border-white/10 hover:bg-white/10"}`}
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className={`text-xs font-bold ${selectedItemIds.includes(item.id) ? "text-neon-cyan" : "text-white"}`}>{item.name}</span>
                                                                <span className="text-[9px] text-gray-500">
                                                                    {item.description}
                                                                    {hasUses && <span className={`ml-2 font-mono ${depleted ? "text-red-500" : "text-neon-cyan"}`}>[{item.usesRemaining ?? item.usesMax}/{item.usesMax}]</span>}
                                                                </span>
                                                            </div>
                                                            <Button
                                                                className={`h-6 text-[9px] border ${selectedItemIds.includes(item.id) ? "bg-neon-cyan text-black border-neon-cyan" : "bg-gray-800 text-gray-400 border-gray-600"} ${depleted ? "opacity-50 cursor-not-allowed" : ""}`}
                                                                onClick={() => !depleted && toggleItemSelection(item.id)}
                                                                disabled={depleted}
                                                            >
                                                                {depleted ? "EMPTY" : selectedItemIds.includes(item.id) ? "ACTIVE" : "SELECT"}
                                                            </Button>
                                                        </motion.div>
                                                    );
                                                })
                                            )}
                                        </div>

                                        {/* BACKPACK Section */}
                                        <div className="space-y-2">
                                            <div className="text-[10px] text-orange-400 uppercase tracking-wider font-bold border-b border-orange-500/20 pb-1 flex justify-between">
                                                <span>Backpack Storage</span>
                                                <span>{backpackItems.length}/5</span>
                                            </div>
                                            {backpackItems.length === 0 ? (
                                                <div className="text-gray-500 text-[10px] italic py-2">Backpack Empty</div>
                                            ) : (
                                                backpackItems.map((item: any, idx: number) => {
                                                    const hasUses = typeof item.usesMax === 'number';
                                                    const depleted = hasUses && (item.usesRemaining ?? item.usesMax) <= 0;
                                                    const isCycleableLoot = String(item.type || "").toUpperCase() === "LOOT";
                                                    return (
                                                        <motion.div
                                                            key={`backpack-${idx}`}
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ duration: 0.3, delay: idx * 0.05 }}
                                                            className={`flex items-center justify-between p-2 rounded border transition-colors ${selectedItemIds.includes(item.id) ? "bg-orange-500/20 border-orange-500" : "bg-white/5 border-white/10 hover:bg-white/10"}`}
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className={`text-xs font-bold flex items-center gap-2 ${selectedItemIds.includes(item.id) ? "text-orange-400" : "text-gray-300"}`}>
                                                                    {item.name}
                                                                    <span className="text-[10px] text-gray-500">x{item.qty}</span>
                                                                    {isCycleableLoot && (
                                                                        <span className="rounded border border-cyan-500/40 px-1 text-[8px] uppercase tracking-[0.18em] text-cyan-300">
                                                                            Draw
                                                                        </span>
                                                                    )}
                                                                    {item.suit && (() => {
                                                                        const s = item.suit.toUpperCase();
                                                                        let color = "text-gray-500 border-gray-500";
                                                                        if (s === "COMMAND") color = "text-green-500 border-green-500";
                                                                        if (s === "PLASMA") color = "text-orange-500 border-orange-500";
                                                                        if (s === "BIOTECH") color = "text-red-500 border-red-500";
                                                                        if (s === "VOID") color = "text-purple-500 border-purple-500";
                                                                        return <span className={`text-[8px] px-1 rounded border ${color} opacity-70`}>{s.slice(0, 3)}</span>;
                                                                    })()}
                                                                </span>
                                                                <span className="text-[9px] text-gray-500">
                                                                    {item.description}
                                                                    {isCycleableLoot && <span className="ml-2 text-cyan-300/80">Cycle to force 1 draw</span>}
                                                                    {hasUses && <span className={`ml-2 font-mono ${depleted ? "text-red-500" : "text-orange-400"}`}>[{item.usesRemaining ?? item.usesMax}/{item.usesMax}]</span>}
                                                                </span>
                                                            </div>
                                                            <Button
                                                                className={`h-6 text-[9px] border ${isCycleableLoot ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 hover:bg-cyan-400/20" : selectedItemIds.includes(item.id) ? "bg-orange-500 text-black border-orange-500" : "bg-gray-800 text-gray-400 border-gray-600"} ${depleted || isActing ? "opacity-50 cursor-not-allowed" : ""}`}
                                                                onClick={() => {
                                                                    if (depleted || isActing) return;
                                                                    if (isCycleableLoot) {
                                                                        handleUseItem(item.id);
                                                                        return;
                                                                    }
                                                                    toggleItemSelection(item.id);
                                                                }}
                                                                disabled={depleted || isActing}
                                                            >
                                                                {depleted ? "EMPTY" : isCycleableLoot ? "CYCLE" : selectedItemIds.includes(item.id) ? "USING" : "USE"}
                                                            </Button>
                                                        </motion.div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                        {showSettings && (
                            <>
                                <div className="fixed inset-0 bg-black/50 z-[90]" onClick={() => setShowSettings(false)} />
                                <div className="absolute top-1/2 left-1/2 z-[100] w-[24rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neon-cyan/30 bg-black/95 p-4 shadow-2xl backdrop-blur-xl">
                                    <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-2">
                                        <div>
                                            <div className="text-xs font-bold uppercase tracking-widest text-neon-cyan">Shipboard Settings</div>
                                            <div className="text-[10px] text-gray-500">Tune the in-mission HUD and layered audio mix.</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowSettings(false)}
                                            className="rounded border border-white/10 p-1 text-gray-400 transition-colors hover:border-white/30 hover:text-white"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                    </div>
                                    <AudioSettingsPanel compact />
                                </div>
                            </>
                        )}
                    </div>

                        </div>
                    </AutoFitViewport>
                </div>

            </main >
            <ResolutionOverlay data={resolutionData} onClose={() => setResolutionData(null)} />
        </div >
    );
}

// Sub-component for Sci-Fi Card
function NavCard({
    card,
    selected,
    size = "md",
    dimensions,
    roomEffect
}: {
    card: any,
    selected?: boolean,
    size?: "md" | "sm" | "lg",
    dimensions?: { width: number; height: number },
    roomEffect?: RoomEffectState
}) {
    const isSm = size === "sm";
    const preset = CARD_SIZE_PRESETS[size];
    const width = dimensions?.width ?? preset.width;
    const height = dimensions?.height ?? preset.height;
    const padding = Math.max(4, Math.round(width * 0.1));
    const borderRadius = Math.max(14, Math.round(width * 0.16));
    const hoverFrameInset = Math.max(8, Math.round(width * 0.085));
    const selectedFrameInset = Math.max(6, Math.round(width * 0.07));
    const rankFontSize = Math.max(11, Math.round(width * 0.15));
    const iconSize = Math.max(20, Math.round(width * 0.38));
    const labelFontSize = Math.max(6, Math.round(width * 0.08));
    const showLabel = !isSm && width >= 78;
    const effectBadgeInset = Math.max(6, Math.round(width * 0.075));
    const effectTone = roomEffect?.status === "up"
        ? "border-green-400/70 bg-green-500/12 text-green-300"
        : roomEffect?.status === "down"
            ? "border-red-400/70 bg-red-500/12 text-red-300"
            : roomEffect?.status === "neutral"
                ? "border-white/15 bg-white/5 text-gray-300"
                : "border-cyan-400/30 bg-cyan-500/10 text-cyan-200";
    const effectGlow = roomEffect?.status === "up"
        ? "inset 0 0 18px rgba(74,222,128,0.18)"
        : roomEffect?.status === "down"
            ? "inset 0 0 18px rgba(248,113,113,0.18)"
            : "none";

    // Mothership / Sci-Fi Theme Mapping
    const suitThemes: any = {
        "BIOTECH": { color: "text-red-500 border-red-500 shadow-red-500/20 bg-red-950/20", icon: <Heart className="w-full h-full" />, label: "BIOTECH" },
        "PLASMA": { color: "text-orange-400 border-orange-400 shadow-orange-400/20 bg-orange-950/20", icon: <Zap className="w-full h-full" />, label: "PLASMA" },
        "COMMAND": { color: "text-green-400 border-green-400 shadow-green-400/20 bg-green-950/20", icon: <Crosshair className="w-full h-full" />, label: "COMMAND" },
        "VOID": { color: "text-purple-400 border-purple-400 shadow-purple-400/20 bg-purple-950/20", icon: <Shield className="w-full h-full" />, label: "VOID" },
        "ANOMALY": { color: "text-white border-white shadow-white/20 bg-gray-900/50", icon: <AlertTriangle className="w-full h-full" />, label: "ANOMALY" }
    };

    const theme = suitThemes[card.suit] || { color: "text-gray-400 border-gray-400", icon: "?", label: "UNKNOWN" }; // Fallback
    const bgColor = selected ? "bg-slate-900" : "bg-black/40 backdrop-blur-sm";

    return (
        <div className={`
            relative border-2 flex flex-col items-center justify-between overflow-hidden transition-all duration-300 active:scale-95
            ${theme.color} ${bgColor}
            ${selected ? "z-20 brightness-110 shadow-[0_0_18px_rgba(255,255,255,0.12)]" : "group-hover:brightness-125 group-hover:shadow-[0_0_24px_rgba(255,255,255,0.2)]"}
        `}
            style={{ width: `${width}px`, height: `${height}px`, padding: `${padding}px`, borderRadius: `${borderRadius}px` }}
        >
            {/* Holographic Scanline Overlay */}
            <div className="absolute inset-0 bg-[url('/scanlines.png')] opacity-20 pointer-events-none" />
            <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-20"
                style={{
                    background: "radial-gradient(circle at 50% 40%, currentColor 0%, transparent 72%)"
                }}
            />
            <div
                className="pointer-events-none absolute opacity-0 transition-opacity duration-150 group-hover:opacity-40"
                style={{
                    inset: `${hoverFrameInset}px`,
                    borderRadius: `${Math.max(10, borderRadius - hoverFrameInset)}px`,
                    boxShadow: "inset 0 0 0 1px currentColor, inset 0 0 18px currentColor"
                }}
            />
            {selected && (
                <>
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background: "radial-gradient(circle at 50% 42%, currentColor 0%, transparent 72%)",
                            opacity: 0.12
                        }}
                    />
                    <div
                        className="pointer-events-none absolute"
                        style={{
                            inset: `${selectedFrameInset}px`,
                            borderRadius: `${Math.max(10, borderRadius - selectedFrameInset)}px`,
                            boxShadow: "inset 0 0 0 1.5px currentColor, inset 0 0 20px currentColor",
                            opacity: 0.36
                        }}
                    />
                </>
            )}
            {roomEffect && !isSm && (
                <>
                    <div
                        className="pointer-events-none absolute"
                        style={{
                            inset: `${effectBadgeInset}px`,
                            borderRadius: `${Math.max(10, borderRadius - effectBadgeInset)}px`,
                            boxShadow: effectGlow,
                            opacity: roomEffect.status === "neutral" || roomEffect.status === "unknown" ? 0.5 : 0.8
                        }}
                    />
                    <div className={`absolute right-2 top-2 rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] ${effectTone}`}>
                        {roomEffect.modifier > 0 ? `+${roomEffect.modifier}` : roomEffect.modifier < 0 ? `${roomEffect.modifier}` : roomEffect.status === "unknown" ? "?" : "0"}
                    </div>
                </>
            )}

            {/* Rank (Top Left) */}
            <div className="w-full text-left font-black opacity-80" style={{ fontSize: `${rankFontSize}px`, lineHeight: 1 }}>
                {card.rank}
            </div>

            {/* Icon (Center) */}
            <div className="flex flex-col items-center justify-center gap-1 opacity-80" style={{ width: `${iconSize}px`, height: `${iconSize}px` }}>
                {theme.icon}
                {showLabel && (
                    <span className="font-bold tracking-widest" style={{ fontSize: `${labelFontSize}px`, lineHeight: 1 }}>
                        {theme.label}
                    </span>
                )}
            </div>
            {roomEffect && !isSm && (
                <div className={`w-full rounded-md border px-1.5 py-1 text-center text-[7px] font-black uppercase tracking-[0.16em] ${effectTone}`}>
                    {roomEffect.label}
                </div>
            )}
        </div>
    );
}
