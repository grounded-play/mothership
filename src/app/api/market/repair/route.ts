import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { inventoryItemId } = await req.json();
        if (!inventoryItemId) {
            return NextResponse.json({ error: "Missing inventoryItemId" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const character = user?.characters[0];
        if (!character) return NextResponse.json({ error: "No character" }, { status: 404 });

        const target = await (prisma as any).inventoryItem.findUnique({
            where: { id: inventoryItemId },
            include: { item: true }
        });
        if (!target || target.characterId !== character.id) {
            return NextResponse.json({ error: "Item not found" }, { status: 404 });
        }

        const maxUses = target.usesMax ?? target.item?.maxUses ?? null;
        if (!maxUses) {
            return NextResponse.json({ error: "Item is not repairable" }, { status: 400 });
        }
        const remaining = target.usesRemaining ?? maxUses;
        if (remaining >= maxUses) {
            return NextResponse.json({ error: "Item already fully repaired" }, { status: 400 });
        }

        const scrapItem = await prisma.item.findUnique({ where: { name: "Scrap Metal" } });
        if (!scrapItem) {
            return NextResponse.json({ error: "Scrap item missing" }, { status: 500 });
        }

        const scrapStack = await (prisma as any).inventoryItem.findFirst({
            where: { characterId: character.id, itemId: scrapItem.id }
        });
        if (!scrapStack || scrapStack.quantity < maxUses) {
            return NextResponse.json({ error: "Not enough scrap" }, { status: 400 });
        }

        await prisma.$transaction(async (tx) => {
            if (scrapStack.quantity === maxUses) {
                await (tx as any).inventoryItem.delete({ where: { id: scrapStack.id } });
            } else {
                await (tx as any).inventoryItem.update({
                    where: { id: scrapStack.id },
                    data: { quantity: { decrement: maxUses } }
                });
            }

            await (tx as any).inventoryItem.update({
                where: { id: target.id },
                data: { usesRemaining: maxUses, usesMax: maxUses }
            });
        });

        return NextResponse.json({
            success: true,
            usesRemaining: maxUses,
            scrapRemaining: Math.max(0, scrapStack.quantity - maxUses)
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Repair failed" }, { status: 500 });
    }
}
