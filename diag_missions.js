const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const missions = await prisma.gameState.findMany({
        where: {
            updatedAt: { gte: oneHourAgo },
            NOT: { phase: { in: ['VICTORY', 'GAMEOVER', 'ABORTED'] } }
        },
        select: { id: true, phase: true, updatedAt: true }
    });
    console.log(JSON.stringify(missions, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
