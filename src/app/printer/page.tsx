import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PrinterInterface from "@/components/market/PrinterInterface";

export default async function PrinterPage() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) redirect("/");

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { characters: { include: { inventory: { include: { item: true } } } } as any }
    });

    if (!user || (user as any).characters.length === 0) redirect("/character/create");
    const character = (user as any).characters[0];

    // Fetch Global Queue (All items from ANY player waiting for visualization)
    const globalQueue = await (prisma as any).inventoryItem.findMany({
        where: {
            customImage: null,
            NOT: { instanceStats: null }
        },
        include: { item: true, character: { select: { name: true } } },
        orderBy: {
            id: 'desc'
        }
    });

    return (
        <div className="min-h-screen bg-black">
            <div className="fixed top-6 left-8 z-50">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <PrinterInterface
                credits={(character as any).credits}
                inventory={(character as any).inventory}
                backpackLevel={(character as any).backpackLevel ?? 1}
                globalQueue={globalQueue}
            />
        </div>
    );
}
