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

    // If it's a new character (temp ID), we skip the DB ownership check.
    // Ideally we'd rate limit this to prevent abuse, but for now we trust the session.
    // If it's a new character (temp ID), we skip the DB ownership check.
    // Ideally we'd rate limit this to prevent abuse, but for now we trust the session.
    if (!characterId.startsWith("new_char")) {
        // Check ownership and credits for existing characters
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

        // Deduct credits immediately
        // Also update class if provided and different
        const updateData: any = { credits: { decrement: COST }, portraitStatus: "GENERATING 0%" };

        if (charClass && charClass !== character.class) {
            updateData.class = charClass;
        }

        await prisma.character.update({
            where: { id: character.id },
            data: updateData
        });
    }

    const prompt = `${charClass || 'Pilot'} class, ${features}, ${hair} hair, ${eyes} eyes, detailed portrait`;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            try {
                let lastProgress = 0;
                if (!characterId.startsWith("new_char")) {
                    await prisma.character.update({
                        where: { id: characterId },
                        data: { portraitStatus: "QUEUED" }
                    });
                }
                const imagePath = await generateItemArt(prompt, characterId, 'character', (p) => {
                    const percentage = Math.round((p.value / p.max) * 100);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ progress: percentage })}\n\n`));
                    if (!characterId.startsWith("new_char") && (percentage - lastProgress >= 10 || percentage === 100)) {
                        lastProgress = percentage;
                        void prisma.character.update({
                            where: { id: characterId },
                            data: { portraitStatus: `GENERATING ${percentage}%` }
                        }).catch(() => { });
                    }
                });

                if (imagePath) {
                    const normalizedPath = normalizePublicPath(imagePath) || imagePath;
                    // Update Character Image for existing characters
                    if (!characterId.startsWith("new_char")) {
                        await prisma.character.update({
                            where: { id: characterId },
                            data: { portrait: imagePath, portraitStatus: "READY" }
                        });
                    }

                    // For now just return path, client updates state
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ success: true, image: normalizedPath })}\n\n`));
                } else {
                    if (!characterId.startsWith("new_char")) {
                        await prisma.character.update({
                            where: { id: characterId },
                            data: { portraitStatus: "FAILED" }
                        });
                    }
                    if (!characterId.startsWith("new_char")) {
                        await prisma.character.update({
                            where: { id: characterId },
                            data: { portraitStatus: "FAILED" }
                        });
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Generation failed" })}\n\n`));
                }
            } catch (e: any) {
                if (!characterId.startsWith("new_char")) {
                    await prisma.character.update({
                        where: { id: characterId },
                        data: { portraitStatus: "ERROR" }
                    }).catch(() => { });
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
            } finally {
                controller.close();
            }
        }
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}
