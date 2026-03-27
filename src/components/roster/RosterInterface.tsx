"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Shield, Zap, User, Crosshair } from "lucide-react";
import SafeImage from "@/components/ui/SafeImage";

interface Character {
    id: string;
    name: string;
    class: string;
    level: number;
    portrait?: string;
    credits?: number;
    voidTokens?: number;
    stats?: string | any;
    runsCompleted?: number;
    runsFailed?: number;
    deathCount?: number;
    deepestLevel?: number;
}

interface RosterInterfaceProps {
    initialCharacters: Character[];
}

export default function RosterInterface({ initialCharacters }: RosterInterfaceProps) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedClass, setSelectedClass] = useState<string | null>(null);
    const [minLevel, setMinLevel] = useState(0);

    const filteredCharacters = initialCharacters.filter(char => {
        const matchesSearch = char.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesClass = selectedClass ? char.class.toLowerCase() === selectedClass.toLowerCase() : true;
        const matchesLevel = char.level >= minLevel;
        return matchesSearch && matchesClass && matchesLevel;
    });

    const classes = [
        { id: "marine", icon: Crosshair },
        { id: "android", icon: User },
        { id: "scientist", icon: Zap },
        { id: "teamster", icon: Shield }
    ];

    // Dynamic season system based on most recent activity
    const getSeasonLabel = () => {
        const allRuns = initialCharacters
            .map(c => c.runsCompleted ?? 0)
            .reduce((acc, runs) => acc + runs, 0);

        if (allRuns === 0) return "Season 0";

        const maxLevel = Math.max(...initialCharacters.map(c => c.level || 0));

        if (maxLevel > 0) {
            return `Season ${Math.floor(maxLevel / 5)}`;
        }

        return "Season 0";
    };

    const seasonLabel = getSeasonLabel();

    // Calculate score: weighted combination of runs, depth, and recent performance
    const calculateScore = (char: Character) => {
        const runs = char.runsCompleted ?? 0;
        const depth = char.deepestLevel ?? 0;
        const recentBonus = (char.runsCompleted ?? 0) * 0.1; // Bonus for consistent activity

        // Weight: 50% runs, 30% depth, 20% recent performance
        return runs * 50 + depth * 30 + recentBonus * 20;
    };

    const ranked = [...initialCharacters]
        .map(char => ({ ...char, score: calculateScore(char) }))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const aRuns = a.runsCompleted ?? 0;
            const bRuns = b.runsCompleted ?? 0;
            if (bRuns !== aRuns) return bRuns - aRuns;
            const aDepth = a.deepestLevel ?? 0;
            const bDepth = b.deepestLevel ?? 0;
            if (bDepth !== aDepth) return bDepth - aDepth;
            return a.name.localeCompare(b.name);
        })
        .slice(0, 10);

    const rosterTotals = initialCharacters.reduce((acc, char) => {
        acc.runs += char.runsCompleted ?? 0;
        acc.fails += char.runsFailed ?? 0;
        acc.deaths += char.deathCount ?? 0;
        return acc;
    }, { runs: 0, fails: 0, deaths: 0 });

    return (
        <div className="w-full max-w-7xl mx-auto">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-8">
                <div className="space-y-8">
                    {/* Control Panel */}
                    <div className="glass-panel p-6 rounded-xl border border-white/10 flex flex-col md:flex-row gap-6 items-center justify-between">

                        {/* Search */}
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                            <input
                                type="text"
                                placeholder="Search Personnel Database..."
                                className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-neon-cyan transition-colors"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                                <button
                                    onClick={() => setSelectedClass(null)}
                                    className={`px-4 py-2 rounded text-xs uppercase tracking-wider transition-colors ${!selectedClass ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-gray-500 hover:text-white'}`}
                                >
                                    All
                                </button>
                                {classes.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => setSelectedClass(selectedClass === c.id ? null : c.id)}
                                        className={`px-4 py-2 rounded text-xs uppercase tracking-wider flex items-center gap-2 transition-colors ${selectedClass === c.id ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        <c.icon className="w-3 h-3" />
                                        {c.id}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Grid Container with Scroll */}
                    <div className="h-[calc(100vh-240px)] overflow-y-auto custom-scrollbar pr-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            <AnimatePresence>
                                {filteredCharacters.map((char) => (
                                    <motion.div
                                        key={char.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        layout
                                        className="relative group h-80 rounded-xl overflow-hidden border border-white/10 bg-black cursor-pointer shadow-lg hover:shadow-[0_0_25px_rgba(0,243,255,0.2)] transition-all duration-500"
                                        onClick={() => router.push(`/character/view?id=${char.id}`)}
                                    >
                                        {/* Full Size Background Image */}
                                        {char.portrait ? (
                                            <div className="absolute inset-0 z-0">
                                                <SafeImage
                                                    src={char.portrait}
                                                    alt={char.name}
                                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 group-hover:grayscale-0 grayscale-[0.3]"
                                                />
                                            </div>
                                        ) : (
                                            <div className="absolute inset-0 z-0 flex items-center justify-center bg-gray-900">
                                                <User className="w-24 h-24 text-gray-700 opacity-20" />
                                            </div>
                                        )}

                                        {/* Gradient Gradient for Text Readability */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80 z-10" />

                                        {/* Always Visible: Name & Class (Bottom) */}
                                        <div className="absolute bottom-0 left-0 right-0 p-4 z-20 transform transition-transform duration-300 group-hover:-translate-y-2">
                                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter truncate drop-shadow-md">{char.name}</h3>
                                            <div className="flex items-center gap-2">
                                                {(() => {
                                                    const cls = (char.class || "").toLowerCase();
                                                    let color = "text-white";
                                                    if (cls.includes("marine")) color = "text-red-400";
                                                    else if (cls.includes("android")) color = "text-blue-400";
                                                    else if (cls.includes("scientist")) color = "text-purple-400";
                                                    else if (cls.includes("teamster")) color = "text-yellow-400";

                                                    return (
                                                        <span className={`text-xs font-bold uppercase tracking-widest ${color}`}>
                                                            {char.class}
                                                        </span>
                                                    );
                                                })()}
                                                <span className="w-1 h-1 bg-white/50 rounded-full" />
                                                <span className="text-xs text-gray-300 font-mono">LVL {char.level}</span>
                                            </div>
                                        </div>

                                        {/* Hidden Details Overlay (Appears on Hover) */}
                                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30 flex flex-col items-center justify-center p-6 text-center">
                                            <div className="text-neon-cyan font-bold mb-4 tracking-[0.2em] text-xs border-b border-neon-cyan/30 pb-2 w-full">SERVICE RECORD</div>

                                            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-xs mb-6 w-full">
                                                <div className="text-gray-400 text-right">CREDITS</div>
                                                <div className="text-neon-cyan text-left font-mono">{char.credits || 0} CR</div>

                                                <div className="text-gray-400 text-right">TOKENS</div>
                                                <div className="text-neon-magenta text-left font-mono">{char.voidTokens || 0} VT</div>

                                                <div className="text-gray-400 text-right">RUNS</div>
                                                <div className="text-white text-left font-mono">{char.runsCompleted || 0}</div>
                                            </div>

                                            <div className="w-full grid grid-cols-3 gap-2 text-xs">
                                                {(() => {
                                                    try {
                                                        const stats = typeof char.stats === 'string' ? JSON.parse(char.stats) : char.stats;
                                                        return (
                                                            <>
                                                                <div className="bg-white/5 rounded p-2 border border-white/10">
                                                                    <div className="text-red-400 font-bold mb-1">STR</div>
                                                                    <div className="font-mono text-white text-lg">{stats?.strength || stats?.str || 0}</div>
                                                                </div>
                                                                <div className="bg-white/5 rounded p-2 border border-white/10">
                                                                    <div className="text-green-400 font-bold mb-1">SPD</div>
                                                                    <div className="font-mono text-white text-lg">{stats?.speed || stats?.agility || 0}</div>
                                                                </div>
                                                                <div className="bg-white/5 rounded p-2 border border-white/10">
                                                                    <div className="text-blue-400 font-bold mb-1">INT</div>
                                                                    <div className="font-mono text-white text-lg">{stats?.intellect || stats?.int || 0}</div>
                                                                </div>
                                                            </>
                                                        )
                                                    } catch (e) { return null; }
                                                })()}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>

                        {filteredCharacters.length === 0 && (
                            <div className="text-center py-20 opacity-50">
                                <p className="text-xl text-gray-500 uppercase tracking-widest">No Personnel Found</p>
                            </div>
                        )}
                    </div>
                </div>

                <aside className="glass-panel p-6 rounded-xl border border-white/10 h-[calc(100vh-140px)] flex flex-col">
                    <div className="flex-none">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Season Rankings</div>
                        <div className="text-xl font-bold text-white mt-1 mb-4">{seasonLabel}</div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 min-h-0">
                        {ranked.map((char, idx) => (
                            <div
                                key={char.id}
                                className="flex items-center justify-between bg-black/40 border border-white/5 rounded-lg px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer"
                                onClick={() => router.push(`/character/view?id=${char.id}`)}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`text-[10px] font-mono w-6 text-center font-bold ${idx < 3 ? "text-neon-cyan" : "text-gray-600"}`}>#{idx + 1}</div>
                                    <div className="min-w-0">
                                        <div className="text-sm text-white font-bold truncate">{char.name}</div>
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest truncate">{char.class}</div>
                                    </div>
                                </div>
                                <div className="text-right text-[10px] text-gray-400">
                                    <div className="text-white font-mono">{char.deepestLevel ?? 0}m</div>
                                </div>
                            </div>
                        ))}
                        {ranked.length === 0 && (
                            <div className="text-xs text-gray-500 text-center py-4">No roster data yet.</div>
                        )}
                    </div>

                    <div className="flex-none mt-6 border-t border-white/10 pt-4">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Roster Stats</div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <div className="bg-black/40 border border-white/5 rounded p-2 text-center">
                                <div className="text-gray-500 text-[9px]">RUNS</div>
                                <div className="text-white font-bold">{rosterTotals.runs}</div>
                            </div>
                            <div className="bg-black/40 border border-white/5 rounded p-2 text-center">
                                <div className="text-gray-500 text-[9px]">FAILS</div>
                                <div className="text-white font-bold">{rosterTotals.fails}</div>
                            </div>
                            <div className="bg-black/40 border border-white/5 rounded p-2 text-center">
                                <div className="text-gray-500 text-[9px]">DEATHS</div>
                                <div className="text-white font-bold">{rosterTotals.deaths}</div>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}

