import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { lobbyId } = await req.json();
        const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { characters: true } });
        const character = user?.characters[0];

        if (!character) return NextResponse.json({ error: "No character" }, { status: 404 });

        const lobby = await (prisma as any).gameLobby.findUnique({ where: { id: lobbyId } });
        if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });

        // If Host leaves, delete lobby
        if (lobby.hostId === character.id) {
            await (prisma as any).gameLobby.delete({ where: { id: lobbyId } });
        } else {
            // Remove member
            await (prisma as any).lobbyMember.deleteMany({
                where: {
                    lobbyId: lobbyId,
                    characterId: character.id
                }
            });
        }

        return NextResponse.json({ success: true });

    } catch (e) {
        return NextResponse.json({ error: "Failed to leave" }, { status: 500 });
    }
}
