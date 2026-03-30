import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Box, Shield, Activity } from "lucide-react";
import CurrencyDisplay from "@/components/ui/CurrencyDisplay";
import AutoFitViewport from "@/components/layout/AutoFitViewport";

import CharacterProfile from "@/components/character/CharacterProfile";
import InventoryInspect from "@/components/character/InventoryInspect";

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

    if (!user) {
        redirect("/");
    }

    if (user.characters.length === 0) {
        redirect("/character/create");
    }

    const character = user.characters[0];
    const scrapCount = character.inventory?.find((inv: any) => inv.item?.name === "Scrap Metal")?.quantity ?? 0;
    const pasteCount = character.inventory?.find((inv: any) => inv.item?.name === "Nutrient Paste")?.quantity ?? 0;
    const runsFailed = (character as any).runsFailed ?? 0;

    // Parse stats
    let stats = { str: 10, agi: 10, int: 10 };
    try {
        stats = JSON.parse(character.stats);
    } catch (e) { }

    return (
        <div className="relative flex h-full min-h-0 flex-col bg-space-void px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-4 xl:px-8">
            <div className="fixed left-4 top-4 z-50 sm:left-8 sm:top-6">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <div className="mx-auto flex h-full min-h-0 w-full max-w-[1320px] flex-col">
                <AutoFitViewport contentKey={`character-view-${character.id}`}>
                    <div className="flex h-[640px] min-w-[1180px] w-full flex-col">
                        <header className="mb-4 flex shrink-0 justify-end border-b border-white/10 pb-3">
                            <div className="flex items-center gap-4">
                                <CurrencyDisplay credits={character.credits} voidTokens={character.voidTokens} scrap={scrapCount} paste={pasteCount} />
                            </div>
                        </header>

                        <div className="grid min-h-0 flex-1 grid-cols-12 gap-5">

                            {/* Left Column: Profile Card */}
                            <div className="col-span-4 grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
                                <CharacterProfile character={character} />

                                {/* Stats Panel (Moved here for better layout) */}
                                <div className="glass-panel rounded-xl border-t-2 border-neon-blue p-4">
                                    <h2 className="mb-3 flex items-center text-sm font-bold uppercase tracking-wider text-neon-blue">
                                        <Activity className="mr-2 h-4 w-4" /> Biometric Vitals
                                    </h2>
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between rounded bg-black/30 p-2 px-3 text-xs uppercase ">
                                            <span className="text-gray-400">Strength</span>
                                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-800">
                                                <div style={{ "--w": `${stats.str * 5}%` } as React.CSSProperties} className="h-full w-[var(--w)] bg-red-500" />
                                            </div>
                                            <span className="font-mono text-white">{stats.str}</span>
                                        </div>
                                        <div className="flex items-center justify-between rounded bg-black/30 p-2 px-3 text-xs uppercase ">
                                            <span className="text-gray-400">Agility</span>
                                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-800">
                                                <div style={{ "--w": `${stats.agi * 5}%` } as React.CSSProperties} className="h-full w-[var(--w)] bg-green-500" />
                                            </div>
                                            <span className="font-mono text-white">{stats.agi}</span>
                                        </div>
                                        <div className="flex items-center justify-between rounded bg-black/30 p-2 px-3 text-xs uppercase ">
                                            <span className="text-gray-400">Intellect</span>
                                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-800">
                                                <div style={{ "--w": `${stats.int * 5}%` } as React.CSSProperties} className="h-full w-[var(--w)] bg-blue-500" />
                                            </div>
                                            <span className="font-mono text-white">{stats.int}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="glass-panel flex min-h-0 flex-col rounded-xl border-t-2 border-neon-cyan p-4">
                                    <h2 className="mb-3 flex items-center text-sm font-bold uppercase tracking-wider text-neon-cyan">
                                        <Shield className="mr-2 h-4 w-4" /> Service Record
                                    </h2>
                                    <div className="flex flex-1 flex-col justify-center space-y-3 text-xs text-gray-300">
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
                            <div className="col-span-8 min-h-0">
                                <div className="glass-panel relative flex h-full min-h-0 flex-col rounded-xl border-t-2 border-neon-cyan p-4">
                                    <h2 className="mb-4 flex items-center text-sm font-bold uppercase tracking-wider text-neon-cyan">
                                        <Box className="mr-2 h-4 w-4" /> Cargo Manifest
                                    </h2>
                                    <InventoryInspect inventory={character.inventory} />
                                </div>
                            </div>
                        </div>
                    </div>
                </AutoFitViewport>
            </div>
        </div>
    );
}
