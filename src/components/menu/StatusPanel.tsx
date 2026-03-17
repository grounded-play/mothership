"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Activity, Globe, Zap, ShoppingCart, Shield, Terminal } from "lucide-react";
import SafeImage from "@/components/ui/SafeImage";
import { formatDistanceToNow } from "date-fns";

interface StatusPanelProps {
    character: any;
    lastRun: any;
    globalLastRun: any;
    lastTransaction: any;
    lastPrint: any;
    totalPlayers: number;
    onlinePlayers: number;
    activeMissions: number;
    activeLobbies: number;
    comfyStatus: boolean;
}

export default function StatusPanel(props: StatusPanelProps) {
    const [data, setData] = useState(props);

    useEffect(() => {
        const poll = async () => {
            try {
                const res = await fetch("/api/menu/status");
                if (res.ok) {
                    const newData = await res.json();
                    setData(newData);
                }
            } catch (e) {
                console.error("Status Poll Error:", e);
            }
        };

        const interval = setInterval(poll, 15000); // Poll every 15s
        return () => clearInterval(interval);
    }, []);

    const {
        character,
        lastRun,
        globalLastRun,
        lastTransaction,
        lastPrint,
        totalPlayers,
        onlinePlayers,
        activeMissions,
        activeLobbies,
        comfyStatus
    } = data;

    const rank = lastRun?.rank || "N/A";
    
    return (
        <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-72 glass-panel p-4 rounded-xl border-neon-cyan/20 space-y-4 shadow-2xl backdrop-blur-md"
        >
            {/* Player Profile Section */}
            <div className="flex items-center gap-4 pb-3 border-b border-white/10">
                <div className="relative">
                    <div className="w-14 h-14 rounded-full border-2 border-neon-cyan overflow-hidden bg-gray-900 shadow-[0_0_10px_rgba(0,243,255,0.3)]">
                        <SafeImage 
                            src={character?.portrait} 
                            alt={character?.name}
                            className="w-full h-full object-cover"
                            fallback={<div className="flex items-center justify-center h-full text-gray-500 font-bold text-xl">{character?.class?.[0] || "?"}</div>}
                        />
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-black border border-neon-magenta text-neon-magenta text-[10px] font-black px-1.5 rounded-sm shadow-sm">
                        {rank}
                    </div>
                </div>
                <div className="min-w-0">
                    <div className="text-white font-bold truncate tracking-widest uppercase text-sm">{character?.name || "UNIDENTIFIED"}</div>
                    <div className="text-[10px] text-neon-cyan/80 font-mono tracking-tighter flex items-center gap-1 uppercase">
                        <Shield className="w-2.5 h-2.5" /> Season Rank: {rank}
                    </div>
                </div>
            </div>

            {/* Network Diagnostics Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-black text-gray-500 tracking-[0.2em] uppercase">
                        <Terminal className="w-3 h-3" /> System Diagnostics
                    </div>
                    {/* Uplink Status Dot */}
                    <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${comfyStatus ? 'bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.5)]' : 'bg-red-500'}`} />
                        <span className={`text-[8px] font-bold ${comfyStatus ? 'text-green-400' : 'text-red-500'}`}>
                            {comfyStatus ? 'UPLINK OK' : 'NO LINK'}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                    {/* Hive Stats */}
                    <div className="flex items-center justify-between bg-black/40 border border-white/5 p-2 rounded-md">
                        <div className="flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 text-neon-magenta" />
                            <span className="text-[11px] text-gray-300 font-medium tracking-tight">HIVE STATUS</span>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-white font-black tracking-widest leading-none">
                                {onlinePlayers} <span className="text-[7px] text-green-400 font-bold ml-0.5">ACTIVE</span>
                            </div>
                            <div className="text-[8px] text-gray-500 font-mono tracking-tighter mt-0.5">
                                / {totalPlayers} REGISTERED
                            </div>
                        </div>
                    </div>

                    {/* Fleet Intelligence Section */}
                    <div className="pt-1.5 pb-1 border-t border-white/5">
                        <div className="flex items-center gap-2 text-[9px] font-black text-neon-cyan tracking-[0.15em] uppercase mb-2">
                            <Activity className="w-3 h-3" /> Fleet Intelligence
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-black/40 border border-white/5 p-1.5 rounded-md text-center">
                                <div className="text-[8px] text-gray-500 font-bold uppercase mb-0.5">Active Missions</div>
                                <div className="text-sm font-black text-white">{activeMissions}</div>
                            </div>
                            <div className="bg-black/40 border border-white/5 p-1.5 rounded-md text-center">
                                <div className="text-[8px] text-gray-500 font-bold uppercase mb-0.5">Open Lobbies</div>
                                <div className="text-sm font-black text-neon-cyan">{activeLobbies}</div>
                            </div>
                        </div>
                    </div>

                    {/* Activity Logs */}
                    <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                         {/* Last Mission */}
                         <div className="flex items-center justify-between">
                            <span className="text-[9px] text-gray-400 uppercase font-medium">Last Fleet Op:</span>
                            <span className="text-[9px] text-gray-500 font-mono">
                                {globalLastRun ? formatDistanceToNow(new Date(globalLastRun.endedAt), { addSuffix: true }) : 'NO RECENT OPS'}
                            </span>
                        </div>
                        
                        {/* Forge Status */}
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-neon-cyan uppercase font-medium">Last Print:</span>
                            <span className="text-[9px] text-gray-500 font-mono">
                                {lastPrint ? formatDistanceToNow(new Date(lastPrint.imageUpdatedAt), { addSuffix: true }) : 'NEVER'}
                            </span>
                        </div>

                        {/* Market Status */}
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-amber-400 uppercase font-medium">Last Trade:</span>
                            <span className="text-[9px] text-gray-500 font-mono">
                                {lastTransaction ? formatDistanceToNow(new Date(lastTransaction.timestamp), { addSuffix: true }) : 'NONE'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Micro Scroll Text */}
            <div className="overflow-hidden h-4 relative">
                <div className="absolute whitespace-nowrap animate-marquee text-[8px] text-neon-cyan/40 font-mono tracking-widest uppercase">
                    SYSTEM SECURE :: PORTAL STABILIZED :: ALL SYSTEMS NOMINAL :: DATA FREQUENCY 441.2 KHZ :: UNAUTHORIZED ACCESS PROHIBITED
                </div>
            </div>
        </motion.div>
    );
}
