"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Zap, Crosshair, User, Heart, AlertTriangle, Cpu, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import SectorGrid from "@/components/game/SectorGrid";
import RoomScanner from "@/components/game/RoomScanner";
import MissionLog from "@/components/game/MissionLog";
import { useToast } from "@/components/ui/Toast";
import SafeImage from "@/components/ui/SafeImage";

type Facing = "NORTH" | "EAST" | "SOUTH" | "WEST";

const parseJSON = (raw: any, fallback: any) => {
    try { return JSON.parse(raw); } catch { return fallback; }
};

const relativeToAbsolute: Record<Facing, Record<string, string>> = {
    NORTH: { FORWARD: "FORWARD", BACK: "BACK", LEFT: "LEFT", RIGHT: "RIGHT" },
    EAST: { FORWARD: "RIGHT", BACK: "LEFT", LEFT: "FORWARD", RIGHT: "BACK" },
    SOUTH: { FORWARD: "BACK", BACK: "FORWARD", LEFT: "RIGHT", RIGHT: "LEFT" },
    WEST: { FORWARD: "LEFT", BACK: "RIGHT", LEFT: "BACK", RIGHT: "FORWARD" }
};

const toAbsoluteDirection = (relative: string, facing: Facing) => {
    return relativeToAbsolute[facing]?.[relative] || relative;
};

