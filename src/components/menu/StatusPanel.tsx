"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Globe, Pause, Play, Radio, Shield, Terminal, Volume2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import SafeImage from "@/components/ui/SafeImage";
import AmyGuidePanel from "@/components/guide/AmyGuidePanel";
import { useAmyGuide } from "@/components/guide/AmyGuideContext";
import { soundManager, type MusicPlayerSnapshot } from "@/lib/soundManager";

type StatusCharacter = {
    portrait?: string | null;
    name?: string | null;
    class?: string | null;
} | null;

type LastRunRecord = {
    rank?: string | null;
} | null;

type FleetRunRecord = {
    endedAt?: string | Date | null;
} | null;

type TransactionRecord = {
    timestamp?: string | Date | null;
} | null;

type PrintRecord = {
    imageUpdatedAt?: string | Date | null;
    source?: "ITEM" | "PORTRAIT";
} | null;

interface StatusPanelProps {
    character: StatusCharacter;
    lastRun: LastRunRecord;
    globalLastRun: FleetRunRecord;
    lastTransaction: TransactionRecord;
    lastPrint: PrintRecord;
    totalPlayers: number;
    onlinePlayers: number;
    activeMissions: number;
    activeLobbies: number;
    comfyStatus: boolean;
}

const EMPTY_PLAYER: MusicPlayerSnapshot = {
    tracks: [],
    currentTrack: null,
    currentTrackId: null,
    playlistIndex: 0,
    playlistSize: 0,
    scene: "silent",
    isPlaying: false,
    isPaused: false,
    unlocked: false,
    currentTime: 0,
    duration: 0,
    progress: 0,
    musicEnabled: true,
    masterEnabled: true,
    musicVolume: 0,
};

const formatRelativeTime = (value?: string | Date | null, fallback = "NEVER") => {
    if (!value) return fallback;
    return formatDistanceToNow(value instanceof Date ? value : new Date(value), { addSuffix: true });
};

