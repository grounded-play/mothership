import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import RosterInterface from "@/components/roster/RosterInterface";
import AutoFitViewport from "@/components/layout/AutoFitViewport";

export default async function RosterPage() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) redirect("/");

    const viewer = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            id: true,
            characters: {
                select: { id: true },
                take: 1
            }
        }
    });

    if (!viewer) redirect("/");

    const charactersData = await prisma.character.findMany({
        select: {
            id: true,
            name: true,
            class: true,
            level: true,
            portrait: true,
            credits: true,
            voidTokens: true,
            stats: true,
            runsCompleted: true,
            runsFailed: true,
            deathCount: true,
            deepestLevel: true,
        },
        orderBy: { level: 'desc' }
    });

    const characters = charactersData.map(c => ({
        ...c,
        portrait: c.portrait || undefined
    }));

    return (
        <div className="flex h-full min-h-0 flex-col bg-space-void px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-4 xl:px-8">
            <div className="fixed left-4 top-4 z-50 sm:left-8 sm:top-6">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col">
                <AutoFitViewport contentKey={`roster-${characters.length}`}>
                    <div className="flex h-[700px] min-w-[1280px] w-full flex-col">
                        <header className="mb-6 flex shrink-0 items-center justify-between border-b border-white/5 pb-4 sm:mb-8">
                            <div className="flex items-center gap-2">
                                <Users className="w-5 h-5 text-neon-magenta" />
                                <span className="uppercase tracking-widest text-lg font-bold text-white">Active Roster</span>
                            </div>
                        </header>

                        <div className="mt-4 min-h-0 flex-1 sm:mt-8">
                            <RosterInterface
                                initialCharacters={characters}
                                currentCharacterId={viewer.characters[0]?.id ?? null}
                            />
                        </div>
                    </div>
                </AutoFitViewport>
            </div>
        </div>
    );
}
