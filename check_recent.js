const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Recent Items (READY) ---");
    const items = await prisma.inventoryItem.findMany({
        where: {
            customImage: { not: null },
            imageStatus: "READY"
        },
        include: { item: true, character: true },
        orderBy: { updatedAt: "desc" },
        take: 10
    });
    
    items.forEach(i => {
        console.log(`[${i.updatedAt.toISOString()}] ${i.item.name} (${i.id}) - Owner: ${i.character.name}`);
    });

    console.log("\n--- Recent Characters (READY) ---");
    const chars = await prisma.character.findMany({
        where: {
            portrait: { not: null },
            portraitStatus: "READY"
        },
        orderBy: { updatedAt: "desc" },
        take: 10
    });
    
    chars.forEach(c => {
        console.log(`[${c.updatedAt.toISOString()}] ${c.name} (${c.id}) - Portrait: ${c.portrait}`);
        console.log(`   portraitUpdatedAt: ${c.portraitUpdatedAt ? c.portraitUpdatedAt.toISOString() : 'MISSING'}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
