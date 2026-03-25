"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { soundManager } from "@/lib/soundManager";

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Animation States (Must be declared before conditional return)
    const [displayScore, setDisplayScore] = useState(0);
    const [showRank, setShowRank] = useState(false);
    const [showStats, setShowStats] = useState(false);

    useEffect(() => {
        soundManager.setMusicScene("default");
    }, []);

    useEffect(() => {
        fetch(`/api/game/state?gameId=${id}`)
            .then(res => res.json())
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(e => console.error(e));
    }, [id]);

    const game = stats?.game;
    const player = stats?.player;
    const run = stats?.run;

    // Rank Logic (Visual)
    const integrity = typeof game?.integrity === "number" ? game.integrity : 100;
    const bossDefeated = typeof run?.bossDefeated === "boolean"
        ? run.bossDefeated
        : integrity <= 0 || game?.phase === "VICTORY";
    const extracted = typeof run?.extracted === "boolean"
        ? run.extracted
        : (game?.phase === "VICTORY" && player?.MapNode?.type === "START");
    const isVictory = bossDefeated;
    const travelDistance = run?.distanceTraveled ?? player?.distanceTraveled ?? 0;
    const travelCredits = Math.floor(travelDistance / 10);

    let rank = run?.rank || "F";
    let status = "MISSION ABORTED";
    let color = "text-yellow-500";

    // Helper for color determination
    if (isVictory) {
        if (!run?.rank) rank = "S";
        status = "MISSION ACCOMPLISHED";
        color = "text-neon-cyan";
    } else if (game?.phase === "ABORTED") {
        rank = run?.rank || "F";
        status = "MISSION ABORTED";
        color = "text-red-500";
    } else {
        rank = run?.rank || "F";
        status = "CRITICAL FAILURE";
        color = "text-red-600";
    }

    const finalScore = run?.score || (isVictory ? 2000 : travelDistance);

    // Sequence Effect
    useEffect(() => {
        if (loading || !stats) return;

        // 1. Reveal Stats List
        setTimeout(() => setShowStats(true), 500);

        // 2. Tally Score (0 -> Final)
        let start = 0;
        const duration = 2000;
        const startTime = Date.now();

        const timer = setInterval(() => {
            const now = Date.now();
            const progress = Math.min(1, (now - startTime) / duration);
            const ease = 1 - Math.pow(1 - progress, 4);

            const current = Math.floor(start + (finalScore - start) * ease);
            setDisplayScore(current);

            if (progress >= 1) {
                clearInterval(timer);
                setTimeout(() => setShowRank(true), 500);
            }
        }, 16);

        return () => clearInterval(timer);
    }, [loading, stats, finalScore]);

    return (
        <div className="min-h-full bg-space-void text-white font-mono flex flex-col items-center justify-center p-4 relative overflow-hidden">
            <div className="fixed top-6 left-8 z-50">
                <Link
                    href="/menu"
                    onClick={() => soundManager.setMusicScene("default")}
                    className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            {/* Background Grid */}
            <div className="absolute inset-0 opacity-20 pointer-events-none"
                style={{ backgroundImage: 'linear-gradient(#0ff 1px, transparent 1px), linear-gradient(90deg, #0ff 1px, transparent 1px)', backgroundSize: '40px 40px' }}
            />

            <div className="z-10 w-full max-w-2xl bg-black/80 border-2 border-neon-cyan/30 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,255,255,0.1)] backdrop-blur-xl animate-in zoom-in duration-500">

                {/* Header */}
                <div className="text-center mb-10">
                    <div className={`text-4xl md:text-6xl font-black tracking-tighter mb-2 ${color} drop-shadow-[0_0_10px_rgba(0,0,0,1)]`}>
                        {status}
                    </div>
                    <div className="text-sm text-gray-500 tracking-[0.5em] uppercase">Post-Mission Analysis</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                    {/* Rank Card */}
                    <div className="flex flex-col items-center justify-center bg-white/5  p-6 rounded-2xl border border-white/10 relative overflow-hidden h-64">
                        <div className="text-xs text-gray-400 uppercase tracking-widest mb-4 z-10">Performance Rank</div>

                        {/* Rank Reveal Animation */}
                        {showRank ? (
                            <div className={`text-9xl font-black ${color} drop-shadow-[0_0_30px_currentColor] scale-in-center animate-in zoom-in-50 duration-300 z-10`}>
                                {rank}
                            </div>
                        ) : (
                            <div className="text-6xl text-gray-800 font-black animate-pulse z-10">?</div>
                        )}

                        {/* Score Tally */}
                        <div className="absolute bottom-4 left-0 w-full text-center">
                            <div className="text-xs text-gray-500 uppercase">Total Score</div>
                            <div className="text-2xl font-mono text-white">{displayScore.toLocaleString()}</div>
                        </div>
                    </div>

                    {/* Stats List - Staggered Reveal */}
                    <div className={`flex flex-col gap-4 justify-center transition-opacity duration-1000 ${showStats ? "opacity-100" : "opacity-0"}`}>
                        <StatRow label="Credits Earned" value={`+${run?.creditsEarned ?? 0} CR`} color="text-neon-cyan" delay={0} />
                        <StatRow label="Distance Traveled" value={`${travelDistance} SECTORS`} color="text-white" delay={120} />
                        <StatRow label="Travel Credit Bonus" value={`+${travelCredits} CR`} color="text-green-400" delay={240} />
                        <StatRow label="Core Integrity Dmg" value={`${(100 - integrity)}%`} color="text-red-400" delay={200} />
                        <StatRow label="Hostiles Neutralized" value="N/A" color="text-white" delay={400} /> {/* Placeholder for now */}
                        <StatRow label="Boss Neutralized" value={bossDefeated ? "YES" : "NO"} color="text-white" delay={600} />
                        <StatRow label="Extraction" value={extracted ? "SUCCESS" : "FAILED"} color={extracted ? "text-green-400" : "text-red-400"} delay={800} />
                    </div>
                </div>

                <div className={`flex justify-center gap-4 transition-all duration-1000 ${showRank ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
                    <Button
                        variant="outline"
                        className="w-full md:w-auto px-8 py-6 text-lg border-2 hover:bg-neon-cyan hover:text-black transition-colors"
                        onClick={() => {
                            soundManager.setMusicScene("default");
                            router.push('/lobby/browse');
                        }}
                    >
                        RETURN TO LOBBY
                    </Button>
                </div>

            </div >
        </div >
    );
}

function StatRow({ label, value, color, delay }: { label: string, value: string, color: string, delay: number }) {
    const [show, setShow] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setShow(true), delay);
        return () => clearTimeout(timer);
    }, [delay]);

    return (
        <div className={`flex justify-between items-center border-b border-white/10 pb-2 transition-all duration-500 ${show ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
            <span className="text-gray-400 text-sm">{label}</span>
            <span className={`text-xl font-bold ${color}`}>{value}</span>
        </div>
    );
}
