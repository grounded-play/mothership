const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Backfilling imageUpdatedAt ---");
    const count = await prisma.inventoryItem.updateMany({
        where: {
            customImage: { not: null },
            imageStatus: "READY",
            imageUpdatedAt: null
        },
        data: {
            imageUpdatedAt: new Date()
        }
    });
    console.log(`Updated ${count.count} items.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
