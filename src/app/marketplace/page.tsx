import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import MarketInterface from "@/components/market/MarketInterface";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function MarketplacePage() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) redirect("/");

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { characters: { include: { inventory: { include: { item: true } } } } }
    });

    if (!user || user.characters.length === 0) redirect("/character/create");
    const character = user.characters[0];

    // Fetch Listings
    const listings = await prisma.marketListing.findMany({
        include: {
            item: true,
            seller: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' }
    });

    return (
        <div className="min-h-full bg-space-void">
            <div className="fixed top-6 left-8 z-50">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <MarketInterface
                initialListings={listings}
                userInventory={character.inventory}
                credits={character.credits}
                voidTokens={character.voidTokens}
            />
        </div>
    );
}
