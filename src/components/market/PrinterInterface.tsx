"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/Button";
import SafeImage from "@/components/ui/SafeImage";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { Loader2, Coins, Image as ImageIcon, Zap, ChevronUp, Wrench, User, Crosshair, Microscope, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import PortraitFallback from "@/components/game/PortraitFallback";


type QueueEntry = {
    id: string;
    kind: "ITEM" | "CHARACTER";
    title: string;
    owner: string;
    imageStatus?: string | null;
    icon?: string | null;
    preview?: string | null;
    hasImage?: boolean;
    createdAt?: string | Date;
    updatedAt?: string | Date;
};

type PrinterProps = { credits: number; inventory: any[]; globalQueue: any[]; backpackLevel: number; recentMade?: any[] };

export default function PrinterInterface({ credits, inventory, globalQueue, backpackLevel: initialBackpackLevel, recentMade = [] }: PrinterProps) {

    const [spinning, setSpinning] = useState(false);
    const [printerOnline, setPrinterOnline] = useState(true);
    const [reward, setReward] = useState<{ name: string; rarity: string; icon?: string } | null>(null);
    const [pendingRarity, setPendingRarity] = useState<string | null>(null);
    const [creditsDisplay, setCreditsDisplay] = useState(credits);
    const [backpackLevel, setBackpackLevel] = useState(initialBackpackLevel);
    const [upgradePending, setUpgradePending] = useState(false);
    const [repairingId, setRepairingId] = useState<string | null>(null);
    const [queueHold, setQueueHold] = useState(false);
    const [recentIndex, setRecentIndex] = useState(0);

    // System Status Tracking
    const [comfyStatus, setComfyStatus] = useState<'online' | 'offline' | 'checking'>('checking');
    const [workerStatus, setWorkerStatus] = useState<'active' | 'idle' | 'offline'>('idle');
    const [queueStatus, setQueueStatus] = useState<'active' | 'empty'>('empty');

    // Queue State - Removed (Handled by Background Worker)
    // const [generationQueue, setGenerationQueue] = useState<any[]>([]);
    // const [isProcessing, setIsProcessing] = useState(false);

    // Slot Machine State
    const [rollStrip, setRollStrip] = useState<string[]>([]);
    const controls = useAnimation();
    const STRIP_LENGTH = 50;
    const WIN_INDEX = 40;
    const BOX_SIZE = 96; // w-24 = 6rem = 96px
    const GAP = 16;      // gap-4 = 1rem = 16px




    const router = useRouter();
    const { addToast } = useToast();

    useEffect(() => {
        setCreditsDisplay(credits);
    }, [credits]);

    useEffect(() => {
        setBackpackLevel(initialBackpackLevel);
    }, [initialBackpackLevel]);

    useEffect(() => {
        setRecentIndex(0);
    }, [recentMade]);

    useEffect(() => {
        let cancelled = false;
        const checkStatus = async () => {
            try {
                const res = await fetch("/api/printer/status", { cache: "no-store" });
                const data = await res.json().catch(() => ({}));
                if (!cancelled) setPrinterOnline(Boolean(res.ok && data?.ok));
            } catch {
                if (!cancelled) setPrinterOnline(false);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 15000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    const backpackCapacity = backpackLevel === 2 ? 6 : backpackLevel === 3 ? 8 : 4;
    const upgradeCost = backpackLevel === 1 ? 2000 : backpackLevel === 2 ? 5000 : null;
    const scrapStack = useMemo(() => inventory.find((inv) => inv.item?.name === "Scrap Metal"), [inventory]);
    const scrapCount = scrapStack?.quantity ?? 0;
    const repairableItems = useMemo(() => inventory.filter((inv) => {
        const maxUses = inv.usesMax ?? inv.item?.maxUses ?? null;
        if (!maxUses) return false;
        const remaining = inv.usesRemaining ?? maxUses;
        return remaining < maxUses;
    }), [inventory]);

    const queueEntries = useMemo(() => {
        const toStatus = (entry: QueueEntry) => {
            const raw = entry.imageStatus || "QUEUED";
            const hasImage = entry.hasImage ?? Boolean(entry.preview);
            if (!hasImage && (raw === "READY" || raw === "DONE")) return "QUEUED";
            return raw || "QUEUED";
        };
        const toProgress = (status: string) => {
            const match = status.match(/(\d+)%/);
            return match ? Number(match[1]) : 0;
        };
        return (globalQueue || []).map((entry) => {
            const status = toStatus(entry);
            return {
                ...entry,
                status,
                hasImage: entry.hasImage ?? Boolean(entry.preview),
                progress: status.startsWith("GENERATING") ? toProgress(status) : 0
            };
        });
    }, [globalQueue]);

    // Generate specific queues if needed later, but we will mostly rely on globalQueue directly
    // const portraitQueue = useMemo(() => queueEntries.filter(entry => entry.queueType === "CHARACTER"), [queueEntries]);
    // const itemQueue = useMemo(() => queueEntries.filter(entry => entry.queueType === "ITEM"), [queueEntries]);

    // Sync Local Queue with Global State & Auto-Refresh
    useEffect(() => {
        if (spinning) return;
        const hasActiveQueue = queueEntries.some((entry: any) =>
            entry.status?.startsWith("GENERATING") ||
            entry.status === "QUEUED" ||
            entry.status === "FAILED" ||
            entry.status === "ERROR"
        );
        if (!hasActiveQueue) return;

        const hasGenerating = queueEntries.some((entry: any) => entry.status?.startsWith("GENERATING"));

        // Auto-Refresh (Keep Data Fresh)
        const interval = setInterval(() => {
            if (!queueHold) {
                router.refresh();
            }
        }, hasGenerating ? 3000 : 10000); // Poll slower if just queued

        return () => clearInterval(interval);
    }, [router, queueHold, spinning, queueEntries]); // Added queueEntries dep

    // REMOVED: Processing Effect (Handled by Server Worker)


    const spinCost = 100;

    const handleSpin = async () => {
        if (creditsDisplay < spinCost) {
            addToast("Insufficient Credits", "error");
            return;
        }

        setQueueHold(true);
        setSpinning(true);
        setReward(null);
        setPendingRarity(null);

        // 1. Generate Random Strip
        const rarities = ["Common", "Common", "Common", "Uncommon", "Uncommon", "Rare", "Rare", "Epic"];
        const strip = Array.from({ length: STRIP_LENGTH }, () => rarities[Math.floor(Math.random() * rarities.length)]);
        setRollStrip(strip);

        // Reset Animation Position
        await controls.set({ x: 0 });

        try {
            // 2. Start Request
            // Start spinning slowly to indicate working?
            // Actually, we can start the main spin immediately if we assume minimal latency,
            // or just hang at the start for a split second. Let's fire request.
            const reqPromise = fetch('/api/gamba', { method: 'POST' });

            // 3. Start Animation (Accelerate)
            // We animate to a "holding pattern" or just go for it?
            // Let's assume request is fast (<1s).
            // We want the total animation to take ~4s.

            const res = await reqPromise;
            const data = await res.json();

            if (data.success && data.reward) {
                // 4. Fix Winner in Strip
                const winnerRarity = data.reward.rarity;
                const finalStrip = [...strip];
                finalStrip[WIN_INDEX] = winnerRarity;
                setRollStrip(finalStrip);

                // 5. Animate to Winner
                // Calculate target X using Responsive Center Alignment:
                // We want the CENTER of the winning item to be at 50% of the container.
                // Item Start X = WIN_INDEX * (BOX_SIZE + GAP)
                // Item Center X = Item Start X + (BOX_SIZE / 2)
                // Container Center = 50%
                // Target Translate X = 50% - Item Center X

                const itemPos = WIN_INDEX * (BOX_SIZE + GAP);
                const itemCenterV = itemPos + (BOX_SIZE / 2);

                // Using string value for calc() in Framer Motion
                // Initial position is padded to 50%, so simple subtraction aligns item center to 50%
                const targetX = `-${itemCenterV}px`;

                addToast("Starting Fabrication Sequence...", "info");

                await controls.start({
                    x: targetX,
                    transition: { duration: 4, ease: [0.1, 0.9, 0.2, 1.0] } // Custom Bezier for "Slot feel"
                });

                setPendingRarity(winnerRarity);
                await new Promise((resolve) => setTimeout(resolve, 150));

                // 6. Show Result
                if (data.rewardInstance) {
                    handleGenerateArt(data.rewardInstance);
                }

                setReward(data.reward);
                setCreditsDisplay(data.credits);
                setSpinning(false);
                setTimeout(() => setQueueHold(false), 400);
                router.refresh();
                addToast(`Fabrication Complete: ${data.reward.name} `, "success");

                if (data.rewardInstance) {
                    setTimeout(() => {
                        handleGenerateArt();
                    }, 600);
                }
            } else {
                addToast(data.error || "Fabrication Failed", "error");
                setSpinning(false);
                setTimeout(() => setQueueHold(false), 400);
            }
        } catch (e) {
            console.error(e);
            setSpinning(false);
            setTimeout(() => setQueueHold(false), 400);
            addToast("Connection Error", "error");
        }
    };

    const handleGenerateArt = async (instance?: any) => {
        addToast("Queued for Fabrication", "info");
        router.refresh();
    };

    const handleUpgradeBackpack = async () => {
        if (!upgradeCost || upgradePending) return;
        setUpgradePending(true);
        try {
            const res = await fetch('/api/market/upgrade-backpack', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setBackpackLevel(data.backpackLevel);
                setCreditsDisplay(data.credits);
                addToast("Backpack upgraded", "success");
                router.refresh();
            } else {
                addToast(data.error || "Upgrade failed", "error");
            }
        } catch (e) {
            console.error(e);
            addToast("Upgrade failed", "error");
        } finally {
            setUpgradePending(false);
        }
    };

    const handleRepairItem = async (inventoryItemId: string) => {
        if (repairingId) return;
        setRepairingId(inventoryItemId);
        try {
            const res = await fetch('/api/market/repair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inventoryItemId })
            });
            const data = await res.json();
            if (data.success) {
                addToast("Item repaired", "success");
                router.refresh();
            } else {
                addToast(data.error || "Repair failed", "error");
            }
        } catch (e) {
            console.error(e);
            addToast("Repair failed", "error");
        } finally {
            setRepairingId(null);
        }
    };

    const activeQueueIndex = useMemo(() => {
        if (!globalQueue || globalQueue.length === 0) return -1;
        const generatingIndex = globalQueue.findIndex((item: any) => item.imageStatus?.startsWith("GENERATING") || item.status?.startsWith("GENERATING"));
        return generatingIndex !== -1 ? generatingIndex : 0;
    }, [globalQueue]);

    const activeItem = useMemo(() => activeQueueIndex !== -1 ? globalQueue[activeQueueIndex] : null, [globalQueue, activeQueueIndex]);
    const queuedItemsList = useMemo(() => globalQueue.filter((_, idx) => idx !== activeQueueIndex), [globalQueue, activeQueueIndex]);

    return (
        <div className="w-full max-w-6xl mx-auto p-4 pt-24">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-8">
                <div className="space-y-8">
                    {/* MAIN PRINTER (GAMBA) */}
                    <div className="glass-panel p-8 rounded-3xl border-2 border-neon-cyan/50 shadow-[0_0_50px_rgba(0,243,255,0.2)] text-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-neon-cyan/5 animate-pulse z-0" />

                        <div className="relative z-10">
                            <div className="mb-8">
                                <h1 className="text-4xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-white">
                                    MATTER FABRICATOR
                                </h1>
                                <p className="text-neon-cyan/80 text-xs tracking-[0.3em] font-bold">CREATE SOMETHING FROM NOTHING</p>
                            </div>

                            <div className="h-48 bg-black/40 rounded-xl mb-8 border border-white/10 relative overflow-hidden">
                                {/* Center Line Marker (Only visible when spinning to avoid obscuring reward) */}
                                {spinning && (
                                    (() => {
                                        const color = pendingRarity === 'Legendary' ? 'bg-orange-500 text-orange-500' :
                                            pendingRarity === 'Epic' ? 'bg-purple-500 text-purple-500' :
                                                pendingRarity === 'Rare' ? 'bg-blue-500 text-blue-500' :
                                                    pendingRarity === 'Uncommon' ? 'bg-green-500 text-green-500' :
                                                        pendingRarity === 'Common' ? 'bg-slate-500 text-slate-500' :
                                                            'bg-neon-cyan/50 text-neon-cyan';
                                        const shadow = pendingRarity ? `shadow - [0_0_15px_currentColor]` : 'shadow-[0_0_10px_#0ff]';

                                        return (
                                            <>
                                                <div className={`absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 z-20 ${color.split(' ')[0]} ${shadow}`} />
                                                <div className={`absolute top-2 left-1/2 -translate-x-1/2 z-20 ${color.split(' ')[1]}`}><ChevronUp className="rotate-180" /></div>
                                                <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 z-20 ${color.split(' ')[1]}`}><ChevronUp /></div>
                                            </>
                                        );
                                    })()
                                )}

                                <AnimatePresence mode="wait">
                                    {spinning ? (
                                        <div className="h-full flex items-center">
                                            <motion.div
                                                className="flex gap-4 px-[50%]"
                                                animate={controls}
                                                initial={{ x: 0 }}
                                            >
                                                {rollStrip.map((rarity, i) => (
                                                    <div
                                                        key={i}
                                                        className={`
                                                            flex-shrink-0 w-24 h-24 rounded-lg border-2 flex items-center justify-center shadow-lg
                                                            ${rarity === 'Common' ? 'bg-slate-800 border-slate-600' : ''}
                                                            ${rarity === 'Uncommon' ? 'bg-green-900/80 border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : ''}
                                                            ${rarity === 'Rare' ? 'bg-blue-900/80 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]' : ''}
                                                            ${rarity === 'Epic' ? 'bg-purple-900/80 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.5)]' : ''}
                                                            ${rarity === 'Legendary' ? 'bg-orange-600 border-orange-400 shadow-[0_0_30px_rgba(251,146,60,0.6)]' : ''}
                                                        `}
                                                    >
                                                        <div className="text-[10px] uppercase font-bold tracking-wider text-white/50">{rarity}</div>
                                                    </div>
                                                ))}
                                            </motion.div>
                                        </div>
                                    ) : reward ? (
                                        <motion.div
                                            key="reward"
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className="flex flex-col items-center justify-center h-full gap-2 relative bg-gradient-to-t from-neon-cyan/10 to-transparent"
                                        >
                                            <div className="text-3xl font-black text-white drop-shadow-[0_0_10px_rgba(0,255,255,0.8)]">
                                                {reward.name}
                                            </div>
                                            <div className={`text-sm font-bold px-3 py-1 rounded-full border ${reward.rarity === 'Legendary' ? 'border-orange-500 text-orange-400 bg-orange-900/20' :
                                                reward.rarity === 'Epic' ? 'border-purple-500 text-purple-400 bg-purple-900/20' :
                                                    'border-white/20 text-gray-400'
                                                }`}>
                                                {reward.rarity.toUpperCase()} REWARD
                                            </div>
                                            <div className="text-[10px] text-neon-cyan/70 mt-2">SENT TO VISUALIZER</div>
                                        </motion.div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-600 font-mono text-sm">
                                            <Zap className="w-8 h-8 mb-2 opacity-20" />
                                            <span>INSERT CREDITS TO FABRICATE</span>
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="flex justify-center">
                                {!printerOnline && (
                                    <div className="mb-4 px-4 py-2 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm font-semibold">
                                        ⚠️ ComfyUI is offline. Visualizer unavailable.
                                    </div>
                                )}
                                <Button
                                    onClick={handleSpin}
                                    disabled={spinning || creditsDisplay < spinCost || !printerOnline}
                                    variant="primary"
                                    className="h-16 px-12 text-xl font-bold rounded-full transition-all shadow-[0_0_20px_rgba(0,243,255,0.3)] disabled:opacity-50"
                                >
                                    {spinning ? "FABRICATING..." : (
                                        <span className="flex items-center gap-2">
                                            <Coins className="w-6 h-6" /> FABRICATE ({spinCost} CR)
                                        </span>
                                    )}
                                </Button>
                            </div>

                            <div className="mt-4 text-xs text-neon-cyan/50">
                                CREDITS REMAINING: {creditsDisplay}
                            </div>
                        </div>
                    </div>

                    {/* REPAIR + UPGRADE */}
                    <div className="glass-panel p-8 border border-white/10">
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                        <Wrench className="w-5 h-5 text-neon-cyan" /> REPAIR + UPGRADE
                                    </h2>
                                    <div className="text-xs text-neon-cyan/70 mt-1">Backpack LV {backpackLevel} - {backpackCapacity} slots</div>
                                    <div className="text-xs text-gray-400 mt-1">Scrap Metal: {scrapCount}</div>
                                </div>
                                <Button
                                    onClick={handleUpgradeBackpack}
                                    disabled={!upgradeCost || upgradePending || creditsDisplay < (upgradeCost || 0)}
                                    variant="primary"
                                    className="h-10 px-6 text-sm font-bold rounded-full disabled:opacity-50"
                                >
                                    {upgradeCost ? `UPGRADE(${upgradeCost} CR)` : "MAX LEVEL"}
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {repairableItems.map((inv) => {
                                    const maxUses = inv.usesMax ?? inv.item?.maxUses ?? 0;
                                    const remaining = inv.usesRemaining ?? maxUses;
                                    const canRepair = scrapCount >= maxUses && !repairingId;
                                    return (
                                        <div key={inv.id} className="bg-black/40 p-4 rounded border border-white/5 flex items-center justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="text-white font-semibold truncate">{inv.item?.name || "Item"}</div>
                                                <div className="text-xs text-gray-400">Uses: {remaining}/{maxUses}</div>
                                                <div className="text-[10px] text-neon-cyan/70">Repair cost: {maxUses} Scrap</div>
                                            </div>
                                            <Button
                                                onClick={() => handleRepairItem(inv.id)}
                                                disabled={!canRepair || repairingId === inv.id}
                                                variant="ghost"
                                                className="h-8 px-4 text-xs border border-white/10 text-neon-cyan hover:bg-white/10 disabled:opacity-50"
                                            >
                                                {repairingId === inv.id ? "REPAIRING..." : "REPAIR"}
                                            </Button>
                                        </div>
                                    );
                                })}
                                {repairableItems.length === 0 && (
                                    <div className="text-gray-500 text-sm col-span-full text-center py-6">
                                        No repairs needed.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* UNIFIED GLOBAL QUEUE DISPLAY */}
                    <div className="glass-panel p-6 border border-white/10 flex flex-col gap-4">
                        <h2 className="text-lg font-bold text-white flex items-center">
                            <Loader2 className="mr-2 text-neon-cyan" /> GLOBAL PRINT QUEUE
                        </h2>

                        {!printerOnline && (
                            <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                ⚠️ Visualizer worker offline - queue processing paused
                            </div>
                        )}

                        {/* ACTIVE ITEM (NOW PRINTING) */}
                        {activeItem && !queueHold && (
                            <div className={`
                                px-4 py-4 rounded-lg border shadow-[0_0_15px_rgba(0,0,0,0.1)]
                                ${activeItem.queueType === "ITEM" ? "bg-amber-500/10 border-amber-500/50 shadow-amber-500/10" : "bg-neon-cyan/10 border-neon-cyan/50 shadow-neon-cyan/10"}
                            `}>
                                {(()=>{
                                    const rawStatus = activeItem.imageStatus || activeItem.status || "QUEUED";
                                    const isGenerating = rawStatus.startsWith("GENERATING");
                                    const percent = isGenerating ? (rawStatus.split(" ")[1] || "0%") : "0%";
                                    return (
                                        <>
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className="w-16 h-16 rounded border border-white/10 bg-black/60 flex-shrink-0 overflow-hidden relative flex items-center justify-center">
                                                        {activeItem.queueType === "CHARACTER" ? (
                                                            <div className="absolute inset-0 opacity-20">
                                                                <PortraitFallback characterClass={activeItem.characterClass} />
                                                            </div>
                                                        ) : (
                                                            <div className="absolute inset-0 flex items-center justify-center opacity-10">
                                                                <ImageIcon className="w-8 h-8 text-white" />
                                                            </div>
                                                        )}

                                                        {/* Progress Overlay */}
                                                        <div className="relative z-10 flex flex-col items-center justify-center">
                                                            {isGenerating ? (
                                                                <>
                                                                    <Loader2 className={`h-5 w-5 animate-spin mb-1 ${activeItem.queueType === "ITEM" ? "text-amber-500" : "text-cyan-400"}`} />
                                                                    <span className="text-[10px] font-black font-mono text-white/90">{percent}</span>
                                                                </>
                                                            ) : (
                                                                <Loader2 className="h-5 w-5 animate-pulse text-white/40" />
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className={`text-base font-bold flex flex-wrap items-center gap-x-2 gap-y-1 ${activeItem.queueType === "ITEM" ? "text-white" : "text-cyan-400"}`}>
                                                            <span className={`text-[10px] uppercase font-black tracking-widest animate-pulse shrink-0 ${activeItem.queueType === "ITEM" ? "text-amber-500" : "text-cyan-500"}`}>NOW PRINTING</span>
                                                            {activeItem.name}
                                                        </div>
                                                        <div className={`text-[10px] uppercase mt-1 ${activeItem.queueType === "ITEM" ? "text-amber-500/80" : "text-neon-cyan/80"}`}>
                                                            <span className="flex items-center gap-1">
                                                                {activeItem.queueType === "ITEM" ? <Wrench className="w-3 h-3" /> : <User className="w-3 h-3" />}
                                                                {activeItem.queueType} - {activeItem.owner}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-4 h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
                                                <motion.div
                                                    className={`h-full transition-all duration-500 ${activeItem.queueType === "ITEM" ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" : "bg-neon-cyan shadow-[0_0_10px_rgba(0,255,255,0.5)]"}`}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: percent }}
                                                />
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                        {/* PENDING ITEMS LIST */}
                        <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 custom-scrollbar border-t border-white/5 pt-4">
                            {queueHold ? (
                                <div className="text-gray-500 text-sm text-center py-6">
                                    Fabrication in progress. Queue syncing...
                                </div>
                            ) : queuedItemsList.map((item: any, idx: number) => {
                                // Since we pulled the active item out, the visual queue position is idx + 2 (active is #1)
                                const queuePos = activeItem ? idx + 2 : idx + 1;
                                return (
                                    <div
                                        key={item.id}
                                        className={`px-3 py-3 rounded border bg-black/40 ${item.queueType === "ITEM" ? "border-amber-500/20" : "border-white/5"}`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className={`text-sm font-semibold flex flex-wrap items-center gap-x-2 gap-y-0.5 ${item.queueType === "ITEM" ? "text-amber-500/90" : "text-cyan-400"}`}>
                                                    <span className="flex items-center gap-1 shrink-0">
                                                        {item.queueType === "ITEM" ? <Wrench className="w-3 h-3 opacity-50" /> : <User className="w-3 h-3 opacity-50" />}
                                                    </span>
                                                    {item.name}
                                                </div>
                                                <div className="text-[10px] text-gray-600 uppercase mt-1">
                                                    {item.queueType} - {item.owner}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-gray-700 font-mono">
                                                <span>#{queuePos}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {!queueHold && queuedItemsList.length === 0 && !activeItem && (
                                <div className="text-gray-500 text-sm text-center py-6 font-mono">
                                    Queue Empty. Systems Standby.
                                </div>
                            )}
                            {!queueHold && queuedItemsList.length === 0 && activeItem && (
                                <div className="text-gray-600 text-[10px] text-center py-2 font-mono uppercase tracking-widest">
                                    No further jobs in queue
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RECENT FABRICATIONS CAROUSEL */}
                    <div className="glass-panel p-6 border border-white/10 relative">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white flex items-center">
                                <ImageIcon className="mr-2 text-neon-cyan" /> RECENT FABRICATIONS
                            </h2>
                            {recentMade.length > 1 && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        className="h-6 w-6 p-0 rounded-full border border-white/10 hover:bg-neon-cyan/20 hover:text-neon-cyan"
                                        onClick={() => setRecentIndex((i: number) => Math.max(0, i - 1))}
                                        disabled={recentIndex === 0}
                                    >
                                        &lt;
                                    </Button>
                                    <span className="text-xs text-gray-500 font-mono">
                                        {recentIndex + 1}/{recentMade.length}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        className="h-6 w-6 p-0 rounded-full border border-white/10 hover:bg-neon-cyan/20 hover:text-neon-cyan"
                                        onClick={() => setRecentIndex((i: number) => Math.min((recentMade.length || 1) - 1, i + 1))}
                                        disabled={recentIndex === (recentMade.length || 1) - 1}
                                    >
                                        &gt;
                                    </Button>
                                </div>
                            )}
                        </div>

                        {recentMade.length > 0 ? (
                            <div className="flex items-center gap-4">
                                <div className="w-24 h-24 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                                    <SafeImage
                                        src={recentMade[recentIndex]?.preview}
                                        alt={recentMade[recentIndex]?.title || "Recent fabricated item"}
                                        className="w-full h-full object-cover"
                                        fallback={
                                            recentMade[recentIndex]?.queueType === "PORTRAIT" ? (
                                                <PortraitFallback characterClass={recentMade[recentIndex]?.characterClass} />
                                            ) : (
                                                <ImageIcon className="w-6 h-6 text-gray-500" />
                                            )
                                        }
                                    />
                                </div>
                                <div className="min-w-0 flex flex-col justify-center">
                                    <div className="text-white font-bold text-lg drop-shadow-md">
                                        {recentMade[recentIndex]?.title}
                                    </div>
                                    <div className="text-xs font-semibold text-neon-cyan tracking-wide">
                                        {recentMade[recentIndex]?.owner}
                                    </div>
                                    <div className="text-[10px] text-gray-500 uppercase mt-1">
                                        {recentMade[recentIndex]?.queueType}
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-mono mt-1">
                                        {recentMade[recentIndex]?.completedAt ? new Date(recentMade[recentIndex].completedAt).toLocaleString() : "READY"}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-gray-500 text-sm text-center py-6 font-mono">
                                No recent fabrications on record.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

