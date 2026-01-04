import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePrinterWorker } from "@/lib/printerWorker";

export const runtime = "nodejs";

ensurePrinterWorker();

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const SPIN_COST = 100;

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });

        const character = user?.characters[0];
        if (!character) return NextResponse.json({ error: "No character found" }, { status: 404 });

        if ((character as any).credits < SPIN_COST) {
            return NextResponse.json({ error: "Insufficient funds" }, { status: 400 });
        }

        // RNG Logic
        // We need to fetch potential items first.
        const allItems = await (prisma as any).item.findMany();
        if (allItems.length === 0) return NextResponse.json({ error: "No items in database" }, { status: 500 });

        const rollRarity = () => {
            const roll = Math.random();
            if (roll > 0.97) return "Legendary"; // 3%
            if (roll > 0.8) return "Epic"; // 17%
            if (roll > 0.4) return "Rare"; // 40%
            return "Common"; // 40%
        };

        const itemRarity = rollRarity();
        const printRarity = rollRarity();

        // Filter items by rarity (fallback to common if none found in high tiers)
        let pool = allItems.filter((i: any) => i.rarity === itemRarity);
        if (pool.length === 0) pool = allItems.filter((i: any) => i.rarity === "Common");

        // Ensure class/suit gear is always in the prize pool for fabricate
        const classGear = allItems.filter((i: any) =>
            (i.type === "Weapon" || i.type === "Armor") &&
            i.suit &&
            i.classTag
        );
        if (classGear.length > 0) {
            const existing = new Set(pool.map((i: any) => i.id));
            const injected = classGear.filter((i: any) => !existing.has(i.id));
            pool = pool.concat(injected);
        }

        const rewardItem = pool[Math.floor(Math.random() * pool.length)];

        // Execute Transaction
        const result = await prisma.$transaction(async (tx) => {
            // Deduct Credits
            const updatedChar = await tx.character.update({
                where: { id: character.id },
                data: { credits: { decrement: SPIN_COST } } as any
            });

            // Add Item
            let invItem;

            // Unique Items Logic (Weapons/Armor)
            if (rewardItem.type === 'Weapon' || rewardItem.type === 'Armor') {
                const { rollStats, rollTraits } = await import("@/lib/mothership_rpg");
                const stats = rollStats(rewardItem.type);
                const traits = rollTraits(rewardItem.type);
                const printTraits = `${traits}, ${printRarity} print`;

                invItem = await (tx as any).inventoryItem.create({
                    data: {
                        characterId: character.id,
                        itemId: rewardItem.id,
                        quantity: 1,
                        instanceStats: JSON.stringify(stats),
                        visualTraits: printTraits,
                        imageStatus: "QUEUED",
                        usesRemaining: rewardItem.maxUses ?? null,
                        usesMax: rewardItem.maxUses ?? null
                    },
                    include: { item: true }
                });

            } else {
                // Stackable Logic (Materials, Consumables)
                // Note: We removed the unique constraint, so we must manually find the existing stack.
                const existing = await (tx as any).inventoryItem.findFirst({
                    where: {
                        characterId: character.id,
                        itemId: rewardItem.id,
                        // Ensure we only stack "generic" items (no unique stats)
                        instanceStats: null
                    }
                });

                if (existing) {
                    invItem = await (tx as any).inventoryItem.update({
                        where: { id: existing.id },
                        data: { quantity: { increment: 1 } },
                        include: { item: true }
                    });
                } else {
                    invItem = await (tx as any).inventoryItem.create({
                        data: {
                            characterId: character.id,
                            itemId: rewardItem.id,
                            quantity: 1
                        },
                        include: { item: true }
                    });
                }
            }

            return { character: updatedChar, newItem: invItem };
        });

        return NextResponse.json({
            success: true,
            reward: result.newItem.item,
            rewardInstance: result.newItem,
            credits: (result.character as any).credits,
            printRarity,
            itemRarity
        });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
