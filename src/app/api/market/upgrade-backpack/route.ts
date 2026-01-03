import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const BACKPACK_UPGRADE_COSTS: Record<number, number> = {
    1: 2000,
    2: 5000
};

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const character = user?.characters[0];
        if (!character) return NextResponse.json({ error: "No character" }, { status: 404 });

        const currentLevel = character.backpackLevel ?? 1;
        if (currentLevel >= 3) {
            return NextResponse.json({ error: "Backpack already at max level." }, { status: 400 });
        }

        const cost = BACKPACK_UPGRADE_COSTS[currentLevel];
        if (character.credits < cost) {
            return NextResponse.json({ error: "Insufficient credits." }, { status: 400 });
        }

        const updated = await prisma.character.update({
            where: { id: character.id },
            data: {
                backpackLevel: currentLevel + 1,
                credits: { decrement: cost }
            }
        });

        return NextResponse.json({
            success: true,
            backpackLevel: updated.backpackLevel,
            credits: updated.credits,
            cost
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Upgrade failed" }, { status: 500 });
    }
}
