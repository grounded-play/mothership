"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { Loader2, Coins, Image as ImageIcon, Zap, ChevronUp, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

type PrinterProps = { credits: number; inventory: any[]; globalQueue: any[]; backpackLevel: number };

export default function PrinterInterface({ credits, inventory, globalQueue, backpackLevel: initialBackpackLevel }: PrinterProps) {
    const [spinning, setSpinning] = useState(false);
    const [reward, setReward] = useState<{ name: string; rarity: string; icon?: string } | null>(null);
    const [pendingRarity, setPendingRarity] = useState<string | null>(null);
    const [creditsDisplay, setCreditsDisplay] = useState(credits);
    const [backpackLevel, setBackpackLevel] = useState(initialBackpackLevel);
    const [upgradePending, setUpgradePending] = useState(false);
    const [repairingId, setRepairingId] = useState<string | null>(null);

    // Queue State
    const [generationQueue, setGenerationQueue] = useState<any[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

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

    // Sync Local Queue with Global State & Auto-Refresh
    useEffect(() => {
        // 1. Auto-Refresh (Keep Data Fresh)
        const interval = setInterval(() => {
            router.refresh();
        }, 3000);

        // 2. Sync Logic: Resume "Stuck" items or items from previous session
        if (globalQueue && globalQueue.length > 0) {
            const myPending = globalQueue.filter(gItem =>
                // Is Mine?
                inventory.some(myInv => myInv.id === gItem.id) &&
                // Is Pending? (Null status, QUEUED, stuck GENERATING, or Broken READY)
                (!gItem.imageStatus || gItem.imageStatus === "QUEUED" || gItem.imageStatus.startsWith("GENERATING") || gItem.imageStatus === "READY")
            );

            if (myPending.length > 0) {
                setGenerationQueue(prev => {
                    // Prevent Duplicates
                    const newItems = myPending.filter(p => !prev.some(q => q.id === p.id));
                    if (newItems.length > 0) {
                        console.log("Resuming Pending Items:", newItems.length);
                        return [...prev, ...newItems];
                    }
                    return prev;
                });
            }
        }

        return () => clearInterval(interval);
    }, [router, globalQueue, inventory]);

    // Queue Processing Effect
    const processingRef = useRef(false);

    useEffect(() => {
        const processNext = async () => {
            if (generationQueue.length === 0 || isProcessing || processingRef.current) return;

            processingRef.current = true;
            setIsProcessing(true);
            const item = generationQueue[0];

            try {
                const res = await fetch('/api/items/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        itemId: item.itemId,
                        inventoryItemId: item.id,
                        stats: item.instanceStats,
                        traits: item.visualTraits
                    })
                });

                if (res.ok && res.body) {
                    const reader = res.body.getReader();
                    while (true) {
                        const { done } = await reader.read();
                        if (done) break;
                    }
                }
                router.refresh();
            } catch (e) {
                console.error(e);
                addToast("Visualization Failed", "error");
            } finally {
                setGenerationQueue(prev => prev.slice(1));
                setIsProcessing(false);
                processingRef.current = false;
            }
        };

        processNext();
    }, [generationQueue, isProcessing, router, addToast]);

    const spinCost = 100;

    const handleSpin = async () => {
        if (creditsDisplay < spinCost) {
            addToast("Insufficient Credits", "error");
            return;
        }

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
                setPendingRarity(winnerRarity);
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

                // 6. Show Result
                if (data.rewardInstance) {
                    handleGenerateArt(data.rewardInstance);
                }

                setReward(data.reward);
                setCreditsDisplay(data.credits);
                setSpinning(false);
                router.refresh();
                addToast(`Fabrication Complete: ${data.reward.name}`, "success");
            } else {
                addToast(data.error || "Fabrication Failed", "error");
                setSpinning(false);
            }
        } catch (e) {
            console.error(e);
            setSpinning(false);
            addToast("Connection Error", "error");
        }
    };

    const handleGenerateArt = async (item: any) => {
        setGenerationQueue(prev => [...prev, item]);
        addToast("Added to Visualization Queue", "info");
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

    return (
        <div className="w-full max-w-6xl mx-auto p-4 pt-24 space-y-12">

            {/* MAIN PRINTER (GAMBA) */}
            <div className="glass-panel p-8 rounded-3xl border-2 border-neon-cyan/50 shadow-[0_0_50px_rgba(0,243,255,0.2)] text-center relative overflow-hidden max-w-2xl mx-auto">
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
                                const shadow = pendingRarity ? `shadow-[0_0_15px_currentColor]` : 'shadow-[0_0_10px_#0ff]';

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
                        <Button
                            onClick={handleSpin}
                            disabled={spinning || creditsDisplay < spinCost}
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
                            {upgradeCost ? `UPGRADE (${upgradeCost} CR)` : "MAX LEVEL"}
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

            {/* QUEUE DISPLAY */}
            <div className="glass-panel p-8 mt-12 border border-white/10">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                    <Loader2 className="mr-2 animate-spin text-neon-cyan" /> GLOBAL PRINT QUEUE
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Placeholder for real queue data passed via props */}
                    {globalQueue.map((item: any) => (
                        <div key={item.id} className="bg-black/40 p-4 rounded flex items-center gap-4 relative overflow-hidden group border border-white/5">
                            <div className="w-12 h-12 bg-gray-800 rounded flex items-center justify-center">
                                {item.item.icon ? <ImageIcon className="w-6 h-6 text-gray-400" /> : <Loader2 className="w-6 h-6 animate-spin text-neon-cyan" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-white font-bold truncate">{item.item.name}</div>
                                <div className="text-xs text-neon-cyan truncate">Owner: {item.character.name}</div>

                                {/* PROGRESS BAR / STATUS */}
                                <div className="mt-1">
                                    {item.imageStatus?.startsWith("GENERATING") ? (
                                        <div className="w-full bg-gray-800 h-1 rounded overflow-hidden">
                                            <div
                                                className="h-full bg-neon-cyan transition-all duration-500"
                                                style={{ width: item.imageStatus.split(' ')[1] || '0%' }}
                                            />
                                        </div>
                                    ) : (
                                        <span className="text-[10px] text-gray-500">{item.imageStatus || "QUEUED"}</span>
                                    )}
                                    {item.imageStatus?.startsWith("GENERATING") && (
                                        <div className="text-[10px] text-neon-cyan mt-0.5">{item.imageStatus}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {globalQueue.length === 0 && <div className="text-gray-500 text-sm col-span-full text-center py-8">Queue Empty. Systems Standby.</div>}
                </div>
            </div>
        </div>
    );
}
