import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Box, Shield, Zap, Activity } from "lucide-react";
import CurrencyDisplay from "@/components/ui/CurrencyDisplay";

import CharacterProfile from "@/components/character/CharacterProfile";

export default async function CharacterViewPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) redirect("/");

    let user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: {
            characters: {
                include: {
                    inventory: {
                        include: { item: true }
                    }
                }
            }
        }
    });

    if (!user || user.characters.length === 0) {
        redirect("/character/create");
    }

    const character = user.characters[0];

    // Parse stats
    let stats = { str: 10, agi: 10, int: 10 };
    try {
        stats = JSON.parse(character.stats);
    } catch (e) { }

    return (
        <div className="min-h-screen p-4 md:p-8 flex flex-col items-center pt-24">
            <div className="w-full max-w-6xl">
                <header className="flex items-center justify-between mb-8">
                    <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors">
                        <ArrowLeft className="mr-2 h-5 w-5" /> Back to Bridge
                    </Link>
                    <div className="flex items-center gap-4">
                        <CurrencyDisplay credits={character.credits} voidTokens={character.voidTokens} />
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* Left Column: Profile Card */}
                    <div className="lg:col-span-4 space-y-6">
                        <CharacterProfile character={character} />

                        {/* Stats Panel (Moved here for better layout) */}
                        <div className="glass-panel p-6 rounded-xl border-t-2 border-neon-blue">
                            <h2 className="text-xl font-bold text-neon-blue mb-4 flex items-center uppercase tracking-wider text-sm">
                                <Activity className="mr-2 w-4 h-4" /> Biometric Vitals
                            </h2>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center bg-black/30 p-2 px-3 rounded text-xs uppercase ">
                                    <span className="text-gray-400">Strength</span>
                                    <div className="h-1.5 w-24 bg-gray-800 rounded-full overflow-hidden">
                                        <div style={{ width: `${stats.str * 5}%` }} className="h-full bg-red-500" />
                                    </div>
                                    <span className="font-mono text-white">{stats.str}</span>
                                </div>
                                <div className="flex justify-between items-center bg-black/30 p-2 px-3 rounded text-xs uppercase ">
                                    <span className="text-gray-400">Agility</span>
                                    <div className="h-1.5 w-24 bg-gray-800 rounded-full overflow-hidden">
                                        <div style={{ width: `${stats.agi * 5}%` }} className="h-full bg-green-500" />
                                    </div>
                                    <span className="font-mono text-white">{stats.agi}</span>
                                </div>
                                <div className="flex justify-between items-center bg-black/30 p-2 px-3 rounded text-xs uppercase ">
                                    <span className="text-gray-400">Intellect</span>
                                    <div className="h-1.5 w-24 bg-gray-800 rounded-full overflow-hidden">
                                        <div style={{ width: `${stats.int * 5}%` }} className="h-full bg-blue-500" />
                                    </div>
                                    <span className="font-mono text-white">{stats.int}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Inventory & Loadout */}
                    <div className="lg:col-span-8 space-y-6">
                        <div className="glass-panel p-6 rounded-xl border-t-2 border-neon-cyan relative min-h-[500px]">
                            <h2 className="text-xl font-bold text-neon-cyan mb-6 flex items-center uppercase tracking-wider text-sm">
                                <Box className="mr-2 w-4 h-4" /> Cargo Manifest
                            </h2>
                            {character.inventory.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {character.inventory.map((entry) => (
                                        <div key={entry.id} className="flex items-center gap-3 p-3 bg-black/40 border border-white/5 rounded-lg hover:bg-white/5 transition-colors group">
                                            {/* Item Icon */}
                                            <div className="w-12 h-12 bg-black/60 rounded flex items-center justify-center shrink-0 border border-white/10 overflow-hidden relative">
                                                {(entry.customImage || entry.item.icon)?.startsWith('/items/') ? (
                                                    <img src={entry.customImage || entry.item.icon} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-xl font-bold text-gray-600">{entry.item.name[0]}</span>
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className={`font-medium truncate ${entry.item.rarity === 'Legendary' ? 'text-neon-magenta' :
                                                        entry.item.rarity === 'Epic' ? 'text-purple-400' :
                                                            entry.item.rarity === 'Rare' ? 'text-neon-blue' : 'text-white'
                                                    }`}>
                                                    {entry.item.name}
                                                </div>
                                                <div className="text-[10px] text-gray-400 truncate uppercase mt-0.5">
                                                    {entry.visualTraits || entry.item.type}
                                                </div>
                                            </div>
                                            <div className="text-sm font-mono text-gray-500 bg-black/80 px-2 py-1 rounded border border-white/5">
                                                x{entry.quantity}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 opacity-50">
                                    <Box className="h-16 w-16 mb-2" />
                                    <p>Cargo Hold Empty</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
