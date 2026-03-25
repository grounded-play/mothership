const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Realistic Backfill for imageUpdatedAt ---");
    const items = await prisma.inventoryItem.findMany({
        where: { customImage: { not: null }, imageStatus: "READY" }
    });
    
    for (const item of items) {
        await prisma.inventoryItem.update({
            where: { id: item.id },
            data: { imageUpdatedAt: item.updatedAt }
        });
    }
    console.log(`Backfilled ${items.length} items with their existing updatedAt values.`);

    console.log("\n--- Realistic Backfill for portraitUpdatedAt ---");
    const chars = await prisma.character.findMany({
        where: { portrait: { not: null }, portraitStatus: "READY" }
    });
    
    for (const char of chars) {
        // Use raw SQL to avoid validation error
        await prisma.$executeRaw`
            UPDATE "Character"
            SET portraitUpdatedAt = ${char.updatedAt}
            WHERE id = ${char.id}
        `;
    }
    console.log(`Backfilled ${chars.length} characters with their existing updatedAt values.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
