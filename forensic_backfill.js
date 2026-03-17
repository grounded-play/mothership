const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Forensic Backfill: Characters ---");
    const chars = await prisma.character.findMany({
        where: { portrait: { not: null } }
    });

    for (const char of chars) {
        if (!char.portrait) continue;
        const fullPath = path.join(process.cwd(), 'public', char.portrait.replace(/^\//, ''));
        if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            const mtime = stats.mtime;
            console.log(`Setting ${char.name} portraitUpdatedAt to ${mtime.toISOString()}`);
            await prisma.$executeRaw`
                UPDATE "Character"
                SET portraitUpdatedAt = ${mtime.toISOString()}
                WHERE id = ${char.id}
            `;
        }
    }

    console.log("\n--- Forensic Backfill: Items ---");
    const items = await prisma.inventoryItem.findMany({
        where: { customImage: { not: null } }
    });

    for (const item of items) {
        if (!item.customImage) continue;
        const fullPath = path.join(process.cwd(), 'public', item.customImage.replace(/^\//, ''));
        if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            const mtime = stats.mtime;
            console.log(`Setting Item ${item.id} imageUpdatedAt to ${mtime.toISOString()}`);
             await prisma.$executeRaw`
                UPDATE "InventoryItem"
                SET imageUpdatedAt = ${mtime.toISOString()}
                WHERE id = ${item.id}
            `;
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