export default function StatusPanel(props: StatusPanelProps) {
    const [data, setData] = useState(props);
    const [playerSnapshot, setPlayerSnapshot] = useState<MusicPlayerSnapshot>(EMPTY_PLAYER);
    const { clearOverride, setOverride } = useAmyGuide();

    useEffect(() => {
        setData(props);
    }, [props]);

    useEffect(() => {
        const poll = async () => {
            try {
                const res = await fetch("/api/menu/status", { cache: "no-store" });
                if (res.ok) {
                    const newData = await res.json();
                    setData(newData);
                }
            } catch (e) {
                console.error("Status Poll Error:", e);
            }
        };

        const interval = setInterval(poll, 15000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        soundManager.init();
        const syncPlayer = () => setPlayerSnapshot(soundManager.getMusicPlayerSnapshot());
        syncPlayer();
        const interval = window.setInterval(syncPlayer, 500);
        return () => window.clearInterval(interval);
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
        comfyStatus,
    } = data;

    const rank = lastRun?.rank || "N/A";
    const printLabel = lastPrint?.source === "PORTRAIT" ? "Last Portrait" : "Last Print";
    const audioLabel = playerSnapshot.isPlaying && !playerSnapshot.isPaused ? "Pause Audio" : "Play Audio";

    useEffect(() => {
        setOverride({
            source: "menu-status",
            messages: [
                {
                    kind: "guide",
                    title: `Welcome back, ${character?.name || "operator"}`,
                    text: `Season 0 is active. ${activeMissions} mission${activeMissions === 1 ? "" : "s"} are live and ${activeLobbies} launch bay${activeLobbies === 1 ? "" : "s"} are waiting across ${onlinePlayers} active signals.`,
                },
                {
                    kind: "guide",
                    title: "Daily briefing",
                    text: "Check Mission Control first, then use the fabricator only to close real loadout gaps. Clear trades and fresh prints matter more than clutter today.",
                },
                {
                    kind: "lore",
                    title: "Season watch",
                    text: "Amy is tracking the fleet pulse from the bridge. I’ll keep rotation notes, launch openings, and the day’s useful signal noise cycling while you route the next run.",
                },
            ],
        });

        return () => clearOverride("menu-status");
    }, [activeLobbies, activeMissions, character?.name, clearOverride, onlinePlayers, setOverride]);

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-panel flex h-full min-h-0 w-full flex-col rounded-[24px] border border-neon-cyan/20 p-4 shadow-2xl backdrop-blur-md sm:p-5 xl:p-6"
        >
            <div className="flex items-center gap-4 border-b border-white/10 pb-3 sm:gap-5 sm:pb-4">
                <div className="relative">
                    <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-neon-cyan bg-gray-900 shadow-[0_0_10px_rgba(0,243,255,0.3)] sm:h-20 sm:w-20">
                        <SafeImage
                            src={character?.portrait}
                            alt={character?.name || "Character portrait"}
                            className="h-full w-full object-cover"
                            fallback={<div className="flex h-full items-center justify-center text-xl font-bold text-gray-500">{character?.class?.[0] || "?"}</div>}
                        />
                    </div>
                    <div className="absolute -bottom-1 -right-1 rounded-sm border border-neon-magenta bg-black px-1.5 text-[11px] font-black text-neon-magenta shadow-sm sm:text-xs">
                        {rank}
                    </div>
                </div>
                <div className="min-w-0">
                    <div className="truncate text-base font-bold uppercase tracking-[0.18em] text-white sm:text-lg xl:text-xl">{character?.name || "UNIDENTIFIED"}</div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.16em] text-neon-cyan/80 sm:text-xs">
                        <Shield className="h-2.5 w-2.5" /> Season Rank: {rank}
                    </div>
                </div>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-gray-500 sm:text-xs">
                            <Terminal className="h-3 w-3" /> System Diagnostics
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className={`h-1.5 w-1.5 rounded-full ${comfyStatus ? "animate-pulse bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.5)]" : "bg-red-500"}`} />
                            <span className={`text-[9px] font-bold tracking-[0.16em] ${comfyStatus ? "text-green-400" : "text-red-500"}`}>
                                {comfyStatus ? "UPLINK OK" : "NO LINK"}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                        <div className="flex items-center justify-between rounded-md border border-white/5 bg-black/40 p-2">
                            <div className="flex items-center gap-2">
                                <Globe className="h-3.5 w-3.5 text-neon-magenta" />
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

                        <div className="border-t border-white/5 pb-1 pt-1.5">
                            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-neon-cyan sm:text-[11px]">
                                <Activity className="h-3 w-3" /> Fleet Intelligence
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-md border border-white/5 bg-black/40 p-1.5 text-center">
                                    <div className="mb-0.5 text-[9px] font-bold uppercase text-gray-500">Active Missions</div>
                                    <div className="text-base font-black text-white sm:text-lg">{activeMissions}</div>
                                </div>
                                <div className="rounded-md border border-white/5 bg-black/40 p-1.5 text-center">
                                    <div className="mb-0.5 text-[9px] font-bold uppercase text-gray-500">Open Lobbies</div>
                                    <div className="text-base font-black text-neon-cyan sm:text-lg">{activeLobbies}</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1.5 border-t border-white/5 pt-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-medium uppercase text-gray-400">Last Fleet Op:</span>
                                <span className="text-[10px] font-mono text-gray-500">
                                    {formatRelativeTime(globalLastRun?.endedAt, "NO RECENT OPS")}
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-medium uppercase text-neon-cyan">{printLabel}:</span>
                                <span className="text-[10px] font-mono text-gray-500">
                                    {formatRelativeTime(lastPrint?.imageUpdatedAt)}
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-medium uppercase text-amber-400">Last Trade:</span>
                                <span className="text-[10px] font-mono text-gray-500">
                                    {formatRelativeTime(lastTransaction?.timestamp, "NONE")}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
                    <div className="mb-3 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => soundManager.toggleMusicPlayback()}
                            className="inline-flex items-center gap-2 rounded-full border border-neon-cyan/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-neon-cyan transition-colors hover:border-neon-cyan hover:bg-cyan-500/15"
                            aria-label={audioLabel}
                        >
                            {playerSnapshot.isPlaying && !playerSnapshot.isPaused ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            Audio
                        </button>
                        <div className="inline-flex items-center gap-2 rounded-full border border-neon-cyan bg-cyan-500/15 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-neon-cyan">
                            <Radio className="h-3.5 w-3.5" />
                            Amy
                        </div>
                        <div className="ml-auto flex items-center gap-1 text-[9px] uppercase tracking-[0.16em] text-gray-500">
                            <Volume2 className="h-3 w-3" />
                            {playerSnapshot.currentTrack?.title || "Bridge audio"}
                        </div>
                    </div>

                    <AmyGuidePanel layout="sidebar" />
                </div>
            </div>
        </motion.div>
    );
}
