import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PrinterInterface from "@/components/market/PrinterInterface";
import AutoFitViewport from "@/components/layout/AutoFitViewport";
import { normalizePublicPath } from "@/lib/imagePath";

const toSortTimestamp = (value: unknown) => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "bigint") {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? (numeric < 1_000_000_000_000 ? numeric * 1000 : numeric) : 0;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? (value < 1_000_000_000_000 ? value * 1000 : value) : 0;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return 0;
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) {
            return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
        }
        const parsed = Date.parse(trimmed);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

export default async function PrinterPage() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) redirect("/");

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { characters: { include: { inventory: { include: { item: true } } } } as any }
    });

    if (!user) redirect("/");
    if ((user as any).characters.length === 0) redirect("/character/create");
    const character = (user as any).characters[0];

    // Fetch Global Queue (items + character portraits waiting for visualization)
    const queuedItemsRaw = await (prisma as any).$queryRaw`
        SELECT ii.id, ii.updatedAt, ii.createdAt, ii.imageStatus, i.name as "itemName", c.name as "charName", c.class as "charClass"
        FROM "InventoryItem" ii
        JOIN "Item" i ON ii.itemId = i.id
        JOIN "Character" c ON ii.characterId = c.id
        WHERE i.name NOT IN ('Scrap Metal', 'Nutrient Paste')
          AND (ii.customImage IS NULL OR ii.customImage = '' OR ii.customImage = 'null')
        ORDER BY ii.updatedAt ASC
    `;

    const queuedItems = (queuedItemsRaw as any[]).map(item => ({
        id: item.id,
        queueType: "ITEM",
        name: item.itemName || "Item",
        owner: item.charName || "Unknown",
        imageStatus: item.imageStatus === "READY" ? "QUEUED" : (item.imageStatus || "QUEUED"),
        queuedAt: item.updatedAt || item.createdAt,
        characterClass: item.charClass
    }));

    const queuedCharacters = await (prisma as any).character.findMany({
        where: {
            OR: [{ portrait: null }, { portrait: "" }, { portrait: "null" }]
        },
        select: {
            id: true,
            name: true,
            class: true,
            portrait: true,
            portraitStatus: true,
            updatedAt: true,
            user: { select: { email: true } }
        },
        orderBy: { updatedAt: "asc" }
    });

    const globalQueue = [
        ...queuedItems,
        ...queuedCharacters.map((char: any) => ({
            id: char.id,
            queueType: "CHARACTER",
            name: char.name,
            owner: char.user?.email || char.name,
            imageStatus: char.portraitStatus || "QUEUED",
            queuedAt: char.updatedAt,
            characterClass: char.class
        }))
    ].sort((a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime());

    const recentReadyItemsRaw = await (prisma as any).$queryRaw`
        SELECT ii.id, ii.customImage, ii.imageUpdatedAt, ii.updatedAt, i.name as "itemName", c.name as "charName", c.class as "charClass"
        FROM "InventoryItem" ii
        JOIN "Item" i ON ii.itemId = i.id
        JOIN "Character" c ON ii.characterId = c.id
        WHERE ii.customImage IS NOT NULL
          AND ii.customImage != ''
          AND ii.imageStatus = 'READY'
        ORDER BY ii.updatedAt DESC
        LIMIT 40
    `;

    const recentReadyItems = (recentReadyItemsRaw as any[]).map(item => ({
        id: item.id,
        customImage: item.customImage,
        imageUpdatedAt: item.imageUpdatedAt,
        updatedAt: item.updatedAt,
        item: { name: item.itemName },
        character: { name: item.charName, class: item.charClass }
    }));

    const recentReadyCharsRaw = await (prisma as any).$queryRaw`
        SELECT c.id, c.name, c.class, c.portrait, c.portraitUpdatedAt, c.updatedAt, u.email as "userEmail"
        FROM "Character" c
        JOIN "User" u ON c.userId = u.id
        WHERE c.portrait IS NOT NULL
          AND c.portrait != ''
          AND c.portraitStatus = 'READY'
        ORDER BY c.updatedAt DESC
        LIMIT 40
    `;

    const recentReadyChars = (recentReadyCharsRaw as any[]).map(char => ({
        id: char.id,
        name: char.name,
        class: char.class,
        portrait: char.portrait,
        portraitUpdatedAt: char.portraitUpdatedAt,
        updatedAt: char.updatedAt,
        user: { email: char.userEmail }
    }));

    const recentMade = [
        ...recentReadyItems.map((item: any) => ({
            id: `item-${item.id}-${item.imageUpdatedAt}`,
            queueType: "ITEM",
            title: item.item?.name || "Item",
            owner: item.character?.name || "Unknown",
            preview: normalizePublicPath(item.customImage) || item.customImage,
            completedAt: item.imageUpdatedAt ?? item.updatedAt,
            characterClass: item.character?.class
        })),
        ...recentReadyChars.map((char: any) => ({
            id: `portrait-${char.id}-${char.portraitUpdatedAt}`,
            queueType: "PORTRAIT",
            title: char.name,
            owner: char.user?.email || char.name,
            preview: normalizePublicPath(char.portrait) || char.portrait,
            completedAt: char.portraitUpdatedAt ?? char.updatedAt,
            characterClass: char.class
        }))
    ].sort((a, b) => {
        const timeA = toSortTimestamp(a.completedAt);
        const timeB = toSortTimestamp(b.completedAt);
        if (timeA !== timeB) return timeB - timeA;
        return b.id.localeCompare(a.id); // Stable tie-breaker
    }); // Newest first

    return (
        <div className="h-full bg-black">
            <div className="fixed top-6 left-8 z-50">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <AutoFitViewport contentKey={`printer-${globalQueue.length}-${recentMade.length}`}>
                <div className="min-h-[980px] w-full">
                    <PrinterInterface
                        credits={(character as any).credits}
                        inventory={(character as any).inventory}
                        backpackLevel={(character as any).backpackLevel ?? 1}
                        globalQueue={globalQueue}
                        recentMade={recentMade}
                    />
                </div>
            </AutoFitViewport>
        </div>
    );
}
