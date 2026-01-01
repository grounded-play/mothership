"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Zap, Crosshair, User, Heart, AlertTriangle, Cpu } from "lucide-react";
import SectorGrid from "@/components/game/SectorGrid";
import RoomScanner from "@/components/game/RoomScanner";
import MissionLog from "@/components/game/MissionLog";
import { useToast } from "@/components/ui/Toast";

export default function GameInterface() {
    const params = useParams();
    const router = useRouter();
    const [gameState, setGameState] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
    const [isActing, setIsActing] = useState(false);
    const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [showInventory, setShowInventory] = useState(false);
    const [actionIntent, setActionIntent] = useState<"MOVE" | "SEARCH" | "FIGHT" | "SECURE" | null>(null);
    const [moveDirection, setMoveDirection] = useState<string | null>(null);
    const { addToast } = useToast();
    const lastPileSizeRef = useRef(0);
    const { game, player } = gameState ?? { game: null, player: null };
    const inventory = useMemo(() => {
        try { return player?.inventory ? JSON.parse(player.inventory) : []; } catch { return []; }
    }, [player?.inventory]);

    // Fetch Game State
    useEffect(() => {
        const fetchGameState = async () => {
            try {
                const res = await fetch(`/api/game/state?gameId=${params.id}`);
                const data = await res.json();

                if (data.error) {
                    if (res.status === 410 || data.error.includes("Corrupted")) {
                        alert(data.error);
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

    // Timer Logic
    useEffect(() => {
        if (!gameState?.game?.deadline) {
            setTimeLeft(0);
            return;
        }
        const updateTimer = () => {
            const now = Date.now();
            const end = new Date(gameState.game.deadline).getTime();
            const diff = Math.max(0, Math.floor((end - now) / 1000));
            setTimeLeft(diff);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [gameState?.game?.deadline]);

    // AI Move Detector - REMOVED (Handled by Server Response)
    useEffect(() => {
        if (!gameState?.game?.currentPile) return;
        lastPileSizeRef.current = gameState.game.currentPile.length;
    }, [gameState?.game?.currentPile]);

    const toggleCardSelection = (idx: number) => {
        if (selectedCardIndices.includes(idx)) {
            setSelectedCardIndices(prev => prev.filter(i => i !== idx));
        } else {
            setSelectedCardIndices(prev => [...prev, idx]);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-neon-cyan">Loading Game Protocol...</div>;
    if (!gameState) return <div className="min-h-screen flex items-center justify-center text-red-500">Game Not Found</div>;

    const inActionPhase = game?.roundPhase === "ACTION";
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
    const handleExecute = () => lockAction();

    // Legacy handleMove replacement (for minimal diff impact if stuck)
    const handleMove = async () => { };


    // Format Timer
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
        <div className="min-h-screen bg-black text-white relative overflow-hidden font-mono flex flex-col">
            {/* Background Ambiance */}
            <div className="absolute inset-0 bg-[url('/bg-space.jpg')] bg-cover opacity-50 z-0" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 z-0" />

            {/* Header: Player Stats, Timer, Abort */}
            <header className="relative z-30 p-2 lg:p-4 flex justify-between items-start h-20 shrink-0 border-b border-white/10 bg-black/40 backdrop-blur-sm">
                {/* Player Status */}
                {player && (
                    <div className="flex gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-800 rounded-full overflow-hidden border-2 border-neon-cyan shadow-[0_0_10px_#0ff]">
                                {player.character?.portrait && <img src={player.character.portrait} className="w-full h-full object-cover" />}
                            </div>
                            <div>
                                <div className="text-sm lg:text-lg font-bold text-neon-cyan uppercase tracking-widest leading-none mb-1">{player.character.name}</div>
                                <div className="flex gap-3 text-[10px] lg:text-xs text-gray-400 font-bold">
                                    <span className="flex items-center text-red-400"><Heart className="w-3 h-3 mr-1" /> {player.hp}/{player.maxHp} HP</span>
                                    <span className="flex items-center text-yellow-400"><Zap className="w-3 h-3 mr-1" /> {player.ap} AP</span>
                                    <span className="flex items-center text-blue-400"><Shield className="w-3 h-3 mr-1" /> {player.character.credits} CR</span>
                                </div>
                            </div>
                        </div>

                        {/* Mission Timer */}
                        <div className="hidden md:flex flex-col justify-center items-center px-4 border-l border-white/10">
                            <div className="text-[9px] text-gray-500 uppercase tracking-widest">T-MINUS</div>
                            <div className={`text-xl font-bold font-mono ${timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                                {minutes}:{seconds.toString().padStart(2, '0')}
                            </div>
                            <div className="mt-1 text-[10px] text-neon-cyan font-bold">AP POOL {game?.sharedAp ?? 0}/{game?.sharedApMax ?? 0}</div>
                        </div>
                    </div>
                )}

                {/* Abort/Depart Button */}
                {player?.MapNode?.type === "START" ? (
                    <Button variant="primary" className="bg-green-500/10 text-green-500 border border-green-500 hover:bg-green-500 hover:text-black h-8 text-xs px-4" onClick={() => {
                        if (confirm("DEPART SECTOR? (Mission Complete)")) {
                            // Treat as Quit but maybe different API param for Success?
                            // For now using quit, assumes 'Extraction' if alive.
                            fetch('/api/game/quit', { method: 'POST', body: JSON.stringify({ gameId: params.id, reason: "DEPART" }) })
                                .then(() => router.push(`/game/${params.id}/summary`));
                        }
                    }}>
                        DEPART
                    </Button>
                ) : (
                    <Button variant="outline" className="border-red-500/50 text-red-500 hover:bg-red-950/50 h-8 text-xs px-2" onClick={() => {
                        if (confirm("ABORT MISSION?")) {
                            fetch('/api/game/quit', { method: 'POST', body: JSON.stringify({ gameId: params.id }) })
                                .then(() => router.push(`/game/${params.id}/summary`));
                        }
                    }}>
                        ABORT
                    </Button>
                )}
            </header>

            {/* Main Grid Layout */}
            <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 p-4 z-20 relative overflow-hidden">

                {/* LEFT PANEL: Map & Info (Col Span 3) - Mobile Order 3 */}
                <div className="flex order-3 md:order-none col-span-1 md:col-span-3 flex-col gap-4 h-full relative">

                    {/* Mission Log (Top - Fixed Height) */}
                    <div className="glass-panel p-3 border border-white/10 h-48 shrink-0 overflow-y-auto [&::-webkit-scrollbar]:hidden">
                        <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">MISSION OBJECTIVES</div>
                        <MissionLog objectives={game.objectives || []} />
                    </div>

                    {/* Map (Middle - Flex Grow / Main Focus) */}
                    {player?.MapNode && (
                        <div className="glass-panel p-3 border border-white/20 flex-1 flex flex-col animate-in slide-in-from-left duration-500 shadow-lg min-h-[300px]">
                            <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 text-right border-b border-white/5 pb-1">SECTOR MAP</div>
                            <div className="w-full flex-1 bg-black/50 border border-white/5 relative overflow-hidden rounded">
                                <SectorGrid nodes={game.MapNode || []} currentPlayerNodeId={player.nodeId} />
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
                                        {isActive && <span className="animate-pulse text-[9px]">◀ ACTIVE</span>}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* CENTER PANEL: HUD & Controls (Col Span 6) - Mobile Order 1 */}
                <div className="order-1 md:order-none col-span-1 md:col-span-6 flex flex-col items-center justify-start pt-4 md:pt-10 h-full relative">

                    {/* Pile / Combat Stack (Enhanced) */}
                    <div className="min-h-[140px] mb-6 flex flex-col justify-center items-center w-full">
                        {game.currentPile && game.currentPile.length > 0 ? (
                            <div className="flex flex-col items-center animate-in zoom-in duration-300">
                                <div className="mb-4 z-20 text-[9px] font-bold bg-black px-3 py-1 rounded-full border border-neon-cyan text-neon-cyan shadow-[0_0_10px_rgba(0,255,255,0.3)]">ACTIVE SIGNAL</div>
                                <div className="relative w-[120px] h-[160px] flex items-center justify-center">
                                    {game.currentPile.map((card: any, i: number) => {
                                        const offset = (i * 4); // Minimal offset for stack
                                        // "Stretching out" usually means clearly visible sequence.
                                        // Making it a tight stack:
                                        return (
                                            <div key={i} className="absolute transition-transform hover:-translate-y-8 hover:z-30 shadow-xl"
                                                style={{
                                                    zIndex: i,
                                                    top: `${-i * 2}px`,
                                                    left: `${i * 2}px`,
                                                    transform: `rotate(${i % 2 === 0 ? 1 : -1}deg)`
                                                }}>
                                                <NavCard card={card} selected={false} size="md" />
                                            </div>
                                        )
                                    })}
                                </div>
                                <div className="text-[10px] mt-4 font-mono bg-black/50 px-3 py-1 rounded flex items-center gap-2 border border-white/10">
                                    <span className="text-gray-500">SOURCE:</span>
                                    <span className={pileOwnerIsMe ? "text-neon-cyan font-bold" : "text-white font-bold"}>
                                        {pileOwnerIsMe ? "YOU" : "HOSTILE/ALLY"}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-gray-600 border border-dashed border-gray-800 p-8 rounded-xl flex items-center justify-center flex-col gap-2">
                                <span className="w-2 h-2 rounded-full bg-gray-800 animate-pulse" />
                                NO SIGNAL
                                <span className="text-[9px] opacity-50">PLAY CARD TO CAPTURE SECTOR</span>
                            </div>
                        )}
                    </div>

                    {/* Navigation HUD */}
                    <div className="glass-panel p-4 md:p-6 border border-white/20 text-center animate-fade-in relative overflow-hidden w-full max-w-lg mb-4 bg-black/40 backdrop-blur-md shadow-2xl">
                        {/* Scanner */}
                        <div className="mb-4 flex justify-center">
                            <div className="w-[180px] h-[120px] md:w-[240px] md:h-[160px] border border-gray-800 rounded bg-black relative shadow-inner">
                                <RoomScanner type={player.MapNode.type} isExplored={player.MapNode.isExplored} integrity={game.integrity} />
                            </div>
                        </div>

                        {/* Status Text */}
                        <div className="text-[10px] md:text-xs text-neon-cyan uppercase tracking-widest mb-4 flex justify-between border-b border-white/10 pb-2">
                            <span>Sys: {inActionPhase ? "ONLINE" : "LOCKED"}</span>
                            {game.roundPhase === "REACTION" && <span className="text-red-500 animate-pulse font-bold">HOSTILES ENGAGED</span>}
                        </div>

                        {/* Controls (Unified Command) */}
                        <div className="flex flex-col items-center gap-4 mt-2">
                            {/* Directional Pad */}
                            <div className={`grid grid-cols-3 gap-2 p-4 bg-black/60 rounded-full border border-white/10 relative transition-opacity duration-300 ${actionIntent === 'MOVE' ? 'opacity-100 ring-2 ring-neon-cyan' : 'opacity-60'}`}>
                                <div />
                                <Button
                                    onClick={() => { setActionIntent("MOVE"); setMoveDirection("FORWARD"); }}
                                    disabled={!inActionPhase}
                                    className={`h-12 w-12 rounded-t-xl ${moveDirection === "FORWARD" && actionIntent === "MOVE" ? "bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,255,255,0.5)]" : "bg-black border border-white/20 text-neon-cyan hover:bg-white/10"}`}
                                >▲</Button>
                                <div />

                                <Button
                                    onClick={() => { setActionIntent("MOVE"); setMoveDirection("LEFT"); }}
                                    disabled={!inActionPhase}
                                    className={`h-12 w-12 rounded-l-xl ${moveDirection === "LEFT" && actionIntent === "MOVE" ? "bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,255,255,0.5)]" : "bg-black border border-white/20 text-neon-cyan hover:bg-white/10"}`}
                                >◀</Button>
                                <div className="h-12 w-12 flex items-center justify-center bg-black/80 rounded-full border border-white/5">
                                    <div className={`w-2 h-2 rounded-full ${actionIntent === "MOVE" ? "bg-neon-cyan animate-ping" : "bg-gray-800"}`} />
                                </div>
                                <Button
                                    onClick={() => { setActionIntent("MOVE"); setMoveDirection("RIGHT"); }}
                                    disabled={!inActionPhase}
                                    className={`h-12 w-12 rounded-r-xl ${moveDirection === "RIGHT" && actionIntent === "MOVE" ? "bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,255,255,0.5)]" : "bg-black border border-white/20 text-neon-cyan hover:bg-white/10"}`}
                                >▶</Button>

                                <div />
                                <Button
                                    onClick={() => { setActionIntent("MOVE"); setMoveDirection("BACK"); }}
                                    disabled={!inActionPhase}
                                    className={`h-12 w-12 rounded-b-xl ${moveDirection === "BACK" && actionIntent === "MOVE" ? "bg-neon-cyan text-black shadow-[0_0_15px_rgba(0,255,255,0.5)]" : "bg-black border border-white/20 text-neon-cyan hover:bg-white/10"}`}
                                >▼</Button>
                                <div />
                            </div>

                            {/* Extra Actions Selection */}
                            <div className="flex gap-4">
                                <Button
                                    onClick={() => { setActionIntent("SEARCH"); setMoveDirection(null); }}
                                    disabled={!inActionPhase}
                                    className={`w-28 h-10 text-xs font-bold tracking-widest border transition-all ${actionIntent === "SEARCH" ? "bg-green-500 text-black border-green-500 shadow-[0_0_15px_rgba(0,255,0,0.3)]" : "bg-black/50 text-green-500 border-green-900 hover:bg-green-900/30"}`}
                                >
                                    SCAN
                                </Button>
                                <Button
                                    onClick={() => { setActionIntent("FIGHT"); setMoveDirection(null); }}
                                    className={`w-28 h-10 text-xs font-bold tracking-widest border transition-all ${actionIntent === "FIGHT" ? "bg-red-500 text-black border-red-500 shadow-[0_0_15px_rgba(255,0,0,0.3)]" : "bg-black/50 text-red-500 border-red-900 hover:bg-red-900/30"}`}
                                >
                                    ENGAGE
                                </Button>
                                <Button
                                    onClick={() => setShowInventory(!showInventory)}
                                    className={`w-28 h-10 text-xs font-bold tracking-widest border transition-all ${showInventory ? "bg-yellow-500 text-black border-yellow-500" : "bg-black/50 text-yellow-500 border-yellow-900 hover:bg-yellow-900/30"}`}
                                >
                                    SUPPLIES
                                </Button>
                            </div>
                        </div>

                        {/* INVENTORY OVERLAY */}{showInventory && (
                            <div className="absolute top-20 left-0 right-0 mx-auto w-64 bg-black/90 border border-yellow-500/50 p-4 rounded-xl backdrop-blur-xl z-50 shadow-2xl animate-in zoom-in-95">
                                <h3 className="text-yellow-500 text-xs font-bold uppercase tracking-widest mb-4 flex justify-between">
                                    <span>Supply Manifest</span>
                                    <span className="cursor-pointer hover:text-white" onClick={() => setShowInventory(false)}>✕</span>
                                </h3>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
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
                    <div className="mt-2">
                        <Button onClick={() => lockAction("SCAN", [], true)} variant="ghost" className="text-red-500/50 hover:text-red-500 hover:bg-red-950/20 text-xs border border-transparent hover:border-red-900">
                            EMERGENCY VENT (-1 HP / SKIP)
                        </Button>
                    </div>

                    {/* Orientation & Compass (Moved Below) */}
                    <div className="mt-4 flex flex-col items-center gap-2">
                        <div className="w-16 h-16 rounded-full border border-gray-800 bg-black/50 flex items-center justify-center relative shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                            {/* Compass Arrow */}
                            <div className="absolute inset-0 flex items-center justify-center transition-transform duration-500"
                                style={{
                                    transform: `rotate(${player?.facing === "EAST" ? 90 :
                                        player?.facing === "SOUTH" ? 180 :
                                            player?.facing === "WEST" ? 270 : 0
                                        }deg)`
                                }}>
                                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[20px] border-b-neon-cyan drop-shadow-[0_0_5px_rgba(0,255,255,0.8)]" />
                            </div>
                            {/* N Label */}
                            <span className="absolute top-1 text-[8px] text-gray-600 font-bold">N</span>
                        </div>
                        <div className="text-[10px] font-mono text-gray-500">
                            ORT: <span className="text-neon-cyan font-bold">{player?.facing || "NORTH"}</span>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL: Hand & Protocol (Col Span 3) - Mobile Order 2 */}
                <div className="flex order-2 md:order-none col-span-1 md:col-span-3 flex-col h-full relative pointer-events-none gap-4">

                    {/* Hand Interface (TOP - Primary Space, Grows) */}
                    <div className="pointer-events-auto flex-1 w-full max-w-[320px] flex flex-col pt-4 overflow-hidden">
                        {/* Hand Cards - NO OVERLAP, JUST SPACING */}
                        <div className="relative w-full flex-1 flex flex-col items-end gap-2 overflow-y-auto pr-2 pb-20 [&::-webkit-scrollbar]:hidden">
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
                                    <div className="text-xs text-red-500 font-bold border border-red-900 bg-red-950/30 p-2 rounded">
                                        ⚠ DECK DEPLETED
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Confirm/Action Button */}
                        <div className="mt-4 mb-2 flex flex-col gap-2 justify-end pr-4 shrink-0">
                            <Button
                                onClick={handleExecute}
                                    disabled={(!actionIntent || (actionIntent === "MOVE" && !moveDirection) || selectedCardIndices.length === 0) || isActing || !inActionPhase}
                                    className={`w-64 py-4 text-xs font-bold tracking-widest transition-all duration-300 rounded-xl border-2
                                                {(actionIntent && selectedCardIndices.length > 0 && inActionPhase)
                                        ? 'bg-neon-cyan text-black border-neon-cyan shadow-[0_0_20px_#0ff] hover:bg-white hover:scale-105'
                                        : 'bg-black/50 text-gray-600 border-gray-800'}
                                            `}
                            >
                                {!inActionPhase ? 'WAITING FOR DRAW' :
                                    !actionIntent ? 'SELECT PROTOCOL' :
                                        selectedCardIndices.length === 0 ? 'SELECT CARD' :
                                            `LOCK ${actionIntent}`}
                            </Button>
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

            </main >
        </div >
    );
}

// Sub-component for Sci-Fi Card
function NavCard({ card, selected, size = "md" }: { card: any, selected?: boolean, size?: "md" | "sm" }) {
    const isSm = size === "sm";

    // Mothership / Sci-Fi Theme Mapping
    const suitThemes: any = {
        "BIOTECH": { color: "text-red-500 border-red-500/50 shadow-red-500/20", icon: "✚", label: "BIOTECH" },
        "PLASMA": { color: "text-orange-400 border-orange-400/50 shadow-orange-400/20", icon: "⚡", label: "PLASMA" },
        "COMMAND": { color: "text-green-400 border-green-400/50 shadow-green-400/20", icon: "☗", label: "COMMAND" },
        "VOID": { color: "text-purple-400 border-purple-400/50 shadow-purple-400/20", icon: "🌀", label: "VOID" },
        "ANOMALY": { color: "text-white border-white/50 shadow-white/20", icon: "☠", label: "ANOMALY" }
    };

    const theme = suitThemes[card.suit] || { color: "text-gray-400 border-gray-400/50", icon: "?", label: "UNKNOWN" }; // Fallback
    const bgColor = selected ? "bg-slate-900" : "bg-black/90";

    return (
        <div className={`
            relative rounded-r-xl border-l-4 flex items-center justify-between overflow-hidden transition-all px-4
            ${theme.color} ${bgColor}
            ${selected ? "shadow-[0_0_20px_currentColor] border-white translate-x-4" : "hover:border-white/60 hover:translate-x-2"}
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
