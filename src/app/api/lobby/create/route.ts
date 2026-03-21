import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { name, isPublic, difficulty } = await req.json();

        // Get Character
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const character = user?.characters[0];
        if (!character) return NextResponse.json({ error: "No character found" }, { status: 404 });

        // Generate Code (4 chars)
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();

        // Validate or Generate Name
        let lobbyName = name ? name.trim() : "";

        if (lobbyName) {
            // Check Duplicate (Active Lobbies)
            // Note: 'status' filtering to allow reusing names of finished games if desired, 
            // but user said "don't allow duplicate lobby names", implying strict uniqueness or at least active ones.
            // We'll block any NON-FINISHED lobby with this name.
            const existing = await (prisma as any).gameLobby.findFirst({
                where: {
                    name: lobbyName,
                    status: { not: "FINISHED" }
                }
            });
            if (existing) {
                return NextResponse.json({ error: "Lobby name currently in use" }, { status: 409 });
            }
        } else {
            // Generate Default Salted Name
            const salt = Math.random().toString(36).substring(2, 5).toUpperCase();
            lobbyName = `Sector-${code}-${salt}`;
        }

        // Create Lobby & Join Host
        const result = await prisma.$transaction(async (tx) => {
            const txn = tx as any; // Bypass type check

            const lobby = await txn.gameLobby.create({
                data: {
                    name: lobbyName,
                    code,
                    hostId: character.id,
                    isPublic,
                    difficulty,
                    status: "WAITING",
                    updatedAt: new Date()
                }
            });

            await txn.lobbyMember.create({
                data: {
                    lobbyId: lobby.id,
                    characterId: character.id,
                    isReady: true // Host is always ready? Or manual. Let's say manual for now, but usually host is ready.
                }
            });

            return lobby;
        });

        return NextResponse.json(result);

    } catch (e) {
        console.error("Lobby Create Error:", e);
        return NextResponse.json({ error: "Failed to create lobby" }, { status: 500 });
    }
}
