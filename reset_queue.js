const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const i = await prisma.inventoryItem.updateMany({ where: { imageStatus: 'ERROR' }, data: { imageStatus: 'QUEUED' } });
    const c = await prisma.character.updateMany({ where: { portraitStatus: 'ERROR' }, data: { portraitStatus: 'QUEUED' } });
    console.log(`Database reset. Re-queued ${i.count} items and ${c.count} characters.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
