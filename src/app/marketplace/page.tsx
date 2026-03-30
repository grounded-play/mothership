import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import MarketInterface from "@/components/market/MarketInterface";
import AutoFitViewport from "@/components/layout/AutoFitViewport";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function MarketplacePage() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) redirect("/");

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { characters: { include: { inventory: { include: { item: true } } } } }
    });

    if (!user) redirect("/");
    if (user.characters.length === 0) redirect("/character/create");
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
        <div className="flex h-full min-h-0 flex-col bg-space-void px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-4 xl:px-8">
            <div className="fixed left-4 top-4 z-50 sm:left-8 sm:top-6">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col">
                <AutoFitViewport contentKey={`market-${listings.length}-${character.inventory.length}`}>
                    <div className="flex h-[700px] min-w-[1280px] w-full flex-col">
                        <MarketInterface
                            initialListings={listings}
                            userInventory={character.inventory}
                            credits={character.credits}
                            voidTokens={character.voidTokens}
                        />
                    </div>
                </AutoFitViewport>
            </div>
        </div>
    );
}
