const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Checking Characters ---");
    const chars = await prisma.character.findMany();
    console.log(`Total Characters: ${chars.length}`);
    chars.forEach(c => {
        console.log(`ID: ${c.id} | Name: ${c.name} | portrait: [${c.portrait}] | status: ${c.portraitStatus}`);
    });

    console.log("\n--- Checking Characters Needing Portrait ---");
    const needing = chars.filter(c => c.portrait === null || c.portrait === "" || c.portrait === "null");
    console.log(`Characters needing portrait: ${needing.length}`);
    needing.forEach(c => {
        console.log(`- NEEDS: ${c.name} | status: ${c.portraitStatus}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
