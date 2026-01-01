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

        // Toggle Ready
        // Need to check current status first
        const member = await (prisma as any).lobbyMember.findFirst({
            where: { lobbyId, characterId: character?.id }
        });

        if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 });

        await (prisma as any).lobbyMember.update({
            where: { id: member.id },
            data: { isReady: !member.isReady }
        });

        return NextResponse.json({ success: true });

    } catch (e) {
        return NextResponse.json({ error: "Failed to ready up" }, { status: 500 });
    }
}
