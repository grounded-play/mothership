const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Mission Lifecycle Cleanup ---");
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    
    const count = await prisma.gameState.updateMany({
        where: {
            updatedAt: { lt: sixHoursAgo },
            NOT: { phase: { in: ['VICTORY', 'GAMEOVER', 'ABORTED'] } }
        },
        data: {
            phase: 'ABORTED'
        }
    });

    console.log(`Deactivated ${count.count} stale missions.`);
    
    // Also close stale lobbies
    const lobbyCount = await prisma.gameLobby.updateMany({
        where: {
            updatedAt: { lt: sixHoursAgo },
            status: 'WAITING'
        },
        data: {
            status: 'ENDED'
        }
    });
    console.log(`Closed ${lobbyCount.count} stale lobbies.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
