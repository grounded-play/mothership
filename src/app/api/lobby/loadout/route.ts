import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const normalizeSlot = (slot?: string | null) => {
    if (!slot) return null;
    const key = slot.toUpperCase();
    if (key === "WEAPON") return "WEAPON";
    if (key === "ARMOR") return "ARMOR";
    return null;
};

const getItemSlot = (item: any) => {
    if (item.equipSlot) return item.equipSlot.toUpperCase();
    if ((item.type || "").toLowerCase() === "weapon") return "WEAPON";
    const type = (item.type || "").toLowerCase();
    if (type === "armor" || type.includes("suit")) return "ARMOR";
    return null;
};

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lobbyId, slot, inventoryItemId } = await req.json();
    const desiredSlot = normalizeSlot(slot);
    if (!lobbyId || !desiredSlot) {
        return NextResponse.json({ error: "Missing lobbyId or slot" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { characters: true }
    });
    const character = user?.characters[0];
    if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });

    const membership = await (prisma as any).lobbyMember.findFirst({
        where: { lobbyId, characterId: character.id }
    });
    if (!membership) return NextResponse.json({ error: "Not in lobby" }, { status: 403 });

    const inventory = await prisma.inventoryItem.findMany({
        where: { characterId: character.id },
        include: { item: true }
    });

    const slotItems = inventory.filter(inv => getItemSlot(inv.item) === desiredSlot);
    for (const inv of slotItems) {
        if (inv.isEquipped) {
            await prisma.inventoryItem.update({
                where: { id: inv.id },
                data: { isEquipped: false }
            });
        }
    }

    if (inventoryItemId) {
        const target = inventory.find(inv => inv.id === inventoryItemId);
        if (!target) return NextResponse.json({ error: "Item not found" }, { status: 404 });
        const itemSlot = getItemSlot(target.item);
        if (itemSlot !== desiredSlot) {
            return NextResponse.json({ error: "Item slot mismatch" }, { status: 400 });
        }

        await prisma.inventoryItem.update({
            where: { id: target.id },
            data: { isEquipped: true }
        });
    }

    return NextResponse.json({ success: true });
}
