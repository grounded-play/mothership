const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Backfilling portraitUpdatedAt ---");
    const count = await prisma.character.updateMany({
        where: {
            portrait: { not: null },
            portraitStatus: "READY",
            portraitUpdatedAt: null
        },
        data: {
            portraitUpdatedAt: new Date() // Set to now for backfill, or we could try to approximate
        }
    });
    console.log(`Updated ${count.count} characters.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
