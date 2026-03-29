"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Shield, Zap, User, Crosshair, X, ExternalLink } from "lucide-react";
import SafeImage from "@/components/ui/SafeImage";
import { useRouter } from "next/navigation";

type CharacterStats = Record<string, unknown>;

interface Character {
    id: string;
    name: string;
    class: string;
    level: number;
    portrait?: string;
    credits?: number;
    voidTokens?: number;
    stats?: string | CharacterStats | null;
    runsCompleted?: number;
    runsFailed?: number;
    deathCount?: number;
    deepestLevel?: number;
}

interface RosterInterfaceProps {
    initialCharacters: Character[];
    currentCharacterId?: string | null;
}

const parseStats = (stats: Character["stats"]): CharacterStats => {
    try {
        return typeof stats === "string" ? JSON.parse(stats) : stats || {};
    } catch {
        return {};
    }
};

export default function RosterInterface({ initialCharacters, currentCharacterId = null }: RosterInterfaceProps) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedClass, setSelectedClass] = useState<string | null>(null);
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

    const filteredCharacters = initialCharacters.filter(char => {
        const matchesSearch = char.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesClass = selectedClass ? char.class.toLowerCase() === selectedClass.toLowerCase() : true;
        return matchesSearch && matchesClass;
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

    const openCharacter = (char: Character) => {
        if (currentCharacterId && char.id === currentCharacterId) {
            router.push("/character/view");
            return;
        }
        setSelectedCharacter(char);
    };

    const selectedStats = parseStats(selectedCharacter?.stats);

    return (
        <div className="mx-auto h-full min-h-0 w-full max-w-7xl">
            <div className="grid h-full min-h-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-8">
                <div className="flex min-h-0 flex-col gap-6 xl:gap-8">
                    {/* Control Panel */}
                    <div className="glass-panel flex shrink-0 flex-col items-center justify-between gap-6 rounded-xl border border-white/10 p-6 md:flex-row">

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
                    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-2">
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
                                        onClick={() => openCharacter(char)}
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
                                                        const stats = parseStats(char.stats);
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
                                                    } catch { return null; }
                                                })()}
                                            </div>
                                            <div className="mt-5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.24em] text-gray-300">
                                                {currentCharacterId === char.id ? "Open Full Dossier" : "Tap For Quick Dossier"}
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

                <aside className="glass-panel flex h-full min-h-0 flex-col rounded-xl border border-white/10 p-6">
                    <div className="flex-none">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Season Rankings</div>
                        <div className="text-xl font-bold text-white mt-1 mb-4">{seasonLabel}</div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 min-h-0">
                        {ranked.map((char, idx) => (
                            <button
                                type="button"
                                key={char.id}
                                onClick={() => openCharacter(char)}
                                className="flex w-full items-center justify-between bg-black/40 border border-white/5 rounded-lg px-3 py-2 hover:bg-white/5 transition-colors text-left cursor-pointer"
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
                            </button>
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

            <AnimatePresence>
                {selectedCharacter && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
                        onClick={() => setSelectedCharacter(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 24, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 18, scale: 0.96 }}
                            transition={{ duration: 0.2 }}
                            className="glass-panel relative w-full max-w-4xl rounded-3xl border border-white/10 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.65)]"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => setSelectedCharacter(null)}
                                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-300 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
                                aria-label="Close dossier"
                            >
                                <X className="h-4 w-4" />
                            </button>

                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                                <div className="space-y-4">
                                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/70">
                                        <div className="aspect-[3/4] w-full bg-black/60">
                                            <SafeImage
                                                src={selectedCharacter.portrait}
                                                alt={selectedCharacter.name}
                                                className="h-full w-full object-cover"
                                                fallback={
                                                    <div className="flex h-full items-center justify-center text-gray-600">
                                                        <User className="h-20 w-20 opacity-30" />
                                                    </div>
                                                }
                                            />
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                                        <div className="text-[10px] uppercase tracking-[0.28em] text-neon-cyan">Service Record</div>
                                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                                            <div>
                                                <div className="text-gray-500">Runs</div>
                                                <div className="font-mono text-white">{selectedCharacter.runsCompleted ?? 0}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">Fails</div>
                                                <div className="font-mono text-white">{selectedCharacter.runsFailed ?? 0}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">Deaths</div>
                                                <div className="font-mono text-white">{selectedCharacter.deathCount ?? 0}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">Depth</div>
                                                <div className="font-mono text-white">{selectedCharacter.deepestLevel ?? 0}m</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <div className="border-b border-white/10 pb-4 pr-10">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-3xl font-black uppercase tracking-tight text-white">{selectedCharacter.name}</h3>
                                            {selectedCharacter.name === "Amy" && (
                                                <span className="rounded-full border border-neon-cyan/40 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-neon-cyan">
                                                    Ship Guide
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-gray-400">
                                            <span>{selectedCharacter.class}</span>
                                            <span className="h-1 w-1 rounded-full bg-white/30" />
                                            <span>Level {selectedCharacter.level}</span>
                                            <span className="h-1 w-1 rounded-full bg-white/30" />
                                            <span className="font-mono text-neon-cyan">{selectedCharacter.credits ?? 0} CR</span>
                                            <span className="font-mono text-neon-magenta">{selectedCharacter.voidTokens ?? 0} VT</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-center">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-red-400">STR</div>
                                            <div className="mt-2 text-2xl font-black text-white">{selectedStats?.strength || selectedStats?.str || 0}</div>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-center">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-green-400">SPD</div>
                                            <div className="mt-2 text-2xl font-black text-white">{selectedStats?.speed || selectedStats?.agility || 0}</div>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-center">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-blue-400">INT</div>
                                            <div className="mt-2 text-2xl font-black text-white">{selectedStats?.intellect || selectedStats?.int || 0}</div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                                        <div className="text-[10px] uppercase tracking-[0.28em] text-neon-cyan">Quick Dossier</div>
                                        <div className="mt-3 space-y-2 text-sm text-gray-300">
                                            <div>This operator can be inspected from the roster without leaving the board.</div>
                                            <div className="text-gray-500">
                                                Click your own roster card if you want the full bridge dossier page instead of the quick view.
                                            </div>
                                        </div>
                                    </div>

                                    {currentCharacterId === selectedCharacter.id && (
                                        <button
                                            type="button"
                                            onClick={() => router.push("/character/view")}
                                            className="inline-flex items-center gap-2 rounded-full border border-neon-cyan/40 bg-cyan-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-neon-cyan transition-colors hover:border-neon-cyan hover:bg-cyan-500/15"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            Open Full Dossier
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

