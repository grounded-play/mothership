import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateItemArt } from "@/lib/comfy";
import { normalizePublicPath } from "@/lib/imagePath";

export const runtime = "nodejs";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { characterId, features, hair, eyes, class: charClass } = await req.json();

    // V23: Strict ID Check - Client must create character first
    if (characterId.startsWith("new_char")) {
        return NextResponse.json({ error: "Invalid Character ID. Please save character first." }, { status: 400 });
    }

    // Check ownership and credits
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { characters: true } });
    const character = user?.characters.find(c => c.id === characterId);

    if (!character) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Cost Logic
    const COST = 100;
    if (character.credits < COST) {
        return NextResponse.json({ error: "Insufficient Credits (100 required)" }, { status: 402 });
    }

    // Deduct credits and set QUEUED status
    const updateData: any = {
        credits: { decrement: COST },
        portraitStatus: "QUEUED",
        portrait: null // Clear old portrait if updating
    };

    if (charClass && charClass !== character.class) {
        updateData.class = charClass;
    }

    await prisma.character.update({
        where: { id: character.id },
        data: updateData
    });

    const prompt = `${charClass || character.class || 'Pilot'} class, ${features}, ${hair} hair, ${eyes} eyes, detailed portrait`;

    // Start Generation in Background (Fire and Forget)
    const runGeneration = async () => {
        try {
            await prisma.character.update({ where: { id: character.id }, data: { portraitStatus: "GENERATING 0%" } });

            let lastProgress = 0;
            const imagePath = await generateItemArt(prompt, characterId, 'character', async (p) => {
                const percentage = Math.round((p.value / p.max) * 100);
                if (percentage - lastProgress >= 10 || percentage === 100) {
                    lastProgress = percentage;
                    try {
                        await prisma.character.update({
                            where: { id: characterId },
                            data: { portraitStatus: `GENERATING ${percentage}%` }
                        });
                    } catch (e) {
                        // Ignore update errors (race conditions)
                    }
                }
            });

            if (imagePath) {
                const normalizedPath = normalizePublicPath(imagePath) || imagePath;
                await prisma.character.update({
                    where: { id: characterId },
                    data: { portrait: textPath(normalizedPath), portraitStatus: "READY" }
                });
            } else {
                await prisma.character.update({ where: { id: characterId }, data: { portraitStatus: "FAILED" } });
            }
        } catch (e) {
            console.error("BG Gen Error", e);
            await prisma.character.update({ where: { id: characterId }, data: { portraitStatus: "ERROR" } });
        }
    };

    runGeneration();
    return NextResponse.json({ status: "QUEUED", message: "Portrait generation started." });
}

function textPath(p: string) {
    if (p.startsWith("/")) return p;
    return "/" + p;
}
