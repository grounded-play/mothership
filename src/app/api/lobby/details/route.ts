import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const character = user?.characters[0];

        const lobby = await (prisma as any).gameLobby.findUnique({
            where: { id },
            include: {
                members: {
                    include: { character: true }
                }
            }
        });

        if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
        const cutoff = Date.now() - 5 * 60 * 1000;
        if (lobby.status === "WAITING" && new Date(lobby.createdAt).getTime() < cutoff) {
            await (prisma as any).gameLobby.delete({ where: { id: lobby.id } });
            return NextResponse.json({ error: "Lobby expired" }, { status: 410 });
        }

        // Identify current user's member status and current player
        const currentUserMember = lobby.members.find((m: any) => m.characterId === character?.id);

        // Set isCurrentPlayer flag for all lobby members
        const allMembers = lobby.members.map((m: any) => ({
            ...m,
            isCurrentPlayer: currentUserMember?.characterId === m.characterId
        }));

        // Determine current player based on lobby state or active player index
        // For simplicity, we'll identify the current player by checking if their card is on the table
        const currentPlayer = allMembers.find((m: any) => m.isCurrentPlayer);

        const inventory = character ? await prisma.inventoryItem.findMany({
            where: { characterId: character.id },
            include: { item: true }
        }) : [];

        return NextResponse.json({
            lobby: {
                ...lobby,
                members: allMembers
            },
            currentUser: {
                id: character?.id,
                isReady: currentUserMember?.isReady || false,
                backpackLevel: character?.backpackLevel ?? 1,
                inventory
            }
        });

    } catch (e) {
        return NextResponse.json({ error: "Error fetching lobby" }, { status: 500 });
    }
}
