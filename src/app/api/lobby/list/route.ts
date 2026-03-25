import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const cutoff = new Date(Date.now() - 5 * 60 * 1000);
        await (prisma as any).gameLobby.deleteMany({
            where: {
                status: "WAITING",
                createdAt: { lt: cutoff }
            }
        });

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
