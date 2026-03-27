import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Box, Shield, Activity, FileText } from "lucide-react";
import CurrencyDisplay from "@/components/ui/CurrencyDisplay";

import CharacterProfile from "@/components/character/CharacterProfile";
import InventoryInspect from "@/components/character/InventoryInspect";

export default async function CharacterViewPage({ searchParams }: { searchParams: { id?: string } }) {
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

    if (!user) {
        redirect("/");
    }

    if (user.characters.length === 0) {
        redirect("/character/create");
    }

    // Check if a specific character ID is provided in query params
    const characterId = searchParams.id;
    let character = user.characters[0];

    if (characterId) {
        const found = user.characters.find((c: any) => c.id === characterId);
        if (!found) {
            notFound();
        }
        character = found;
    }

    const scrapCount = character.inventory?.find((inv: any) => inv.item?.name === "Scrap Metal")?.quantity ?? 0;
    const pasteCount = character.inventory?.find((inv: any) => inv.item?.name === "Nutrient Paste")?.quantity ?? 0;
    const runsFailed = (character as any).runsFailed ?? 0;

    // Parse stats
    let stats = { str: 10, agi: 10, int: 10 };
    try {
        stats = JSON.parse(character.stats);
    } catch (e) { }

    return (
        <div className="min-h-full p-4 md:p-8 flex flex-col items-center pt-24 bg-space-void relative">
            <div className="fixed top-6 left-8 z-50">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <div className="w-full max-w-6xl">
                <header className="flex items-center justify-end mb-8">
                    <div className="flex items-center gap-4">
                        <CurrencyDisplay credits={character.credits} voidTokens={character.voidTokens} scrap={scrapCount} paste={pasteCount} />
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* Left Column: Profile Card */}
                    <div className="lg:col-span-4 space-y-6">
                        <CharacterProfile character={character} isTutorialGuide={character.name === 'Amy'} />

                        {/* Stats Panel (Moved here for better layout) */}
                        <div className="glass-panel p-6 rounded-xl border-t-2 border-neon-blue">
                            <h2 className="text-xl font-bold text-neon-blue mb-4 flex items-center uppercase tracking-wider text-sm">
                                <Activity className="mr-2 w-4 h-4" /> Biometric Vitals
                            </h2>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center bg-black/30 p-2 px-3 rounded text-xs uppercase ">
                                    <span className="text-gray-400">Strength</span>
                                    <div className="h-1.5 w-24 bg-gray-800 rounded-full overflow-hidden">
                                        <div style={{ "--w": `${stats.str * 5}%` } as React.CSSProperties} className="h-full bg-red-500 w-[var(--w)]" />
                                    </div>
                                    <span className="font-mono text-white">{stats.str}</span>
                                </div>
                                <div className="flex justify-between items-center bg-black/30 p-2 px-3 rounded text-xs uppercase ">
                                    <span className="text-gray-400">Agility</span>
                                    <div className="h-1.5 w-24 bg-gray-800 rounded-full overflow-hidden">
                                        <div style={{ "--w": `${stats.agi * 5}%` } as React.CSSProperties} className="h-full bg-green-500 w-[var(--w)]" />
                                    </div>
                                    <span className="font-mono text-white">{stats.agi}</span>
                                </div>
                                <div className="flex justify-between items-center bg-black/30 p-2 px-3 rounded text-xs uppercase ">
                                    <span className="text-gray-400">Intellect</span>
                                    <div className="h-1.5 w-24 bg-gray-800 rounded-full overflow-hidden">
                                        <div style={{ "--w": `${stats.int * 5}%` } as React.CSSProperties} className="h-full bg-blue-500 w-[var(--w)]" />
                                    </div>
                                    <span className="font-mono text-white">{stats.int}</span>
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel p-6 rounded-xl border-t-2 border-neon-cyan">
                            <h2 className="text-xl font-bold text-neon-cyan mb-4 flex items-center uppercase tracking-wider text-sm">
                                <Shield className="mr-2 w-4 h-4" /> Roster Record
                            </h2>
                            <div className="space-y-2 text-xs text-gray-300">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Runs Completed</span>
                                    <span className="font-mono text-white">{character.runsCompleted}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Runs Failed</span>
                                    <span className="font-mono text-white">{runsFailed}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Death Count</span>
                                    <span className="font-mono text-white">{character.deathCount}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Deepest Level</span>
                                    <span className="font-mono text-white">{character.deepestLevel}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Inventory & Loadout */}
                    <div className="lg:col-span-8 space-y-6">
                        {/* Dossier Panel */}
                        <div className="glass-panel p-6 rounded-xl border-t-2 border-neon-cyan">
                            <h2 className="text-xl font-bold text-neon-cyan mb-4 flex items-center uppercase tracking-wider text-sm">
                                <FileText className="mr-2 w-4 h-4" /> Personnel Dossier
                            </h2>
                            <div className="space-y-4">
                                {character.loreNotes && (
                                    <div>
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Lore Notes</div>
                                        <p className="text-xs text-gray-300 font-mono">{character.loreNotes}</p>
                                    </div>
                                )}
                                <div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Special Trait</div>
                                    <p className="text-xs text-gray-300 font-mono">{typeof character.loadoutContext === 'string' ? JSON.parse(character.loadoutContext).specialTrait : (character.loadoutContext as any)?.specialTrait || "N/A"}</p>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Backpack</div>
                                    <div className="flex flex-wrap gap-1">
                                        {(typeof character.loadoutContext === 'string' ? JSON.parse(character.loadoutContext).backpack : (character.loadoutContext as any)?.backpack || []).map((item: string, idx: number) => (
                                            <span key={idx} className="bg-black/40 border border-white/5 rounded px-2 py-1 text-xs text-neon-cyan font-mono">{item}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel p-6 rounded-xl border-t-2 border-neon-cyan relative min-h-[500px]">
                            <h2 className="text-xl font-bold text-neon-cyan mb-6 flex items-center uppercase tracking-wider text-sm">
                                <Box className="mr-2 w-4 h-4" /> Cargo Manifest
                            </h2>
                            <InventoryInspect inventory={character.inventory} />
                        </div>
                    </div>
                    {/* Right Column: Inventory & Loadout */}
                    <div className="lg:col-span-8 space-y-6">
                        <div className="glass-panel p-6 rounded-xl border-t-2 border-neon-cyan relative min-h-[500px]">
                            <h2 className="text-xl font-bold text-neon-cyan mb-6 flex items-center uppercase tracking-wider text-sm">
                                <Box className="mr-2 w-4 h-4" /> Cargo Manifest
                            </h2>
                            <InventoryInspect inventory={character.inventory} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
