const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Checking Stuck Assets ---");
    const items = await prisma.inventoryItem.findMany({ include: { item: true } });
    const chars = await prisma.character.findMany();

    console.log(`\nCharacters: ${chars.length}`);
    chars.filter(c => c.portrait === null || c.portrait === "" || c.portrait === "null").forEach(c => {
        console.log(`- CHAR: ${c.name} | status: ${c.portraitStatus} | portrait: [${c.portrait}] | updatedAt: ${c.updatedAt}`);
    });

    console.log(`\nInventoryItems: ${items.length}`);
    items.filter(inv => inv.customImage === null || inv.customImage === "" || inv.customImage === "null").forEach(inv => {
        console.log(`- ITEM: ${inv.item?.name} | status: ${inv.imageStatus} | customImage: [${inv.customImage}] | updatedAt: ${inv.updatedAt}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
