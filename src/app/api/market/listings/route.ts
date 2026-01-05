import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const listings = await prisma.marketListing.findMany({
        include: {
            seller: { select: { name: true } },
            item: true
        },
        orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(listings);
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { itemId, inventoryItemId, quantity, price, currency } = await req.json();

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const character = user?.characters[0];
        if (!character) return NextResponse.json({ error: "No character" }, { status: 404 });

        // Validate ownership
        // If inventoryItemId is provided (Unique Item or specific stack), use that.
        // Otherwise try to find a generic stack (legacy/fallback).

        let inventoryItem;
        if (inventoryItemId) {
            inventoryItem = await prisma.inventoryItem.findUnique({
                where: { id: inventoryItemId },
                include: { item: true }
            });
        }

        // Fallback: Try to find ANY item with this itemId owned by user (dangerous for unique items, but ok for stacks)
        if (!inventoryItem) {
            inventoryItem = await prisma.inventoryItem.findFirst({
                where: { characterId: character.id, itemId: itemId },
                include: { item: true }
            });
        }

        if (!inventoryItem || inventoryItem.characterId !== character.id) {
            return NextResponse.json({ error: "Item not owned" }, { status: 403 });
        }

        const isStackableSale = inventoryItem.item.type === "Material" || inventoryItem.item.type === "Consumable";
        const requestedQty = Number.isFinite(Number(quantity)) ? Number(quantity) : 1;
        const normalizedQty = isStackableSale ? Math.max(1, Math.min(requestedQty, inventoryItem.quantity)) : 1;

        if (inventoryItem.quantity < normalizedQty) {
            return NextResponse.json({ error: "Insufficient quantity" }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Remove from inventory
            if (inventoryItem.quantity === normalizedQty) {
                await tx.inventoryItem.delete({ where: { id: inventoryItem.id } });
            } else {
                await tx.inventoryItem.update({
                    where: { id: inventoryItem.id },
                    data: { quantity: { decrement: normalizedQty } }
                });
            }

            // Create market listing
            const listing = await tx.marketListing.create({
                data: {
                    sellerId: character.id,
                    itemId: inventoryItem.itemId,
                    quantity: normalizedQty,
                    price,
                    currency,
                    // Copy Unique Stats
                    instanceStats: inventoryItem.instanceStats,
                    visualTraits: inventoryItem.visualTraits,
                    customImage: inventoryItem.customImage
                }
            });

            return listing;
        });

        return NextResponse.json(result);

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
