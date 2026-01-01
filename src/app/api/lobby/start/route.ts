import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GameEngine } from "@/lib/game/engine";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { lobbyId } = await req.json();
        const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { characters: true } });
        const character = user?.characters[0];

        const lobby = await (prisma as any).gameLobby.findUnique({ where: { id: lobbyId } });

        if (lobby.hostId !== character?.id) return NextResponse.json({ error: "Only host can start" }, { status: 403 });

        await (prisma as any).gameLobby.update({
            where: { id: lobbyId },
            data: { status: "IN_PROGRESS" }
        });

        // Initialize Game State
        await GameEngine.initializeGame(lobbyId);

        return NextResponse.json({ success: true });

    } catch (e) {
        return NextResponse.json({ error: "Failed to start" }, { status: 500 });
    }
}
