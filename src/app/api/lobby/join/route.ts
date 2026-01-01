import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { lobbyId, code } = await req.json();

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const character = user?.characters[0];
        if (!character) return NextResponse.json({ error: "No character" }, { status: 404 });

        // Find Lobby
        let lobby;
        if (lobbyId) {
            lobby = await (prisma as any).gameLobby.findUnique({ where: { id: lobbyId } });
        } else if (code) {
            lobby = await (prisma as any).gameLobby.findUnique({ where: { code } });
        }

        if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
        if (lobby.status !== "WAITING") return NextResponse.json({ error: "Game already started" }, { status: 400 });

        // Check if already in
        const existingMember = await (prisma as any).lobbyMember.findFirst({
            where: {
                lobbyId: lobby.id,
                characterId: character.id
            }
        });

        if (existingMember) return NextResponse.json({ success: true, lobbyId: lobby.id });

        // Join
        await (prisma as any).lobbyMember.create({
            data: {
                lobbyId: lobby.id,
                characterId: character.id
            }
        });

        return NextResponse.json({ success: true, lobbyId: lobby.id });

    } catch (e) {
        console.error("Join Error:", e);
        return NextResponse.json({ error: "Failed to join" }, { status: 500 });
    }
}
