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

    // Helper to get color based on value type
    const getNumericColor = (value: number, type: "damage" | "healing" | "shield" | "neutral" = "neutral") => {
        if (type === "damage") return "text-red-400";
        if (type === "healing") return "text-green-400";
        if (type === "shield") return "text-yellow-400";
        return value >= 0 ? "text-white" : "text-red-400";
    };

    useEffect(() => {
        if (!data) return;
        // Simplified sequence for clarity
        const timer1 = setTimeout(() => setStep(1), 300);
        const timer2 = setTimeout(() => setStep(2), 800);
        const timer3 = setTimeout(() => setStep(3), 1500);
        const timer4 = setTimeout(() => setStep(4), 2200);
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

    function ModifierRow({ label, value, highlight, negative, valueColor }: { label: string, value: number, highlight?: boolean, negative?: boolean, valueColor?: "damage" | "healing" | "shield" | "neutral" }) {
        const type = valueColor || (negative ? "damage" : (highlight ? "healing" : "neutral"));
        const numericColor = getNumericColor(value, type);

        return (
            <motion.div initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex justify-between items-center text-xs">
                <span className={highlight ? "text-neon-cyan" : "text-gray-400"}>{label}</span>
                <span className={`font-mono ${numericColor}`}>
                    {value > 0 ? "+" : ""}{value}
                </span>
            </motion.div>
        );
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-2 sm:p-4"
                onClick={onClose}
            >
                <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>

                    {/* Header */}
                    <div className="bg-black/50 p-2.5 border-b border-white/10 flex justify-between items-center">
                        <span className="text-neon-cyan text-[10px] sm:text-xs font-bold tracking-widest uppercase">RESOLUTION: {type}</span>
                        <button onClick={onClose} className="text-gray-500 hover:text-white text-[10px] sm:text-xs">✕</button>
                    </div>

                    <div className="p-4 sm:p-6 flex flex-col items-center gap-4 sm:gap-6">

                        {/* Battle Stage - Compact Mobile Layout */}
                        <div className="flex items-center justify-center gap-3 sm:gap-6 w-full">

                            {/* Player Side */}
                            <div className="flex flex-col items-center gap-1 sm:gap-2">
                                <motion.div
                                    initial={{ x: -30, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    className={`w-16 h-20 sm:w-20 sm:h-24 rounded-lg border-2 ${playerTheme.border} ${playerTheme.bg} flex items-center justify-center relative`}
                                >
                                    <div className="absolute top-0.5 left-0.5 text-[8px] sm:text-[9px] font-bold opacity-40">PLAYER</div>
                                    <div className="text-2xl sm:text-3xl">{playerTheme.icon}</div>
                                    {step >= 1 && (
                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -bottom-2 -right-2 bg-slate-800 border border-white/20 rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center font-bold text-white text-xs sm:text-sm shadow-lg">
                                            {breakdown.base}
                                        </motion.div>
                                    )}
                                </motion.div>
                                <span className="text-[9px] sm:text-xs text-gray-400 uppercase tracking-wider truncate max-w-[60px] sm:max-w-[100px]">{data.playerName}</span>
                            </div>

                            {/* VS */}
                            <div className="flex flex-col items-center">
                                <span className="text-lg sm:text-xl font-black text-white italic">VS</span>
                                {step >= 4 && (
                                    <motion.div
                                        initial={{ scale: 0.4, opacity: 0 }}
                                        animate={{ scale: 1.1, opacity: 1 }}
                                        className={`mt-2 sm:mt-4 text-sm sm:text-2xl font-black ${success ? "text-neon-cyan" : "text-red-500"}`}
                                    >
                                        {success ? "SUCCESS" : "FAIL"}
                                    </motion.div>
                                )}
                            </div>

                            {/* Enemy/Room Side */}
                            <div className="flex flex-col items-center gap-1 sm:gap-2">
                                <motion.div
                                    initial={{ x: 30, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    className={`w-16 h-20 sm:w-20 sm:h-24 rounded-lg border-2 ${roomTheme.border} ${roomTheme.bg} flex items-center justify-center relative`}
                                >
                                    <div className="absolute top-0.5 right-0.5 text-[8px] sm:text-[9px] font-bold opacity-40">THREAT</div>
                                    <div className="text-2xl sm:text-3xl">{roomTheme.icon}</div>
                                    <div className="absolute -bottom-2 -left-2 bg-slate-800 border border-white/20 rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center font-bold text-white text-xs sm:text-sm shadow-lg">
                                        {nodePower}
                                    </div>
                                </motion.div>
                                <span className="text-[9px] sm:text-xs text-gray-400 uppercase tracking-wider truncate max-w-[60px] sm:max-w-[100px]">{roomSuit} SECTOR</span>
                            </div>

                        </div>

                        {/* Modifiers Feed - Compact Grid for Mobile */}
                        <div className="w-full bg-black/20 rounded-lg p-2.5 sm:p-3 min-h-[80px] sm:min-h-[100px]">
                            <div className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-widest mb-1 sm:mb-2 border-b border-white/5 pb-1">Trajectory</div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {step >= 1 && <ModifierRow label="Base" value={breakdown.base} />}
                                {step >= 2 && breakdown.weapon > 0 && <ModifierRow label="Weapon" value={breakdown.weapon} highlight />}
                                {step >= 2 && breakdown.classMod > 0 && <ModifierRow label="Class" value={breakdown.classMod} highlight />}
                                {step >= 3 && breakdown.roomMod !== 0 && <ModifierRow label="Env" value={breakdown.roomMod} valueColor={breakdown.roomMod < 0 ? "damage" : "neutral"} />}
                                {step >= 3 && breakdown.integrity !== 0 && <ModifierRow label="Integrity" value={breakdown.integrity} valueColor={breakdown.integrity < 0 ? "damage" : "healing"} />}
                                {step >= 4 && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-2 sm:col-span-3 mt-1 sm:mt-2 pt-1.5 sm:pt-2 border-t border-white/10 flex justify-between items-center">
                                        <span className="text-[9px] sm:text-xs font-bold text-white">TOTAL</span>
                                        <span className={`text-sm sm:text-lg font-bold ${getNumericColor(strength, success ? "healing" : "damage")}`}>{strength}</span>
                                    </motion.div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Footer */}
                    {step >= 4 && (
                        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="p-3 sm:p-4 bg-black/50 border-t border-white/10 flex justify-center">
                            <button onClick={onClose} className="px-4 sm:px-6 py-2 bg-white text-black font-bold text-[10px] sm:text-xs tracking-widest rounded hover:bg-gray-200">
                                PROCEED
                            </button>
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}