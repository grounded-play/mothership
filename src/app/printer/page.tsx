import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PrinterInterface from "@/components/market/PrinterInterface";
import { existsSync } from "fs";
import path from "path";
import { normalizePublicPath } from "@/lib/imagePath";

export default async function PrinterPage() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) redirect("/");

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { characters: { include: { inventory: { include: { item: true } } } } as any }
    });

    if (!user || (user as any).characters.length === 0) redirect("/character/create");
    const character = (user as any).characters[0];

    const hasLocalImage = (value?: string | null) => {
        if (!value) return false;
        const trimmed = String(value).trim();
        if (!trimmed) return false;
        if (trimmed.startsWith("data:") || /^https?:\/\//i.test(trimmed)) return true;
        const normalized = normalizePublicPath(trimmed);
        if (!normalized) return false;
        const filePath = path.join(process.cwd(), "public", normalized.replace(/^\//, ""));
        return existsSync(filePath);
    };

    // Fetch Global Queue (items + character portraits waiting for visualization)
    const queuedItems = await (prisma as any).inventoryItem.findMany({
        where: {
            customImage: null,
            instanceStats: { not: null },
            NOT: [{ instanceStats: "{}" }, { instanceStats: "" }],
            OR: [
                { imageStatus: { startsWith: "GENERATING" } },
                { imageStatus: { in: ["QUEUED", "FAILED", "ERROR", "READY", ""] } }
            ]
        },
        include: { item: true, character: { select: { name: true } } },
        orderBy: { createdAt: "asc" }
    });

    const queuedCharacters = await (prisma as any).character.findMany({
        where: {
            OR: [
                { portraitStatus: { startsWith: "GENERATING" } },
                { portraitStatus: { in: ["QUEUED", "FAILED", "ERROR"] } }
            ]
        },
        select: {
            id: true,
            name: true,
            portrait: true,
            portraitStatus: true,
            updatedAt: true,
            user: { select: { email: true } }
        },
        orderBy: { updatedAt: "asc" }
    });

    const globalQueue = [
        ...queuedItems.map((item: any) => ({
            id: item.id,
            queueType: "ITEM",
            name: item.item?.name || "Item",
            owner: item.character?.name || "Unknown",
            imageStatus: item.imageStatus === "READY" ? "QUEUED" : (item.imageStatus || "QUEUED"),
            queuedAt: item.createdAt
        })),
        ...queuedCharacters.map((char: any) => ({
            id: char.id,
            queueType: "CHARACTER",
            name: char.name,
            owner: char.user?.email || char.name,
            imageStatus: char.portraitStatus || "QUEUED",
            queuedAt: char.updatedAt
        }))
    ].sort((a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime());

    const recentReady = await (prisma as any).inventoryItem.findMany({
        where: {
            customImage: { not: null },
            NOT: { customImage: "" },
            imageStatus: "READY"
        },
        include: { item: true, character: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 10
    });

    const recentPortraits = await (prisma as any).character.findMany({
        where: {
            portrait: { not: null },
            NOT: { portrait: "" }
        },
        orderBy: { updatedAt: "desc" },
        take: 10
    });

    const lastReadyItem = recentReady.find((entry: any) => hasLocalImage(entry.customImage)) || null;
    const lastReadyPortrait = recentPortraits.find((entry: any) => hasLocalImage(entry.portrait)) || null;

    const lastItemTs = lastReadyItem ? new Date(lastReadyItem.updatedAt).getTime() : 0;
    const lastPortraitTs = lastReadyPortrait ? new Date(lastReadyPortrait.updatedAt).getTime() : 0;

    let lastMade: any = null;
    if (lastItemTs || lastPortraitTs) {
        if (lastPortraitTs > lastItemTs && lastReadyPortrait) {
            lastMade = {
                id: lastReadyPortrait.id,
                type: "CHARACTER",
                title: lastReadyPortrait.name,
                owner: lastReadyPortrait.name,
                preview: normalizePublicPath(lastReadyPortrait.portrait) || lastReadyPortrait.portrait,
                imageStatus: lastReadyPortrait.portraitStatus || "READY"
            };
        } else if (lastReadyItem) {
            lastMade = {
                id: lastReadyItem.id,
                type: "ITEM",
                title: lastReadyItem.item?.name || "Item",
                owner: lastReadyItem.character?.name || "Unknown",
                preview: normalizePublicPath(lastReadyItem.customImage) || lastReadyItem.customImage,
                imageStatus: lastReadyItem.imageStatus || "READY"
            };
        }
    }

    return (
        <div className="h-full bg-black">
            <div className="fixed top-6 left-8 z-50">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <PrinterInterface
                credits={(character as any).credits}
                inventory={(character as any).inventory}
                backpackLevel={(character as any).backpackLevel ?? 1}
                globalQueue={globalQueue}
                lastMade={lastMade}
            />
        </div>
    );
}
