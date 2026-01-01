import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeckGenerator } from "@/lib/game/cards";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { gameId } = await req.json();

        // 1. Get Game & Player
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const character = user?.characters[0];
        if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });

        const player = await (prisma as any).gamePlayer.findFirst({
            where: { gameId, characterId: character.id }
        });
        if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

        // 2. Generate Cards
        const deck = DeckGenerator.generateDeck();
        const hand = deck.splice(0, 7); // Deal 7 fresh cards

        // 3. Update Player Hand
        await (prisma as any).gamePlayer.update({
            where: { id: player.id },
            data: { hand: JSON.stringify(hand) }
        });

        return NextResponse.json({ success: true, hand });

    } catch (e) {
        console.error("Debug Deal Error:", e);
        return NextResponse.json({ error: "Failed to deal" }, { status: 500 });
    }
}
