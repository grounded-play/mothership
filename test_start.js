const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Look for a lobby that is WAITING or recently IN_PROGRESS
    const lobby = await prisma.gameLobby.findFirst({
        where: { NOT: { status: 'ENDED' } },
        include: { members: true }
    });

    if (!lobby) {
        console.log("No test lobby found.");
        return;
    }

    console.log(`Testing with Lobby ID: ${lobby.id}, Status: ${lobby.status}`);

    try {
        // Mock a start call behavior
        // If GameState already exists, this should fail if we use create
        const existing = await prisma.gameState.findUnique({ where: { id: lobby.id } });
        if (existing) {
            console.log("GameState already exists. This will cause a 'create' crash.");
        } else {
            console.log("No GameState yet. Creating...");
        }

        // We could call the actual initializeGame if it were exported/reachable as JS
        // But let's just check the Prisma schema behavior for MapNode
        const nodeCount = await prisma.mapNode.count({ where: { gameId: lobby.id } });
        console.log(`Current MapNodes for this game: ${nodeCount}`);

    } catch (e) {
        console.error("Test Error:", e);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
