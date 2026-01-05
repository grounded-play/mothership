"use client";

import { useState } from "react";
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

    const seasonLabel = "Season 0";
    const ranked = [...initialCharacters].sort((a, b) => {
        const aRuns = a.runsCompleted ?? 0;
        const bRuns = b.runsCompleted ?? 0;
        if (bRuns !== aRuns) return bRuns - aRuns;
        const aDepth = a.deepestLevel ?? 0;
        const bDepth = b.deepestLevel ?? 0;
        if (bDepth !== aDepth) return bDepth - aDepth;
        if (b.level !== a.level) return b.level - a.level;
        return a.name.localeCompare(b.name);
    }).slice(0, 10);

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

                    {/* Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        <AnimatePresence>
                            {filteredCharacters.map((char) => (
                                <motion.div
                                    key={char.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    layout
                                    className="bg-black/40 border border-white/10 rounded-xl overflow-hidden hover:border-neon-cyan/50 hover:shadow-[0_0_15px_rgba(0,243,255,0.1)] transition-all group"
                                >
                                    {/* Portrait Area */}
                                    <div className="h-64 w-full relative bg-gray-900 overflow-hidden">
                                        <div className="absolute inset-0 bg-black/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-6 text-center z-10">
                                            <div className="text-neon-cyan font-bold mb-2 tracking-widest text-sm">SERVICE RECORD</div>


                                            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs mb-4 w-full">
                                                <div className="text-gray-400 text-right">CREDITS</div>
                                                <div className="text-white text-left font-mono text-yellow-500">{char.credits || 0}</div>

                                                <div className="text-gray-400 text-right">VOID TOKENS</div>
                                                <div className="text-white text-left font-mono text-neon-magenta">{char.voidTokens || 0}</div>
                                            </div>

                                            <div className="w-full border-t border-white/20 pt-2 grid grid-cols-3 gap-2 text-xs">
                                                {(() => {
                                                    try {
                                                        // Safe parse stats if string
                                                        const stats = typeof char.stats === 'string' ? JSON.parse(char.stats) : char.stats;
                                                        return (
                                                            <>
                                                                <div>
                                                                    <div className="text-red-400 font-bold">STR</div>
                                                                    <div className="font-mono">{stats?.strength || stats?.str || 0}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-green-400 font-bold">SPD</div>
                                                                    <div className="font-mono">{stats?.speed || stats?.agility || 0}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-blue-400 font-bold">INT</div>
                                                                    <div className="font-mono">{stats?.intellect || stats?.int || 0}</div>
                                                                </div>
                                                            </>
                                                        )
                                                    } catch (e) { return null; }
                                                })()}
                                            </div>
                                        </div>
                                        <div className="w-full border-t border-white/20 pt-2 grid grid-cols-3 gap-2 text-xs">
                                            {(() => {
                                                try {
                                                    // Safe parse stats if string
                                                    const stats = typeof char.stats === 'string' ? JSON.parse(char.stats) : char.stats;
                                                    return (
                                                        <>
                                                            <div>
                                                                <div className="text-red-400 font-bold">STR</div>
                                                                <div className="font-mono">{stats?.strength || stats?.str || 0}</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-green-400 font-bold">SPD</div>
                                                                <div className="font-mono">{stats?.speed || stats?.agility || 0}</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-blue-400 font-bold">INT</div>
                                                                <div className="font-mono">{stats?.intellect || stats?.int || 0}</div>
                                                            </div>
                                                        </>
                                                    )
                                                } catch (e) { return null; }
                                            })()}
                                        </div>
                                    </div>

                                    {/* Portrait Image */}
                                    {char.portrait ? (
                                        <img src={char.portrait} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-gray-700">
                                            <User className="w-16 h-16 opacity-20" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />

                                    <div className="absolute bottom-4 left-4 right-4">
                                        <h3 className="text-xl font-bold text-white uppercase tracking-wider truncate">{char.name}</h3>
                                        <div className="flex items-center justify-between mt-1">
                                            {(() => {
                                                const cls = (char.class || "").toLowerCase();
                                                let color = "text-white";
                                                if (cls.includes("marine")) color = "text-red-400";
                                                else if (cls.includes("android")) color = "text-blue-400";
                                                else if (cls.includes("scientist")) color = "text-purple-400";
                                                else if (cls.includes("teamster")) color = "text-yellow-400";

                                                return (
                                                    <span className={`text-xs uppercase tracking-widest ${color}`}>
                                                        {char.class}
                                                    </span>
                                                );
                                            })()}
                                            <span className="text-xs font-mono text-gray-400 border border-white/10 px-1 rounded bg-black/50">
                                                LVL {char.level}
                                            </span>
                                        </div>
                                    </div>
                                </motion.div >
                            ))
                            }
                        </AnimatePresence >
                    </div >

                    {
                        filteredCharacters.length === 0 && (
                            <div className="text-center py-20 opacity-50">
                                <p className="text-xl text-gray-500 uppercase tracking-widest">No Personnel Found</p>
                            </div>
                        )
                    }
                </div >

                <aside className="glass-panel p-6 rounded-xl border border-white/10 h-fit">
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest">Season Rankings</div>
                    <div className="text-xl font-bold text-white mt-1">{seasonLabel}</div>
                    <div className="mt-4 space-y-3">
                        {ranked.map((char, idx) => (
                            <div key={char.id} className="flex items-center justify-between bg-black/40 border border-white/5 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="text-[10px] text-neon-cyan font-mono w-6">#{idx + 1}</div>
                                    <div className="min-w-0">
                                        <div className="text-sm text-white font-bold truncate">{char.name}</div>
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest truncate">{char.class}</div>
                                    </div>
                                </div>
                                <div className="text-right text-[10px] text-gray-400">
                                    <div>Runs {char.runsCompleted ?? 0}</div>
                                    <div>Depth {char.deepestLevel ?? 0}</div>
                                </div>
                            </div>
                        ))}
                        {ranked.length === 0 && (
                            <div className="text-xs text-gray-500">No roster data yet.</div>
                        )}
                    </div>

                    <div className="mt-6 border-t border-white/10 pt-4">
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
            </div >
        </div >
    );
}
