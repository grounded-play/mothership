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
            className="glass-panel h-full w-full rounded-[24px] border border-neon-cyan/20 p-4 shadow-2xl backdrop-blur-md space-y-4 sm:p-5 xl:p-6"
        >
            {/* Player Profile Section */}
            <div className="flex items-center gap-4 border-b border-white/10 pb-3 sm:gap-5 sm:pb-4">
                <div className="relative">
                    <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-neon-cyan bg-gray-900 shadow-[0_0_10px_rgba(0,243,255,0.3)] sm:h-20 sm:w-20">
                        <SafeImage 
                            src={character?.portrait} 
                            alt={character?.name}
                            className="w-full h-full object-cover"
                            fallback={<div className="flex items-center justify-center h-full text-gray-500 font-bold text-xl">{character?.class?.[0] || "?"}</div>}
                        />
                    </div>
                    <div className="absolute -bottom-1 -right-1 rounded-sm border border-neon-magenta bg-black px-1.5 text-[11px] font-black text-neon-magenta shadow-sm sm:text-xs">
                        {rank}
                    </div>
                </div>
                <div className="min-w-0">
                    <div className="truncate text-base font-bold tracking-[0.18em] text-white uppercase sm:text-lg xl:text-xl">{character?.name || "UNIDENTIFIED"}</div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.16em] text-neon-cyan/80 sm:text-xs">
                        <Shield className="w-2.5 h-2.5" /> Season Rank: {rank}
                    </div>
                </div>
            </div>

            {/* Network Diagnostics Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-black text-gray-500 tracking-[0.22em] uppercase sm:text-xs">
                        <Terminal className="w-3 h-3" /> System Diagnostics
                    </div>
                    {/* Uplink Status Dot */}
                    <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${comfyStatus ? 'bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.5)]' : 'bg-red-500'}`} />
                            <span className={`text-[9px] font-bold tracking-[0.16em] ${comfyStatus ? 'text-green-400' : 'text-red-500'}`}>
                                {comfyStatus ? 'UPLINK OK' : 'NO LINK'}
                            </span>
                        </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                    {/* Hive Stats */}
                    <div className="flex items-center justify-between bg-black/40 border border-white/5 p-2 rounded-md">
                        <div className="flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 text-neon-magenta" />
                            <span className="text-xs font-medium tracking-[0.08em] text-gray-300 sm:text-sm">HIVE STATUS</span>
                        </div>
                        <div className="text-right">
                            <div className="text-sm font-black leading-none tracking-[0.18em] text-white sm:text-base">
                                {onlinePlayers} <span className="ml-0.5 text-[9px] font-bold text-green-400">ACTIVE</span>
                            </div>
                            <div className="mt-0.5 text-[9px] font-mono tracking-tighter text-gray-500 sm:text-[10px]">
                                / {totalPlayers} REGISTERED
                            </div>
                        </div>
                    </div>

                    {/* Fleet Intelligence Section */}
                    <div className="pt-1.5 pb-1 border-t border-white/5">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-neon-cyan sm:text-[11px]">
                            <Activity className="w-3 h-3" /> Fleet Intelligence
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-black/40 border border-white/5 p-1.5 rounded-md text-center">
                                <div className="mb-0.5 text-[9px] font-bold uppercase text-gray-500">Active Missions</div>
                                <div className="text-base font-black text-white sm:text-lg">{activeMissions}</div>
                            </div>
                            <div className="bg-black/40 border border-white/5 p-1.5 rounded-md text-center">
                                <div className="mb-0.5 text-[9px] font-bold uppercase text-gray-500">Open Lobbies</div>
                                <div className="text-base font-black text-neon-cyan sm:text-lg">{activeLobbies}</div>
                            </div>
                        </div>
                    </div>

                    {/* Activity Logs */}
                    <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                         {/* Last Mission */}
                         <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium uppercase text-gray-400">Last Fleet Op:</span>
                            <span className="text-[10px] font-mono text-gray-500">
                                {globalLastRun ? formatDistanceToNow(new Date(globalLastRun.endedAt), { addSuffix: true }) : 'NO RECENT OPS'}
                            </span>
                        </div>
                        
                        {/* Forge Status */}
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium uppercase text-neon-cyan">Last Print:</span>
                            <span className="text-[10px] font-mono text-gray-500">
                                {lastPrint ? formatDistanceToNow(new Date(lastPrint.imageUpdatedAt), { addSuffix: true }) : 'NEVER'}
                            </span>
                        </div>

                        {/* Market Status */}
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium uppercase text-amber-400">Last Trade:</span>
                            <span className="text-[10px] font-mono text-gray-500">
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
