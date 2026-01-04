import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PrinterInterface from "@/components/market/PrinterInterface";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { normalizePublicPath } from "@/lib/imagePath";

const NO_PRINT_ITEM_NAMES = ["Scrap Metal", "Nutrient Paste"];

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

    const getLatestImageFile = (folderName: string) => {
        const dir = path.join(process.cwd(), "public", folderName);
        if (!existsSync(dir)) return null;
        let latest: { id: string; mtimeMs: number } | null = null;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const ext = path.extname(entry.name).toLowerCase();
            if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
            const fullPath = path.join(dir, entry.name);
            const stats = statSync(fullPath);
            if (!latest || stats.mtimeMs > latest.mtimeMs) {
                latest = { id: path.parse(entry.name).name, mtimeMs: stats.mtimeMs };
            }
        }
        return latest;
    };

    // Fetch Global Queue (Items + Character portraits)
    let itemQueue = await (prisma as any).inventoryItem.findMany({
        include: { item: true, character: { select: { name: true } } },
        orderBy: {
            createdAt: "desc"
        }
    });

    const missingItemIds = itemQueue
        .filter((item: any) =>
            !NO_PRINT_ITEM_NAMES.includes(item.item?.name) &&
            item.customImage &&
            !hasLocalImage(item.customImage)
        )
        .map((item: any) => item.id);

    const invalidReadyItemIds = itemQueue
        .filter((item: any) =>
            !NO_PRINT_ITEM_NAMES.includes(item.item?.name) &&
            item.imageStatus === "READY" &&
            !hasLocalImage(item.customImage)
        )
        .map((item: any) => item.id);

    const readyItemIds = itemQueue
        .filter((item: any) =>
            !NO_PRINT_ITEM_NAMES.includes(item.item?.name) &&
            hasLocalImage(item.customImage) &&
            item.imageStatus !== "READY"
        )
        .map((item: any) => item.id);

    if (missingItemIds.length > 0) {
        await (prisma as any).inventoryItem.updateMany({
            where: { id: { in: missingItemIds } },
            data: { customImage: null, imageStatus: "QUEUED" }
        });
        itemQueue = itemQueue.map((item: any) => (
            missingItemIds.includes(item.id)
                ? { ...item, customImage: null, imageStatus: "QUEUED" }
                : item
        ));
    }

    if (readyItemIds.length > 0) {
        await (prisma as any).inventoryItem.updateMany({
            where: { id: { in: readyItemIds } },
            data: { imageStatus: "READY" }
        });
        itemQueue = itemQueue.map((item: any) => (
            readyItemIds.includes(item.id)
                ? { ...item, imageStatus: "READY" }
                : item
        ));
    }

    if (invalidReadyItemIds.length > 0) {
        await (prisma as any).inventoryItem.updateMany({
            where: { id: { in: invalidReadyItemIds } },
            data: { imageStatus: "QUEUED" }
        });
        itemQueue = itemQueue.map((item: any) => (
            invalidReadyItemIds.includes(item.id)
                ? { ...item, imageStatus: "QUEUED" }
                : item
        ));
    }

    let characterQueue = await (prisma as any).character.findMany({
        where: {
            OR: [
                { portraitStatus: { startsWith: "GENERATING" } },
                { portraitStatus: "QUEUED" },
                { portraitStatus: "FAILED" },
                { portraitStatus: "ERROR" }
            ]
        },
        select: {
            id: true,
            name: true,
            portrait: true,
            portraitStatus: true,
            createdAt: true,
            updatedAt: true,
            user: { select: { email: true } }
        },
        orderBy: { updatedAt: "desc" }
    });

    const readyCharacterIds = characterQueue
        .filter((char: any) => hasLocalImage(char.portrait) && char.portraitStatus !== "READY")
        .map((char: any) => char.id);

    const invalidReadyCharacterIds = characterQueue
        .filter((char: any) => char.portraitStatus === "READY" && !hasLocalImage(char.portrait))
        .map((char: any) => char.id);

    if (readyCharacterIds.length > 0) {
        await (prisma as any).character.updateMany({
            where: { id: { in: readyCharacterIds } },
            data: { portraitStatus: "READY" }
        });
        characterQueue = characterQueue.map((char: any) => (
            readyCharacterIds.includes(char.id)
                ? { ...char, portraitStatus: "READY" }
                : char
        ));
    }

    if (invalidReadyCharacterIds.length > 0) {
        await (prisma as any).character.updateMany({
            where: { id: { in: invalidReadyCharacterIds } },
            data: { portraitStatus: "QUEUED" }
        });
        characterQueue = characterQueue.map((char: any) => (
            invalidReadyCharacterIds.includes(char.id)
                ? { ...char, portraitStatus: "QUEUED" }
                : char
        ));
    }

    const queueItems = itemQueue.filter((item: any) =>
        !NO_PRINT_ITEM_NAMES.includes(item.item?.name) &&
        !hasLocalImage(item.customImage)
    );

    const recentItems = await (prisma as any).inventoryItem.findMany({
        where: {
            customImage: { not: null },
            NOT: { customImage: "" },
            imageStatus: "READY"
        },
        include: { item: true, character: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 5
    });

    const recentCharacters = await (prisma as any).character.findMany({
        where: {
            portrait: { not: null },
            portraitStatus: "READY"
        },
        select: {
            id: true,
            name: true,
            portrait: true,
            portraitStatus: true,
            createdAt: true,
            updatedAt: true,
            user: { select: { email: true } }
        },
        orderBy: { updatedAt: "desc" },
        take: 5
    });

    const lastItem = await (prisma as any).inventoryItem.findFirst({
        where: {
            customImage: { not: null },
            NOT: { customImage: "" },
            imageStatus: "READY"
        },
        include: { item: true, character: { select: { name: true } } },
        orderBy: { updatedAt: "desc" }
    });

    const lastCharacter = await (prisma as any).character.findFirst({
        where: {
            portrait: { not: null },
            portraitStatus: "READY"
        },
        select: {
            id: true,
            name: true,
            portrait: true,
            portraitStatus: true,
            createdAt: true,
            updatedAt: true,
            user: { select: { email: true } }
        },
        orderBy: { updatedAt: "desc" }
    });

    const globalQueue = [
        ...queueItems.map((item: any) => ({
            id: item.id,
            kind: "ITEM",
            title: item.item?.name || "Item",
            owner: item.character?.name || "Unknown",
            imageStatus: item.imageStatus,
            icon: item.item?.icon || null,
            preview: item.customImage || null,
            hasImage: hasLocalImage(item.customImage),
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        })),
        ...characterQueue.map((char: any) => ({
            id: char.id,
            kind: "CHARACTER",
            title: "Character Portrait",
            owner: char.name,
            imageStatus: char.portraitStatus,
            icon: char.portrait || null,
            preview: char.portrait || null,
            hasImage: hasLocalImage(char.portrait),
            createdAt: char.createdAt,
            updatedAt: char.updatedAt
        })),
        ...recentItems.map((item: any) => ({
            id: item.id,
            kind: "ITEM",
            title: item.item?.name || "Item",
            owner: item.character?.name || "Unknown",
            imageStatus: item.imageStatus || "READY",
            icon: item.item?.icon || null,
            preview: item.customImage || null,
            hasImage: hasLocalImage(item.customImage),
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        })).filter((entry: any) => entry.hasImage),
        ...recentCharacters.map((char: any) => ({
            id: char.id,
            kind: "CHARACTER",
            title: "Character Portrait",
            owner: char.name,
            imageStatus: char.portraitStatus || "READY",
            icon: char.portrait || null,
            preview: char.portrait || null,
            hasImage: hasLocalImage(char.portrait),
            createdAt: char.createdAt,
            updatedAt: char.updatedAt
        })).filter((entry: any) => entry.hasImage)
    ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const latestItemFile = getLatestImageFile("items");
    const latestCharacterFile = getLatestImageFile("characters");

    let fileLastItem: any = null;
    if (latestItemFile) {
        const inv = await (prisma as any).inventoryItem.findUnique({
            where: { id: latestItemFile.id },
            include: { item: true, character: { select: { name: true } } }
        });
        if (inv) {
            fileLastItem = {
                id: inv.id,
                kind: "ITEM" as const,
                title: inv.item?.name || "Item",
                owner: inv.character?.name || "Unknown",
                imageStatus: inv.imageStatus || "READY",
                icon: inv.item?.icon || null,
                preview: inv.customImage || null,
                hasImage: hasLocalImage(inv.customImage),
                createdAt: inv.createdAt,
                updatedAt: inv.updatedAt
            };
        } else {
            const template = await (prisma as any).item.findUnique({ where: { id: latestItemFile.id } });
            if (template) {
                fileLastItem = {
                    id: template.id,
                    kind: "ITEM" as const,
                    title: template.name || "Item",
                    owner: "Catalog",
                    imageStatus: "READY",
                    icon: template.icon || null,
                    preview: template.icon || null,
                    hasImage: hasLocalImage(template.icon),
                    createdAt: template.createdAt,
                    updatedAt: template.updatedAt
                };
            }
        }
    }

    let fileLastCharacter: any = null;
    if (latestCharacterFile) {
        const char = await (prisma as any).character.findUnique({
            where: { id: latestCharacterFile.id },
            select: {
                id: true,
                name: true,
                portrait: true,
                portraitStatus: true,
                createdAt: true,
                updatedAt: true,
                user: { select: { email: true } }
            }
        });
        if (char) {
            fileLastCharacter = {
                id: char.id,
                kind: "CHARACTER" as const,
                title: "Character Portrait",
                owner: char.name,
                imageStatus: char.portraitStatus || "READY",
                icon: char.portrait || null,
                preview: char.portrait || null,
                hasImage: hasLocalImage(char.portrait),
                createdAt: char.createdAt,
                updatedAt: char.updatedAt
            };
        }
    }

    const lastMade = (() => {
        if (latestItemFile || latestCharacterFile) {
            const useItem = latestItemFile && (!latestCharacterFile || latestItemFile.mtimeMs >= latestCharacterFile.mtimeMs);
            if (useItem) return fileLastItem || fileLastCharacter;
            return fileLastCharacter || fileLastItem;
        }
        const itemEntry = lastItem
            ? {
                id: lastItem.id,
                kind: "ITEM" as const,
                title: lastItem.item?.name || "Item",
                owner: lastItem.character?.name || "Unknown",
                imageStatus: lastItem.imageStatus || "READY",
                icon: lastItem.item?.icon || null,
                preview: lastItem.customImage || null,
                hasImage: hasLocalImage(lastItem.customImage),
                createdAt: lastItem.createdAt,
                updatedAt: lastItem.updatedAt
            }
            : null;
        const charEntry = lastCharacter
            ? {
                id: lastCharacter.id,
                kind: "CHARACTER" as const,
                title: "Character Portrait",
                owner: lastCharacter.name,
                imageStatus: lastCharacter.portraitStatus || "READY",
                icon: lastCharacter.portrait || null,
                preview: lastCharacter.portrait || null,
                hasImage: hasLocalImage(lastCharacter.portrait),
                createdAt: lastCharacter.createdAt,
                updatedAt: lastCharacter.updatedAt
            }
            : null;
        if (itemEntry && !itemEntry.hasImage) return charEntry;
        if (charEntry && !charEntry.hasImage) return itemEntry;
        if (itemEntry && charEntry) {
            return new Date(itemEntry.updatedAt).getTime() >= new Date(charEntry.updatedAt).getTime() ? itemEntry : charEntry;
        }
        return itemEntry || charEntry;
    })();

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
