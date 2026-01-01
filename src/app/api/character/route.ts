import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { name, class: charClass, portrait } = await req.json();

        if (!name || !charClass) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        // Get user ID
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Check availability (optional, schema enforces unique name per user)

        const BASE_STATS: Record<string, any> = {
            marine: { strength: 40, speed: 30, intellect: 25, combat: 40, instinct: 35 },
            android: { strength: 50, speed: 20, intellect: 60, combat: 30, instinct: 10 },
            scientist: { strength: 20, speed: 35, intellect: 55, combat: 15, instinct: 40 },
            teamster: { strength: 45, speed: 35, intellect: 25, combat: 35, instinct: 45 }
        };

        const initialStats = BASE_STATS[charClass] || BASE_STATS["marine"];

        const character = await prisma.character.create({
            data: {
                name,
                class: charClass,
                portrait,
                userId: user.id,
                stats: JSON.stringify(initialStats),
                credits: 100 // Sign-on Bonus
            },
        });

        return NextResponse.json({ success: true, character }, { status: 201 });
    } catch (error) {
        console.error("Create character error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
