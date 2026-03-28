import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import RosterInterface from "@/components/roster/RosterInterface";

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
        <div className="min-h-full bg-space-void p-8 pt-24">
            <div className="fixed top-6 left-8 z-50">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <div className="max-w-6xl mx-auto">
                <header className="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-neon-magenta" />
                        <span className="uppercase tracking-widest text-lg font-bold text-white">Active Roster</span>
                    </div>
                </header>

            <div className="mt-8">
                <RosterInterface
                    initialCharacters={characters}
                    currentCharacterId={viewer.characters[0]?.id ?? null}
                />
            </div>
          </div>
        </div>
    );
}
