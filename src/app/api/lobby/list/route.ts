import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const lobbies = await (prisma as any).gameLobby.findMany({
            where: {
                status: "WAITING",
                isPublic: true
            },
            include: {
                members: {
                    include: {
                        character: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(lobbies);
    } catch (e) {
        console.error("Lobby List Error:", e);
        return NextResponse.json({ error: "Failed to fetch lobbies" }, { status: 500 });
    }
}
