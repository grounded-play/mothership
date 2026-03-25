const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Characters ---");
    const chars = await prisma.character.findMany({
        where: { portraitStatus: 'READY' },
        select: { name: true, portraitUpdatedAt: true, updatedAt: true },
        orderBy: { portraitUpdatedAt: 'desc' },
        take: 5
    });
    console.log(JSON.stringify(chars, null, 2));

    console.log("\n--- Items ---");
    const items = await prisma.inventoryItem.findMany({
        where: { imageStatus: 'READY' },
        select: { item: { select: { name: true } }, imageUpdatedAt: true, updatedAt: true },
        orderBy: { imageUpdatedAt: 'desc' },
        take: 5
    });
    console.log(JSON.stringify(items, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
