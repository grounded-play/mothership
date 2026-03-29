"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, Radio } from "lucide-react";
import { soundManager, type MusicPlayerSnapshot } from "@/lib/soundManager";

const EMPTY_SNAPSHOT: MusicPlayerSnapshot = {
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
    musicVolume: 0
};

const formatTime = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds || 0));
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

export default function MiniPlayer({ layout = "dock" }: { layout?: "dock" | "sidebar" }) {
    const pathname = usePathname();
    const [snapshot, setSnapshot] = useState<MusicPlayerSnapshot>(EMPTY_SNAPSHOT);

    useEffect(() => {
        soundManager.init();
        setSnapshot(soundManager.getMusicPlayerSnapshot());
        const interval = window.setInterval(() => {
            setSnapshot(soundManager.getMusicPlayerSnapshot());
        }, 250);
        return () => window.clearInterval(interval);
    }, []);

    if (!pathname || pathname === "/" || pathname.startsWith("/api/")) {
        return null;
    }

    const currentTrack = snapshot.currentTrack;
    const audioDisabled = !snapshot.masterEnabled || !snapshot.musicEnabled;
    const playLabel = !snapshot.unlocked
        ? "Enable"
        : snapshot.isPlaying
            ? "Pause"
            : "Play";
    const sidebar = layout === "sidebar";

    return (
        <div className={`relative max-w-full rounded-2xl border border-white/10 bg-black/88 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
            sidebar ? "w-full p-3" : "w-[220px] p-2.5 sm:w-[260px] sm:p-3"
        }`}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-neon-cyan">
                        <Radio className="h-3 w-3" />
                        Mini Player
                    </div>
                    <div className={`truncate font-bold text-white ${sidebar ? "text-base" : "text-sm sm:text-base"}`}>
                        {currentTrack?.title || "Audio Standby"}
                    </div>
                    <div className={`truncate text-[11px] text-gray-400 ${sidebar ? "block" : "hidden sm:block"}`}>
                        {currentTrack?.subtitle || "Persistent session audio"}
                    </div>
                </div>
                <div className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] ${
                    audioDisabled
                        ? "border-red-500/40 bg-red-500/10 text-red-300"
                        : snapshot.scene === "intense"
                            ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
                            : "border-neon-cyan/40 bg-cyan-500/10 text-neon-cyan"
                }`}>
                    {audioDisabled ? "Muted" : snapshot.scene === "intense" ? "Mission" : "Bridge"}
                </div>
            </div>

            <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                    className="h-full rounded-full bg-neon-cyan transition-[width] duration-200"
                    style={{ width: `${Math.max(0, Math.min(100, snapshot.progress * 100))}%` }}
                />
            </div>

            <div className="mb-2 flex items-center justify-between text-[10px] font-mono text-gray-400">
                <span>{formatTime(snapshot.currentTime)}</span>
                <span>{snapshot.playlistSize > 0 ? `${snapshot.playlistIndex + 1}/${snapshot.playlistSize}` : "--/--"}</span>
                <span>{formatTime(snapshot.duration)}</span>
            </div>

            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => soundManager.skipPreviousTrack()}
                    className={`flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:border-white/25 hover:bg-white/10 ${
                        sidebar ? "h-9 w-9" : "h-8 w-8 sm:h-9 sm:w-9"
                    }`}
                    aria-label="Previous track"
                >
                    <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => soundManager.toggleMusicPlayback()}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border border-neon-cyan/40 bg-cyan-500/10 text-neon-cyan transition-colors hover:border-neon-cyan hover:bg-cyan-500/15 ${
                        sidebar ? "h-10 px-4" : "h-9 px-3 sm:h-10 sm:px-4"
                    }`}
                >
                    {!snapshot.unlocked || !snapshot.isPlaying ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    <span className="text-[11px] font-bold uppercase tracking-[0.18em]">{playLabel}</span>
                </button>
                <button
                    type="button"
                    onClick={() => soundManager.skipNextTrack()}
                    className={`flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:border-white/25 hover:bg-white/10 ${
                        sidebar ? "h-9 w-9" : "h-8 w-8 sm:h-9 sm:w-9"
                    }`}
                    aria-label="Next track"
                >
                    <SkipForward className="h-3.5 w-3.5" />
                </button>
            </div>

            <div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-gray-500">
                <span className="flex items-center gap-1">
                    {audioDisabled ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                    {audioDisabled ? "Muted in settings" : snapshot.isPlaying ? "Playback armed" : "Ready"}
                </span>
                <span>{Math.round(snapshot.musicVolume * 100)}%</span>
            </div>
        </div>
    );
}