export default function GameInterface() {
    const params = useParams();
    const router = useRouter();
    const [gameState, setGameState] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
    const [isActing, setIsActing] = useState(false);
    const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);
    const [actionTimeLeft, setActionTimeLeft] = useState(0);
    const [missionTimeLeft, setMissionTimeLeft] = useState(0);
    const [showInventory, setShowInventory] = useState(false);
    const [actionIntent, setActionIntent] = useState<"MOVE" | "SCAN" | "ATTACK" | "SECURE" | null>(null);
    const [moveDirection, setMoveDirection] = useState<string | null>(null);
    const [exitIntent, setExitIntent] = useState<"ABORT" | "DEPART" | null>(null);
    const [mapZ, setMapZ] = useState<number | null>(null);
    const hasStartedRoundRef = useRef(false);
    const prevPlayerZRef = useRef<number | null>(null);
    const { addToast } = useToast();
    const lastPileSizeRef = useRef(0);
    const { game, player } = gameState ?? { game: null, player: null };
    const inventory = useMemo(() => {
        try { return player?.inventory ? JSON.parse(player.inventory) : []; } catch { return []; }
    }, [player?.inventory]);
    const roomInfo = useMemo(() => {
        if (!player?.MapNode) return null;
        let secret: any[] = [];
        try { secret = player.MapNode.secretPaths ? JSON.parse(player.MapNode.secretPaths) : []; } catch { secret = []; }
        return {
            power: player.MapNode.roomPower,
            suit: player.MapNode.roomSuit,
            integrity: player.MapNode.integrity,
            security: player.MapNode.security,
            scanned: player.MapNode.scanned,
            secretPaths: secret
        };
    }, [player?.MapNode]);
    const suitMeta = {
        BIOTECH: { color: "text-red-400", icon: "BIO" },
        PLASMA: { color: "text-orange-400", icon: "PLS" },
        COMMAND: { color: "text-green-400", icon: "CMD" },
        VOID: { color: "text-purple-400", icon: "VOID" },
        ANOMALY: { color: "text-white", icon: "VOID" }
    } as const;
    const roomSuitMeta = roomInfo?.suit ? suitMeta[roomInfo.suit as keyof typeof suitMeta] : null;
    const connections = useMemo(() => parseJSON(player?.MapNode?.connections || "[]", []), [player?.MapNode?.connections]);
    const roomEnemies = useMemo(() => parseJSON(player?.MapNode?.enemies || "[]", []), [player?.MapNode?.enemies]);
    const hasEnemies = roomEnemies.length > 0;
    const isAirlock = player?.MapNode?.type === "START";
    const playerMarkers = useMemo(() => {
        const markers: { id: string; x: number; y: number; z: number; isCurrent?: boolean }[] = [];
        if (player?.MapNode) {
            markers.push({
                id: player.characterId,
                x: player.MapNode.x,
                y: player.MapNode.y,
                z: player.MapNode.z,
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
    }, [player?.MapNode, player?.characterId, gameState?.otherPlayers]);

    // Fetch Game State
    useEffect(() => {
        const fetchGameState = async () => {
            try {
                const res = await fetch(`/api/game/state?gameId=${params.id}`);
                const data = await res.json();

                if (data.error) {
                    if (res.status === 410 || data.error.includes("Corrupted")) {
                        addToast(data.error, "error");
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

                if (data.game && typeof data.game.objectives === 'string') {
                    data.game.objectives = JSON.parse(data.game.objectives);
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

    // Action Timer Logic
    useEffect(() => {
        const target = gameState?.game?.actionDeadline;
        if (!target) {
            setActionTimeLeft(0);
            return;
        }
        const updateTimer = () => {
            const now = Date.now();
            const end = new Date(target).getTime();
            const diff = Math.max(0, Math.floor((end - now) / 1000));
            setActionTimeLeft(diff);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [gameState?.game?.actionDeadline]);

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


    // AI Move Detector - REMOVED (Handled by Server Response)
    useEffect(() => {
        if (!gameState?.game?.currentPile) return;
        lastPileSizeRef.current = gameState.game.currentPile.length;
    }, [gameState?.game?.currentPile]);

    const toggleCardSelection = (idx: number) => {
        const hand = (player?.hand as any[]) || [];
        const card = hand[idx];
        if (!card) return;
        const current = selectedCardIndices;
        if (current.includes(idx)) {
            setSelectedCardIndices(current.filter(i => i !== idx));
            return;
        }
        if (current.length === 0) {
            setSelectedCardIndices([...current, idx]);
            return;
        }
        const first = hand[current[0]];
        if (first && first.rank === card.rank) {
            setSelectedCardIndices([...current, idx]);
            return;
        }
        addToast("DOUBLES MUST MATCH RANK", "error");
    };

    if (loading) return <div className="min-h-full flex items-center justify-center text-neon-cyan">Loading Game Protocol...</div>;
    if (!gameState) return <div className="min-h-full flex items-center justify-center text-red-500">Game Not Found</div>;

    const inActionPhase = game?.roundPhase === "ACTION";
    const facing = (player?.facing || "NORTH") as Facing;
    const mapRotationDeg = facing === "EAST" ? 90 : facing === "SOUTH" ? 180 : facing === "WEST" ? 270 : 0;
    const isRoomScanned = !!player?.MapNode?.scanned;
    const isBossRoom = player?.MapNode?.type === "BOSS";
    const isVictory = game?.phase === "VICTORY" || game?.roundPhase === "VICTORY";
    const activeDeck = mapZ ?? (player?.MapNode?.z ?? 0);
    const hasActionTimer = !!game?.actionDeadline;
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
    const canScan = inActionPhase && !isAirlock && !isRoomScanned;
    const canSecure = inActionPhase && !isAirlock && isRoomScanned;
    const canAttack = inActionPhase && !isAirlock && (hasEnemies || isBossRoom);
    const canAutoMove = inActionPhase && isAirlock && actionIntent === "MOVE";
    const canMoveSelected = moveDirection === "FORWARD" ? canMoveForward
        : moveDirection === "BACK" ? canMoveBack
            : moveDirection === "LEFT" ? canMoveLeft
                : moveDirection === "RIGHT" ? canMoveRight
                    : moveDirection === "UP" ? canMoveUp
                        : moveDirection === "DOWN" ? canMoveDown
                            : false;
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
    const actionTimerLabel = !inActionPhase ? "T--" : (hasActionTimer ? `T-${actionTimeLeft}s` : "READY");
    const pileOwnerIsMe = player && game?.pileOwnerId === player.characterId; // Use CharacterID for consistent ownership

    const handleUseItem = async (itemId: string) => {
        setIsActing(true);
        try {
            const res = await fetch('/api/game/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: params.id, action: "USE_ITEM", itemId })
            });
            const data = await res.json();
            if (data.success) {
                addToast(data.message || "ITEM USED", "success");
                // Refresh? SWR handles it? Or need manual refresh?
                // Usually router.refresh() or state update.
                // Assuming useSWR or similar or interval key.
            } else {
                addToast(data.error || "ITEM FAILURE", "error");
            }
        } catch (e) { console.error(e); }
        finally { setIsActing(false); }
    };

    const handleEmergencyEscape = async () => {
        if (isActing || !player) return;
        setIsActing(true);
        try {
            const res = await fetch('/api/game/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: params.id,
                    action: "LOCK_ACTION",
                    intent: "MOVE",
                    emergency: true
                })
            });
            const data = await res.json();
            if (data.error) {
                addToast(data.error, "error");
            } else {
                addToast(data.message || "EMERGENCY ESCAPE LOCKED", "success");
                setActionIntent(null);
                setMoveDirection(null);
                setSelectedCardIndices([]);
            }
        } catch (e) {
            console.error(e);
            addToast("SYSTEM FAILURE", "error");
        } finally {
            setIsActing(false);
        }
    };

    const handleVictoryExit = async () => {
        if (isActing) return;
        setIsActing(true);
        try {
            await fetch('/api/game/quit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: params.id, reason: "VICTORY" })
            });
            router.push(`/game/${params.id}/summary`);
        } catch (e) {
            console.error(e);
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
        try {
            const res = await fetch('/api/game/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: params.id,
                    action: "LOCK_ACTION",
                    cards: payloadCards,
                    intent: intentOverride || actionIntent || "SCAN",
                    direction: moveDirection
                })
            });
            const data = await res.json();
            if (data.error) {
                addToast(data.error, "error");
            } else {
                addToast(data.message || "ACTION LOCKED", "success");
                setSelectedCardIndices([]);
                setActionIntent(null);
                setMoveDirection(null);
            }
        } catch (e) {
            console.error(e);
            addToast("SYSTEM FAILURE", "error");
        } finally {
            setIsActing(false);
        }
    };

    const confirmExit = async () => {
        if (!exitIntent) return;
        setIsActing(true);
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
            addToast("EXIT FAILURE", "error");
        } finally {
            setIsActing(false);
            setExitIntent(null);
        }
    };
    const handleExecute = () => lockAction(undefined, undefined, canAutoMove && selectedCardIndices.length === 0);

    // Legacy handleMove replacement (for minimal diff impact if stuck)
    const handleMove = async () => { };


    // Format Timers
    const missionMinutes = Math.floor(missionTimeLeft / 60);
    const missionSeconds = missionTimeLeft % 60;

    return (
        <div className="h-full bg-black text-white relative overflow-hidden font-mono flex flex-col">
            {/* Background Ambiance */}
            <div className="absolute inset-0 bg-[url('/bg-space.jpg')] bg-cover opacity-50 z-0" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 z-0" />

            {/* Header: Player Stats, Timer, Abort */}
            <header className="relative z-30 px-2 py-1 grid grid-cols-3 items-center h-12 shrink-0 border-b border-white/10 bg-black/40 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-[9px] text-gray-500 uppercase tracking-widest">
                    SYS STATUS
                </div>

                {player && (
                    <div className="flex items-center justify-center gap-3">
                        <div className="w-8 h-8 bg-gray-800 rounded-full overflow-hidden border-2 border-neon-cyan shadow-[0_0_8px_#0ff]">
                            {player.character?.portrait && (
                                <img
                                    src={player.character.portrait}
                                    alt={`${player.character.name} portrait`}
                                    title={`${player.character.name} portrait`}
                                    className="w-full h-full object-cover"
                                />
                            )}
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="text-xs md:text-sm font-bold text-neon-cyan uppercase tracking-widest leading-none">{player.character.name}</div>
                            <div className="flex gap-2 text-[9px] text-gray-400 font-bold">
                                <span className="flex items-center text-red-400"><Heart className="w-3 h-3 mr-1" /> {player.hp}/{player.maxHp}</span>
                                <span className="flex items-center text-yellow-400"><Zap className="w-3 h-3 mr-1" /> {player.ap}</span>
                                <span className="flex items-center text-cyan-300"><Cpu className="w-3 h-3 mr-1" /> {player.stress ?? 0}</span>
                                <span className="flex items-center text-purple-300">LVL {player.character.level ?? 1}</span>
                            </div>
                        </div>
                        <div className="hidden lg:flex flex-col justify-center items-center px-3 border-l border-white/10">
                            <div className="text-[9px] text-gray-500 uppercase tracking-widest">T-MINUS</div>
                            <div className={`text-lg font-bold font-mono ${game?.deadline && missionTimeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                                {game?.deadline ? `${missionMinutes}:${missionSeconds.toString().padStart(2, '0')}` : "--:--"}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-end">
                    {player?.MapNode?.type === "START" ? (
                        <Button
                            variant="primary"
                            className="bg-green-500/10 text-green-500 border border-green-500 hover:bg-green-500 hover:text-black h-7 text-[10px] px-3"
                            onClick={() => setExitIntent("DEPART")}
                        >
                            DEPART
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            className="border-red-500/50 text-red-500 hover:bg-red-950/50 h-7 text-[10px] px-2"
                            onClick={() => setExitIntent("ABORT")}
                        >
                            ABORT
                        </Button>
                    )}
                </div>
            </header>

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
                                {exitIntent === "DEPART" ? "Extraction Protocol" : "Abort Protocol"}
                            </div>
                            <div className="text-sm text-white mb-4">
                                {exitIntent === "DEPART" ? "Depart the sector and end the mission?" : "Abort mission and return to summary?"}
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
                                    CONFIRM
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Grid Layout */}
            <main className="flex-1 min-h-0 grid grid-cols-12 gap-2 p-2 z-20 relative overflow-hidden w-full">
            <main className="flex-1 min-h-0 grid grid-cols-12 gap-2 p-2 z-20 relative overflow-hidden w-full">

                {/* LEFT PANEL: Map & Info (Col Span 3) - Mobile Order 3 */}
                <div className="flex col-span-3 flex-col gap-2 h-full min-h-0 relative overflow-hidden">
                <div className="flex col-span-3 flex-col gap-2 h-full min-h-0 relative overflow-hidden">

                    {/* Mission Log (Top - Fixed Height) */}
                    <div className="glass-panel p-3 border border-white/10 h-48 shrink-0 overflow-y-auto custom-scrollbar">
                        <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">MISSION OBJECTIVES</div>
                        <MissionLog objectives={game.objectives || []} />
                    </div>

                    {/* Room Intel */}
                    {roomInfo && (
                        <div className="glass-panel p-3 border border-white/20 text-sm space-y-2">
                            <div className="text-[9px] text-gray-500 uppercase tracking-widest border-b border-white/5 pb-1">ROOM INTEL</div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400 text-xs">Power</span>
                                <span className={`font-bold ${roomInfo.scanned ? (roomSuitMeta?.color || "text-neon-cyan") : "text-gray-500"}`}>{roomInfo.scanned ? roomInfo.power : "?"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400 text-xs">Suit</span>
                                <span className={`font-bold flex items-center gap-2 ${roomInfo.scanned ? (roomSuitMeta?.color || "text-neon-cyan") : "text-gray-500"}`}>
                                    <span className="text-[10px]">{roomInfo.scanned ? (roomSuitMeta?.icon || "?") : "?"}</span>
                                    {roomInfo.scanned ? roomInfo.suit : "UNKNOWN"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400 text-xs">Integrity</span>
                                <span className="font-bold text-white">{roomInfo.scanned ? `${roomInfo.integrity}%` : "?"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400 text-xs">Security</span>
                                <span className="font-bold text-white">{roomInfo.security ?? 0}</span>
                            </div>
                            {player?.MapNode?.type === "BOSS" && (
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400 text-xs">Core Integrity</span>
                                    <span className="font-bold text-red-400">{game?.integrity ?? 0}%</span>
                                </div>
                            )}
                            <div className="text-[10px] text-gray-500">{roomInfo.scanned ? "SCANNED" : "UNSCANNED"}</div>
                            {roomInfo.secretPaths?.length > 0 && (
                                <div className="text-[10px] text-neon-cyan">Secret path mapped.</div>
                            )}
                        </div>
                    )}

                    {/* Map (Middle - Flex Grow / Main Focus) */}
                    {player?.MapNode && (
                        <div className="glass-panel p-3 border border-white/20 flex-1 min-h-0 flex flex-col animate-in slide-in-from-left duration-500 shadow-lg">
                            <div className="flex items-center justify-between mb-2 border-b border-white/5 pb-1">
                                <div className="flex items-center gap-2">
                                    <div className="text-[9px] text-gray-500 uppercase tracking-widest">SECTOR MAP</div>
                                    <div className="flex items-center gap-1 text-[8px] text-gray-400">
                                        <div className="relative w-5 h-5 rounded-full border border-white/10 bg-black/60 flex items-center justify-center">
                                            <div
                                                className="absolute inset-0 flex items-center justify-center transition-transform duration-300"
                                                style={{ transform: `rotate(${mapRotationDeg}deg)` }}
                                            >
                                                <ChevronUp className="w-3 h-3 text-neon-cyan" />
                                                <span className="absolute -top-1 text-[7px] text-neon-cyan font-bold">N</span>
                                            </div>
                                        </div>
                                        <span className="uppercase tracking-widest">ORT {facing}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {[0, 1, 2].map((z) => (
                                        <button
                                            key={z}
                                            type="button"
                                            onClick={() => setMapZ(z)}
                                            className={`px-2 py-0.5 text-[8px] rounded border ${activeDeck === z ? "bg-neon-cyan text-black border-neon-cyan" : "bg-black/50 text-gray-400 border-white/10 hover:border-white/30"}`}
                                        >
                                            D{z}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setMapZ(player.MapNode.z)}
                                        className="px-2 py-0.5 text-[8px] rounded border bg-black/50 text-neon-cyan border-white/10 hover:border-white/30"
                                    >
                                        FOLLOW
                                    </button>
                                </div>
                            </div>
                            <div className="w-full flex-1 min-h-0 bg-black/50 border border-white/5 relative overflow-hidden rounded">
                                <div className="w-full h-full transition-transform duration-300" style={{ transform: `rotate(${mapRotationDeg}deg)` }}>
                                    <SectorGrid nodes={game.MapNode || []} currentPlayerNodeId={player.nodeId} activeZ={activeDeck} playerMarkers={playerMarkers} />
                                </div>
                                <div className="absolute bottom-1 right-1 text-[8px] font-mono text-gray-600">GRID v.0.9</div>
                            </div>
                            <div className="flex justify-between items-end mt-2">
                                <span className={`text-sm font-bold ${player.MapNode.type === 'START' ? 'text-green-400' : 'text-white'}`}>{player.MapNode.type}</span>
                                <span className="text-xs font-mono text-gray-400 bg-gray-900 px-2 rounded">[{player.MapNode.x}, {player.MapNode.y}, {player.MapNode.z}]</span>
                            </div>
                        </div>
                    )}

                    {/* Turn Order (Bottom) */}
                    <div className="glass-panel p-3 border border-white/10 bg-black/60 shrink-0">
                        <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">SQUAD PROTOCOL</div>
                        <div className="flex flex-col gap-2">
                            {game.turnOrder.map((pid: string, idx: number) => {
                                const isActive = idx === game.activePlayerIndex;
                                const isAI = pid === "STATION_CORE";
                                const isEnv = pid === "ENVIRONMENT";
                                let name = pid.substring(0, 8);

                                const p = gameState.otherPlayers.find((op: any) => op.id === pid) || (pid === player?.characterId ? player : null);

                                if (pid === player?.characterId) name = "YOU";
                                else if (isAI || isEnv) name = "CORE AI";
                                else if (p) name = p.character?.name || p.name || "UNKNOWN";

                                return (
                                    <div key={idx} className={`text-xs flex justify-between items-center p-1 rounded ${isActive ? 'bg-white/10 text-neon-cyan font-bold border-l-2 border-neon-cyan' : 'text-gray-600'}`}>
                                        <span>{name}</span>
                                        {isActive && <span className="animate-pulse text-[9px]">ACTIVE</span>}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                </div>

                {/* CENTER PANEL: HUD & Controls (Col Span 6) - Mobile Order 1 */}
                <div className="flex col-span-6 flex-col items-center gap-2 h-full min-h-0 relative">

                    {/* Navigation HUD */}
                    <div className="glass-panel p-3 border border-white/20 text-center animate-fade-in relative overflow-hidden w-full max-w-lg mb-2 bg-black/40 backdrop-blur-md shadow-2xl">
                        {/* Scanner */}
                        <div className="mb-3 flex justify-center">
                            <div className="w-[180px] h-[120px] border border-gray-800 rounded bg-black relative shadow-inner overflow-hidden">
                                <RoomScanner type={player.MapNode.type} isExplored={player.MapNode.isExplored} integrity={game.integrity} />
                            </div>
                        </div>

                        {/* Status Text */}
                        <div className="text-[10px] md:text-xs text-neon-cyan uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
                            <span className="flex-1 text-left">Sys: {actionStatus}</span>
                            <span className={`flex-1 text-center ${roomInfo && roomInfo.scanned && roomInfo.integrity < 50 ? "text-red-400" : "text-gray-400"}`}>
                                INT {roomInfo?.scanned ? `${roomInfo.integrity}%` : "--"}
                            </span>
                            <span className="flex-1 text-right text-gray-400">{actionTimerLabel}</span>
                        </div>

                        {/* Room card reveal */}
                        {roomInfo && (
                            <div className="mb-3 flex items-center justify-center">
                                <div className="px-3 py-2 rounded-lg border border-white/10 bg-black/60 text-xs text-center">
                                    <div className="text-gray-500">Room Card</div>
                                    <div className={`text-lg font-bold flex items-center justify-center gap-2 ${roomInfo.scanned ? (roomSuitMeta?.color || "text-neon-cyan") : "text-gray-500"}`}>
                                        <span className="text-[10px]">{roomInfo.scanned ? (roomSuitMeta?.icon || "?") : "?"}</span>
                                        {roomInfo.scanned ? roomInfo.power : "??"}
                                    </div>
                                    <div className={`text-[11px] uppercase flex items-center justify-center gap-2 ${roomInfo.scanned ? (roomSuitMeta?.color || "text-neon-cyan") : "text-gray-500"}`}>
                                        <span className="text-[10px]">{roomInfo.scanned ? (roomSuitMeta?.icon || "?") : "?"}</span>
                                        {roomInfo.scanned ? roomInfo.suit : "Unknown"}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Controls (Unified Command) */}
                        <div className="flex flex-col items-center gap-3 mt-2">
                            {/* Directional Pad */}
                            <div className={`grid grid-cols-3 gap-2 p-4 bg-black/60 rounded-full border border-white/10 relative transition-opacity duration-300 ${actionIntent === 'MOVE' ? 'opacity-100 ring-2 ring-neon-cyan' : 'opacity-60'}`}>
                                <div />
                                <Button
                                    onClick={() => { setActionIntent("MOVE"); setMoveDirection("FORWARD"); }}
                                    disabled={!canMoveForward}
                                    className={`h-12 w-12 rounded-t-xl ${moveDirection === "FORWARD" && actionIntent === "MOVE" ? "bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,255,255,0.5)]" : "bg-black border border-white/20 text-neon-cyan hover:bg-white/10"} ${!canMoveForward ? "opacity-30 cursor-not-allowed hover:bg-black" : ""}`}
                                >
                                    <ChevronUp className="w-5 h-5" />
                                </Button>
                                <div />

                                <Button
                                    onClick={() => { setActionIntent("MOVE"); setMoveDirection("LEFT"); }}
                                    disabled={!canMoveLeft}
                                    className={`h-12 w-12 rounded-l-xl ${moveDirection === "LEFT" && actionIntent === "MOVE" ? "bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,255,255,0.5)]" : "bg-black border border-white/20 text-neon-cyan hover:bg-white/10"} ${!canMoveLeft ? "opacity-30 cursor-not-allowed hover:bg-black" : ""}`}
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </Button>
                                <div className="h-12 w-12 flex items-center justify-center bg-black/80 rounded-full border border-white/5">
                                    <div className={`w-2 h-2 rounded-full ${actionIntent === "MOVE" ? "bg-neon-cyan animate-ping" : "bg-gray-800"}`} />
                                </div>
                                <Button
                                    onClick={() => { setActionIntent("MOVE"); setMoveDirection("RIGHT"); }}
                                    disabled={!canMoveRight}
                                    className={`h-12 w-12 rounded-r-xl ${moveDirection === "RIGHT" && actionIntent === "MOVE" ? "bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,255,255,0.5)]" : "bg-black border border-white/20 text-neon-cyan hover:bg-white/10"} ${!canMoveRight ? "opacity-30 cursor-not-allowed hover:bg-black" : ""}`}
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </Button>

                                <div />
                                <Button
                                    onClick={() => { setActionIntent("MOVE"); setMoveDirection("BACK"); }}
                                    disabled={!canMoveBack}
                                    className={`h-12 w-12 rounded-b-xl ${moveDirection === "BACK" && actionIntent === "MOVE" ? "bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,255,255,0.5)]" : "bg-black border border-white/20 text-neon-cyan hover:bg-white/10"} ${!canMoveBack ? "opacity-30 cursor-not-allowed hover:bg-black" : ""}`}
                                >
                                    <ChevronDown className="w-5 h-5" />
                                </Button>
                                <div />
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    onClick={() => { setActionIntent("MOVE"); setMoveDirection("UP"); }}
                                    disabled={!canMoveUp}
                                    className={`h-8 w-16 text-[10px] font-bold tracking-widest border transition-all ${moveDirection === "UP" && actionIntent === "MOVE" ? "bg-neon-cyan text-black border-neon-cyan shadow-[0_0_10px_rgba(0,255,255,0.4)]" : "bg-black/50 text-neon-cyan border-white/20 hover:bg-white/10"} ${!canMoveUp ? "opacity-30 cursor-not-allowed hover:bg-black/50" : ""}`}
                                >
                                    UP
                                </Button>
                                <Button
                                    onClick={() => { setActionIntent("MOVE"); setMoveDirection("DOWN"); }}
                                    disabled={!canMoveDown}
                                    className={`h-8 w-16 text-[10px] font-bold tracking-widest border transition-all ${moveDirection === "DOWN" && actionIntent === "MOVE" ? "bg-neon-cyan text-black border-neon-cyan shadow-[0_0_10px_rgba(0,255,255,0.4)]" : "bg-black/50 text-neon-cyan border-white/20 hover:bg-white/10"} ${!canMoveDown ? "opacity-30 cursor-not-allowed hover:bg-black/50" : ""}`}
                                >
                                    DOWN
                                </Button>
                            </div>

                            {/* Extra Actions Selection */}
                            <div className="flex gap-4">
                                <Button
                                    onClick={() => { setActionIntent("SCAN"); setMoveDirection(null); }}
                                    disabled={!canScan}
                                    className={`w-28 h-10 text-xs font-bold tracking-widest border transition-all ${actionIntent === "SCAN" ? "bg-green-500 text-black border-green-500 shadow-[0_0_15px_rgba(0,255,0,0.3)]" : "bg-black/50 text-green-500 border-green-900 hover:bg-green-900/30"} ${!canScan ? "opacity-30 cursor-not-allowed hover:bg-black/50" : ""}`}
                                >
                                    SCAN
                                </Button>
                                <Button
                                    onClick={() => { setActionIntent("ATTACK"); setMoveDirection(null); }}
                                    disabled={!canAttack}
                                    className={`w-28 h-10 text-xs font-bold tracking-widest border transition-all ${actionIntent === "ATTACK" ? "bg-red-500 text-black border-red-500 shadow-[0_0_15px_rgba(255,0,0,0.3)]" : "bg-black/50 text-red-500 border-red-900 hover:bg-red-900/30"} ${!canAttack ? "opacity-30 cursor-not-allowed hover:bg-black/50" : ""}`}
                                >
                                    ENGAGE
                                </Button>
                                <Button
                                    onClick={() => { setActionIntent("SECURE"); setMoveDirection(null); }}
                                    disabled={!canSecure}
                                    className={`w-28 h-10 text-xs font-bold tracking-widest border transition-all ${actionIntent === "SECURE" ? "bg-yellow-400 text-black border-yellow-400 shadow-[0_0_15px_rgba(255,255,0,0.3)]" : "bg-black/50 text-yellow-400 border-yellow-900 hover:bg-yellow-900/30"} ${!canSecure ? "opacity-30 cursor-not-allowed hover:bg-black/50" : ""}`}
                                >
                                    SECURE
                                </Button>
                            </div>
                            <div className="mt-1">
                                <Button
                                    onClick={handleExecute}
                                    disabled={(!actionIntent || actionInvalid || (selectedCardIndices.length === 0 && !canAutoMove)) || isActing || !inActionPhase}
                                    className={`w-60 py-3 text-[11px] font-bold tracking-widest transition-all duration-300 rounded-xl border-2
                                        ${(actionIntent && !actionInvalid && (selectedCardIndices.length > 0 || canAutoMove) && inActionPhase)
                                            ? "bg-neon-cyan text-black border-neon-cyan shadow-[0_0_20px_#0ff] hover:bg-white hover:scale-105"
                                            : "bg-black/50 text-gray-600 border-gray-800"}
                                    `}
                                >
                                    {!inActionPhase ? "WAITING FOR DRAW" :
                                        !actionIntent ? "SELECT PROTOCOL" :
                                            (selectedCardIndices.length === 0 && !canAutoMove) ? "SELECT CARD" :
                                                (selectedCardIndices.length === 0 && canAutoMove) ? "LOCK MOVE (AUTO)" :
                                                    `LOCK ${actionIntent}`}
                                </Button>
                            </div>
                            <div className="mt-1">
                                <Button
                                    onClick={() => setShowInventory(!showInventory)}
                                    className={`w-28 h-8 text-[10px] font-bold tracking-widest border transition-all ${showInventory ? "bg-white text-black border-white" : "bg-black/40 text-gray-300 border-white/10 hover:bg-white/10"}`}
                                >
                                    SUPPLIES
                                </Button>
                            </div>
                            <div className="mt-3 w-full flex flex-col items-center gap-2">
                                <div className="text-[10px] text-neon-cyan font-bold tracking-widest">
                                    AP POOL {game?.sharedAp ?? 0}/{game?.sharedApMax ?? 0}
                                </div>
                                <Button
                                    onClick={handleExecute}
                                    disabled={(!actionIntent || actionInvalid || (selectedCardIndices.length === 0 && !canAutoMove)) || isActing || !inActionPhase}
                                    className={`w-64 py-3 text-xs font-bold tracking-widest transition-all duration-300 rounded-xl border-2
                                            ${(actionIntent && !actionInvalid && (selectedCardIndices.length > 0 || canAutoMove) && inActionPhase)
                                        ? 'bg-neon-cyan text-black border-neon-cyan shadow-[0_0_20px_#0ff] hover:bg-white hover:scale-105'
                                        : 'bg-black/50 text-gray-600 border-gray-800'}
                                        `}
                                >
                                    {!inActionPhase ? 'WAITING FOR DRAW' :
                                        !actionIntent ? 'SELECT PROTOCOL' :
                                            (selectedCardIndices.length === 0 && !canAutoMove) ? 'SELECT CARD' :
                                                (selectedCardIndices.length === 0 && canAutoMove) ? 'LOCK MOVE (AUTO)' :
                                                    `LOCK ${actionIntent}`}
                                </Button>
                                <Button
                                    onClick={handleEmergencyEscape}
                                    disabled={!inActionPhase || isActing}
                                    variant="ghost"
                                    className={`w-64 text-red-200 hover:text-white text-[10px] border border-red-900/60 bg-red-950/40 hover:bg-red-900/60 px-4 py-2 ${!inActionPhase || isActing ? "opacity-30 cursor-not-allowed hover:bg-red-950/40" : ""}`}
                                >
                                    EMERGENCY ESCAPE (-1 HP)
                                </Button>
                            </div>
                        </div>

                        {/* INVENTORY OVERLAY */}{showInventory && (
                            <div className="absolute top-20 left-0 right-0 mx-auto w-64 bg-black/90 border border-yellow-500/50 p-4 rounded-xl backdrop-blur-xl z-50 shadow-2xl animate-in zoom-in-95">
                                <h3 className="text-yellow-500 text-xs font-bold uppercase tracking-widest mb-4 flex justify-between">
                                    <span>Supply Manifest</span>
                                    <span className="cursor-pointer hover:text-white" onClick={() => setShowInventory(false)}>X</span>
                                </h3>
                                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                    {inventory.length === 0 ? (
                                        <div className="text-gray-500 text-[10px] text-center py-4">NO SUPPLIES DETECTED</div>
                                    ) : (
                                        inventory.map((item: any, idx: number) => (
                                            <div key={idx} className="flex items-center justify-between bg-white/5 p-2 rounded border border-white/10">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-white">{item.name} <span className="text-[10px] text-gray-400">x{item.qty}</span></span>
                                                    <span className="text-[9px] text-gray-500">{item.description}</span>
                                                </div>
                                                <Button className="h-6 text-[9px] bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500 hover:text-black" onClick={() => handleUseItem(item.id)}>USE</Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Skip Turn (Remains Bottom) */}
                    <div className="mt-1">
                        <Button
                            onClick={() => lockAction("SCAN", [], true)}
                            disabled={isAirlock || !inActionPhase}
                            variant="ghost"
                            className={`text-red-500/50 hover:text-red-500 hover:bg-red-950/20 text-xs border border-transparent hover:border-red-900 ${isAirlock || !inActionPhase ? "opacity-30 cursor-not-allowed hover:bg-transparent" : ""}`}
                        >
                            EMERGENCY VENT (-1 HP / SKIP)
                        </Button>
                    </div>

                    {/* Event Log (Bottom Center) */}
                    <div className="glass-panel p-3 border border-white/10 bg-black/60 w-full max-w-lg shrink-0 max-h-40 overflow-y-auto custom-scrollbar">
                        <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">EVENT LOG</div>
                        <div className="space-y-1 text-[11px] text-gray-300">
                            {(game?.gameLog || []).slice().reverse().slice(0, 10).map((log: any, idx: number) => (
                                <div key={idx} className="border-b border-white/5 pb-1">
                                    <span className="text-[9px] text-gray-500 mr-2">{new Date(log.ts || Date.now()).toLocaleTimeString()}</span>
                                    <span className="text-neon-cyan font-bold mr-1">{log.type}</span>
                                    <span>{log.message}</span>
                                </div>
                            ))}
                            {(game?.gameLog || []).length === 0 && <div className="text-gray-600 text-xs">Awaiting signals...</div>}
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL: Hand & Protocol (Col Span 3) */}
                <div className="flex col-span-3 flex-col h-full min-h-0 relative pointer-events-none gap-2 items-end">

                    {/* Hand Interface (TOP - Primary Space, Grows) */}
                    <div className="pointer-events-auto flex-1 min-h-0 w-full max-w-[320px] flex flex-col pt-0 overflow-hidden">
                        {/* Hand Cards - NO OVERLAP, JUST SPACING */}
                        <div className="relative w-full flex-1 min-h-0 flex flex-col items-end gap-2 overflow-y-auto pr-1 pb-2 custom-scrollbar">
                            <AnimatePresence>
                        {gameState?.player?.hand?.length > 0 ? gameState.player.hand.map((card: any, index: number) => (
                            <motion.div
                                key={card.id || index}
                                layout
                                initial={{ x: 20, opacity: 0 }}
                                animate={{ opacity: 1, x: 0 }}
                                        exit={{ x: 20, opacity: 0 }}
                                        onClick={() => toggleCardSelection(index)}
                                        className={`
                                            relative cursor-pointer transition-all duration-200 origin-right
                                            ${selectedCardIndices.includes(index) ? 'translate-x-[0px] scale-105 z-10' : 'hover:translate-x-[-10px]'}
                                        `}
                                    >
                                        <NavCard card={card} selected={selectedCardIndices.includes(index)} size="sm" />
                                    </motion.div>
                                )) : (
                                    <div className="text-xs text-red-500 font-bold border border-red-900 bg-red-950/30 p-2 rounded">DECK DEPLETED
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>

                    </div>

                    {/* Mission Protocol (BOTTOM - Compact) */}
                    <div className="pointer-events-auto glass-panel p-3 border-l-4 border-neon-cyan backdrop-blur-xl animate-in slide-in-from-right duration-500 mb-0 shrink-0">
                        <div className="text-[10px] text-neon-cyan uppercase tracking-widest mb-1 flex items-center gap-2">
                            <span className="w-2 h-2 bg-neon-cyan rounded-full animate-pulse" />
                            CURRENT PHASE
                        </div>
                        <div className="text-xs md:text-sm font-bold text-white leading-tight">
                            {inActionPhase ? "ACTION: SELECT CARD + PROTOCOL" : "DRAW: PREPPING NEXT ROUND"}
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}

// Sub-component for Sci-Fi Card
function NavCard({ card, selected, size = "md" }: { card: any, selected?: boolean, size?: "md" | "sm" }) {
    const isSm = size === "sm";

    // Mothership / Sci-Fi Theme Mapping
    const suitThemes: any = {
        "BIOTECH": { color: "text-red-500 border-red-500/50 shadow-red-500/20", icon: "BIO", label: "BIOTECH" },
        "PLASMA": { color: "text-orange-400 border-orange-400/50 shadow-orange-400/20", icon: "PLS", label: "PLASMA" },
        "COMMAND": { color: "text-green-400 border-green-400/50 shadow-green-400/20", icon: "CMD", label: "COMMAND" },
        "VOID": { color: "text-purple-400 border-purple-400/50 shadow-purple-400/20", icon: "VOID", label: "VOID" },
        "ANOMALY": { color: "text-white border-white/50 shadow-white/20", icon: "ANOM", label: "ANOMALY" }
    };

    const theme = suitThemes[card.suit] || { color: "text-gray-400 border-gray-400/50", icon: "?", label: "UNKNOWN" }; // Fallback
    const bgColor = selected ? "bg-slate-900" : "bg-black/90";

    return (
        <div className={`
            relative rounded-r-xl border-l-4 flex items-center justify-between overflow-hidden transition-all px-4
            ${theme.color} ${bgColor}
            ${selected ? "shadow-[0_0_20px_currentColor] border-white translate-x-4 animate-pulse" : "hover:border-white/60 hover:translate-x-2"}
            ${isSm ? "w-48 h-12 text-sm" : "w-64 h-16"}
        `}>
            {/* Holographic Scanline Overlay */}
            <div className="absolute inset-0 bg-[url('/scanlines.png')] opacity-10 pointer-events-none" />

            {/* Rank & Icon */}
            <div className={`font-black text-center ${isSm ? "text-lg w-6" : "text-2xl w-8"}`}>{card.rank}</div>

            {/* Label */}
            <div className="flex-1 text-right">
                <div className="text-[10px] tracking-[0.2em] opacity-50">{theme.label}</div>
                <div className={`${isSm ? "text-lg" : "text-xl"} font-bold`}>{theme.icon}</div>
            </div>
        </div>
    );
}
