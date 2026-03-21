import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Crosshair, Heart, AlertTriangle } from 'lucide-react';

interface ResolutionOverlayProps {
    data: any;
    onClose: () => void;
}

export default function ResolutionOverlay({ data, onClose }: ResolutionOverlayProps) {
    const [step, setStep] = useState(0);

    // Sequence: 
    // 0: Cards Appear
    // 1: Base Power
    // 2: Weapon/Class Bonuses
    // 3: Room/Integrity Bonuses
    // 4: Final Result

    useEffect(() => {
        if (!data) return;
        const timer1 = setTimeout(() => setStep(1), 500);
        const timer2 = setTimeout(() => setStep(2), 1500);
        const timer3 = setTimeout(() => setStep(3), 2500);
        const timer4 = setTimeout(() => setStep(4), 3500);
        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
            clearTimeout(timer4);
        };
    }, [data]);

    if (!data) return null;

    const { breakdown, player, roomSuit, strength, nodePower, success, type } = data;

    // Theme Helpers (Duplicated from NavCard for now, should extract)
    const getTheme = (suit: string) => {
        const s = (suit || "").toUpperCase();
        if (s === "BIOTECH") return { color: "text-red-500", border: "border-red-500", bg: "bg-red-950/40", icon: <Heart /> };
        if (s === "PLASMA") return { color: "text-orange-400", border: "border-orange-400", bg: "bg-orange-950/40", icon: <Zap /> };
        if (s === "COMMAND") return { color: "text-green-400", border: "border-green-400", bg: "bg-green-950/40", icon: <Crosshair /> };
        if (s === "VOID") return { color: "text-purple-400", border: "border-purple-400", bg: "bg-purple-950/40", icon: <Shield /> };
        return { color: "text-gray-400", border: "border-gray-400", bg: "bg-gray-900/40", icon: <AlertTriangle /> };
    };

    const playerTheme = getTheme(data.cards?.[0]?.suit || "COMMAND"); // Fallback
    const roomTheme = getTheme(roomSuit);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
                onClick={onClose}
            >
                <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>

                    {/* Header */}
                    <div className="bg-black/40 p-3 border-b border-white/10 flex justify-between items-center">
                        <span className="text-neon-cyan text-xs font-bold tracking-widest uppercase">RESOLUTION: {type}</span>
                        <button onClick={onClose} className="text-gray-500 hover:text-white text-xs">CLOSE</button>
                    </div>

                    <div className="p-8 flex flex-col items-center gap-8">

                        {/* Battle Stage */}
                        <div className="flex items-center justify-center gap-8 w-full">

                            {/* Player Side */}
                            <div className="flex flex-col items-center gap-2">
                                <motion.div
                                    initial={{ x: -50, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    className={`w-24 h-32 rounded-xl border-2 ${playerTheme.border} ${playerTheme.bg} flex items-center justify-center relative`}
                                >
                                    <div className="absolute top-1 left-1 text-xs font-bold opacity-50">PLAYER</div>
                                    <div className="text-4xl">{playerTheme.icon}</div>
                                    {step >= 1 && (
                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -bottom-3 -right-3 bg-slate-800 border border-white/20 rounded-full w-8 h-8 flex items-center justify-center font-bold text-white shadow-lg">
                                            {breakdown.base}
                                        </motion.div>
                                    )}
                                </motion.div>
                                <span className="text-xs text-gray-400 uppercase tracking-widest">{data.playerName}</span>
                            </div>

                            {/* VS */}
                            <div className="flex flex-col items-center">
                                <span className="text-xl font-black text-white italic">VS</span>
                                {step >= 4 && (
                                    <motion.div
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1.2, opacity: 1 }}
                                        className={`mt-4 text-2xl font-black ${success ? "text-neon-cyan" : "text-red-500"}`}
                                    >
                                        {success ? "SUCCESS" : "FAIL"}
                                    </motion.div>
                                )}
                            </div>

                            {/* Enemy/Room Side */}
                            <div className="flex flex-col items-center gap-2">
                                <motion.div
                                    initial={{ x: 50, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    className={`w-24 h-32 rounded-xl border-2 ${roomTheme.border} ${roomTheme.bg} flex items-center justify-center relative`}
                                >
                                    <div className="absolute top-1 right-1 text-xs font-bold opacity-50">THREAT</div>
                                    <div className="text-4xl">{roomTheme.icon}</div>
                                    <div className="absolute -bottom-3 -left-3 bg-slate-800 border border-white/20 rounded-full w-8 h-8 flex items-center justify-center font-bold text-white shadow-lg">
                                        {nodePower}
                                    </div>
                                </motion.div>
                                <span className="text-xs text-gray-400 uppercase tracking-widest">{roomSuit} SECTOR</span>
                            </div>

                        </div>

                        {/* Modifiers Feed */}
                        <div className="w-full bg-black/20 rounded-lg p-3 min-h-[100px] flex flex-col gap-1">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 border-b border-white/5">Calculated Trajectory</div>

                            {step >= 1 && <ModifierRow label="Base Power" value={breakdown.base} />}
                            {step >= 2 && breakdown.weapon > 0 && <ModifierRow label="Weapon Synergy" value={breakdown.weapon} highlight />}
                            {step >= 2 && breakdown.classMod > 0 && <ModifierRow label="Class Proficiency" value={breakdown.classMod} highlight />}
                            {step >= 3 && breakdown.roomMod !== 0 && <ModifierRow label="Environment Mod" value={breakdown.roomMod} negative={breakdown.roomMod < 0} />}
                            {step >= 3 && breakdown.integrity !== 0 && <ModifierRow label="Structural Integrity" value={breakdown.integrity} negative />}

                            {step >= 4 && (
                                <>
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 pt-2 border-t border-white/10 flex justify-between items-center">
                                        <span className="text-xs font-bold text-white">TOTAL STRENGTH</span>
                                        <span className={`text-lg font-bold ${success ? "text-neon-cyan" : "text-red-500"}`}>{strength}</span>
                                    </motion.div>

                                    {/* Combat Summary */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mt-3 p-4 bg-black/40 rounded-lg border border-white/10"
                                    >
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-3 border-b border-white/5 pb-2">
                                            {success ? "⚔️ VICTORY SUMMARY" : "💀 DEFAT SUMMARY"}
                                        </div>

                                        {/* Main Power Comparison */}
                                        <div className="mb-3">
                                            <div className="flex items-center justify-between text-sm mb-1">
                                                <span className="text-gray-400">Enemy Threat Power</span>
                                                <span className="text-white font-mono font-bold text-lg">{nodePower}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-gray-400">Your Attack Power</span>
                                                <span className={success ? "text-neon-cyan font-mono font-bold text-lg" : "text-red-500 font-mono font-bold text-lg"}>{strength}</span>
                                            </div>
                                        </div>

                                        {/* Result Banner */}
                                        <div className={`text-center py-3 px-4 rounded-lg font-bold text-sm tracking-widest mb-3 ${success ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50" : "bg-red-500/20 text-red-500 border border-red-500/50"}`}>
                                            {success ? "✓ SECTOR CLEARED" : "✗ SECTOR FAILED"}
                                        </div>

                                        {/* Outcome Breakdown */}
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="bg-black/30 rounded p-2 border border-white/5">
                                                <span className="text-gray-500 block mb-1">Damage Dealt</span>
                                                <span className="text-white font-mono font-bold">{Math.max(0, strength - nodePower)} pts</span>
                                            </div>
                                            <div className="bg-black/30 rounded p-2 border border-white/5">
                                                <span className="text-gray-500 block mb-1">Damage Taken</span>
                                                <span className="text-red-500 font-mono font-bold">{Math.max(0, nodePower - strength)} pts</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                </>
                            )}
                        </div>

                    </div>

                    {/* Footer */}
                    {step >= 4 && (
                        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="p-4 bg-black/40 border-t border-white/10 flex justify-center">
                            <button onClick={onClose} className="px-6 py-2 bg-white text-black font-bold text-xs tracking-widest rounded hover:bg-gray-200">
                                PROCEED
                            </button>
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

function ModifierRow({ label, value, highlight, negative }: { label: string, value: number, highlight?: boolean, negative?: boolean }) {
    return (
        <motion.div initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex justify-between items-center text-xs">
            <span className={highlight ? "text-neon-cyan" : "text-gray-400"}>{label}</span>
            <span className={`font-mono ${negative ? "text-red-500" : highlight ? "text-neon-cyan" : "text-white"}`}>
                {value > 0 ? "+" : ""}{value}
            </span>
        </motion.div>
    );
}
