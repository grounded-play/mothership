import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { listingId } = await req.json();

        // Get Buyer
        const buyerUser = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const buyer = buyerUser?.characters[0];
        if (!buyer) return NextResponse.json({ error: "No character" }, { status: 404 });

        // Get Listing
        const listing = await (prisma as any).marketListing.findUnique({
            where: { id: listingId },
            include: { seller: true }
        });

        if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
        if (listing.sellerId === buyer.id) return NextResponse.json({ error: "Cannot buy your own listing" }, { status: 400 });

        // Check Funds
        const totalCost = listing.price; // Listings are sold as a whole unit in this MVP? Or per unit? UI says "Buy for X", usually implies total or per unit.
        // Let's assume the price in DB is PER UNIT? 
        // In my creating listing logic: "price" was just "price" and quantity was "quantity". 
        // Let's assume the UI shows TOTAL price for the WHOLE STACK for simplicity in this turn, OR price per unit.
        // Re-reading MarketListing schema: `price Int`.
        // Re-reading MarketInterface: `Buy for {listing.price}`.
        // Let's treat `listing.price` as the TOTAL price for the stack for simplified trading.
        const buyerAny = buyer as any; // Bypass stale types

        if (buyerAny.credits < totalCost) return NextResponse.json({ error: "Insufficient credits" }, { status: 400 });

        // Transaction
        await prisma.$transaction(async (tx) => {
            const txn = tx as any; // Bypass stale types

            // 1. Transfer Credits
            await txn.character.update({
                where: { id: buyer.id },
                data: { credits: { decrement: totalCost } }
            });

            await txn.character.update({
                where: { id: listing.sellerId },
                data: { credits: { increment: totalCost } }
            });

            // 2. Record Transaction
            await txn.marketTransaction.create({
                data: {
                    sellerId: listing.sellerId,
                    buyerId: buyer.id,
                    itemId: listing.itemId,
                    price: totalCost,
                    currency: listing.currency
                }
            });

            // 3. Transfer Item (Create new instance for buyer)
            if (listing.instanceStats || listing.visualTraits) {
                await txn.inventoryItem.create({
                    data: {
                        characterId: buyer.id,
                        itemId: listing.itemId,
                        quantity: listing.quantity,
                        instanceStats: listing.instanceStats,
                        visualTraits: listing.visualTraits,
                        customImage: listing.customImage
                    }
                });
            } else {
                // Try to stack generic items
                const existingStack = await txn.inventoryItem.findFirst({
                    where: {
                        characterId: buyer.id,
                        itemId: listing.itemId,
                        instanceStats: null,
                        visualTraits: null,
                        customImage: null
                    }
                });

                if (existingStack) {
                    await txn.inventoryItem.update({
                        where: { id: existingStack.id },
                        data: { quantity: { increment: listing.quantity } }
                    });
                } else {
                    await txn.inventoryItem.create({
                        data: {
                            characterId: buyer.id,
                            itemId: listing.itemId,
                            quantity: listing.quantity
                        }
                    });
                }
            }

            // 4. Delete Listing
            await txn.marketListing.delete({ where: { id: listing.id } });
        });

        return NextResponse.json({ success: true });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Transaction Failed" }, { status: 500 });
    }
}
