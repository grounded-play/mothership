"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch Final Stats - We reuse 'quit' API or a new 'summary' API?
        // Actually, we can just fetch 'state' logic but we need 'Quit' result if it was just quit.
        // Let's assume the user just navigated here.
        // We'll query GET /api/game/state maybe? Or generic summary.
        // Better: Query a new endpoint or just 'state' and process it.
        // Simpler: Just rely on Query Params? No, insecure.
        // Let's create a quick valid fetch.
        // Re-using 'state' is safe.
        fetch(`/api/game/state?gameId=${id}`)
            .then(res => res.json())
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(e => console.error(e));
    }, [id]);

    if (loading) return <div className="min-h-screen bg-black text-neon-cyan flex items-center justify-center font-mono animate-pulse">TRANSMITTING MISSION DATA...</div>;

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

    let rank = run?.rank || "C";
    let status = "MISSION ABORTED";
    let color = "text-yellow-500";

    if (isVictory) {
        if (!run?.rank) rank = "S";
        status = "MISSION ACCOMPLISHED";
        color = "text-neon-cyan";
    } else if (game?.phase === "ABORTED") {
        if (integrity < 50) {
            rank = "B";
            status = "TACTICAL WITHDRAWAL";
            color = "text-orange-500";
        } else {
            status = "MISSION ABORTED";
            color = "text-red-500";
        }
    }

    return (
        <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center justify-center p-4 relative overflow-hidden">
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
                    <div className="flex flex-col items-center justify-center bg-white/5  p-6 rounded-2xl border border-white/10">
                        <div className="text-xs text-gray-400 uppercase tracking-widest mb-4">Performance Rank</div>
                        <div className={`text-8xl font-black ${color} drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]`}>{rank}</div>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-col gap-4 justify-center">
                        <div className="flex justify-between items-center border-b border-white/10 pb-2">
                            <span className="text-gray-400 text-sm">Credits Earned</span>
                            <span className="text-xl font-bold text-neon-cyan">+{run?.creditsEarned ?? (game?.currentTurn * 10)} CR</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/10 pb-2">
                            <span className="text-gray-400 text-sm">Core Integrity Dmg</span>
                            <span className="text-xl font-bold text-red-400">{(100 - integrity)}%</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/10 pb-2">
                            <span className="text-gray-400 text-sm">Boss Neutralized</span>
                            <span className="text-xl font-bold text-white">{bossDefeated ? "YES" : "NO"}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/10 pb-2">
                            <span className="text-gray-400 text-sm">Extraction</span>
                            <span className={`text-xl font-bold ${extracted ? "text-green-400" : "text-red-400"}`}>{extracted ? "SUCCESS" : "FAILED"}</span>
                        </div>
                    </div>
                </div>

                <div className="flex justify-center gap-4">
                    <Button variant="outline" className="w-full md:w-auto px-8 py-6 text-lg border-2" onClick={() => router.push('/lobby/browse')}>
                        RETURN TO LOBBY
                    </Button>
                </div>

            </div>
        </div>
    );
}
