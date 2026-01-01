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
        },
        orderBy: { level: 'desc' }
    });

    const characters = charactersData.map(c => ({
        ...c,
        portrait: c.portrait || undefined
    }));

    return (
        <div className="min-h-screen p-8 pt-24">
            <header className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-md border-b border-white/5 p-4 px-8 flex items-center justify-between">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors group">
                    <ArrowLeft className="mr-2 h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="uppercase tracking-widest text-sm font-bold">Bridge</span>
                </Link>
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-neon-magenta" />
                    <span className="uppercase tracking-widest text-sm font-bold text-white">Active Roster</span>
                </div>
            </header>

            <div className="mt-8">
                <RosterInterface initialCharacters={characters} />
            </div>
        </div>
    );
}
