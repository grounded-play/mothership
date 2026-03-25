import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Facing = "NORTH" | "EAST" | "SOUTH" | "WEST";

const forwardVectors: Record<Facing, { x: number; y: number }> = {
    NORTH: { x: 0, y: 1 },
    EAST: { x: 1, y: 0 },
    SOUTH: { x: 0, y: -1 },
    WEST: { x: -1, y: 0 }
};

const turnLeft = (facing: Facing): Facing => {
    switch (facing) {
        case "NORTH": return "WEST";
        case "WEST": return "SOUTH";
        case "SOUTH": return "EAST";
        case "EAST": return "NORTH";
        default: return "NORTH";
    }
};

const turnRight = (facing: Facing): Facing => {
    switch (facing) {
        case "NORTH": return "EAST";
        case "EAST": return "SOUTH";
        case "SOUTH": return "WEST";
        case "WEST": return "NORTH";
        default: return "NORTH";
    }
};

const resolveMove = (direction: string, facing: Facing) => {
    let dx = 0;
    let dy = 0;
    let dz = 0;
    let newFacing = facing;

    if (direction === "LEFT") {
        newFacing = turnLeft(facing);
        const vec = forwardVectors[newFacing];
        dx = vec.x;
        dy = vec.y;
    } else if (direction === "RIGHT") {
        newFacing = turnRight(facing);
        const vec = forwardVectors[newFacing];
        dx = vec.x;
        dy = vec.y;
    } else if (direction === "BACK") {
        const vec = forwardVectors[facing];
        dx = -vec.x;
        dy = -vec.y;
    } else if (direction === "UP") {
        dz = 1;
    } else if (direction === "DOWN") {
        dz = -1;
    } else {
        const vec = forwardVectors[facing];
        dx = vec.x;
        dy = vec.y;
    }

    return { dx, dy, dz, newFacing };
};

const vectorToDirection = (dx: number, dy: number, dz: number) => {
    if (dz === 1) return "UP";
    if (dz === -1) return "DOWN";
    if (dx === 1) return "RIGHT";
    if (dx === -1) return "LEFT";
    if (dy === 1) return "FORWARD";
    if (dy === -1) return "BACK";
    return null;
};

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { gameId, direction } = await req.json();

        // 1. Get Game & Player
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { characters: true }
        });
        const character = user?.characters[0];
        if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });

        // 1. Get Game state with Lobby (for Difficulty)
        const gameState = await (prisma as any).gameState.findUnique({
            where: { id: gameId },
            include: { GameLobby: true }
        });
        if (!gameState) return NextResponse.json({ error: "Game State Not Found" }, { status: 404 });

        // 2. Get Player Position
        const player = await (prisma as any).gamePlayer.findFirst({
            where: { gameId, characterId: character.id },
            include: { MapNode: true }
        });
        if (!player || !player.MapNode) return NextResponse.json({ error: "Player/Node not found" }, { status: 404 });

        const connections = JSON.parse(player.MapNode.connections || "[]");

        // Cannot leave a room before it is scanned (except START)
        if (!player.MapNode.scanned && player.MapNode.type !== "START") {
            return NextResponse.json({ error: "Scan the room before moving." }, { status: 400 });
        }

        // First step out of the airlock must be straight forward into entry
        if (player.MapNode.type === "START" && direction !== "FORWARD") {
            return NextResponse.json({ error: "First action must be FORWARD out of the airlock." }, { status: 400 });
        }

        // RELATIVE MOVEMENT LOGIC
        const facing = ((player as any).facing || "NORTH") as Facing;
        const { dx, dy, dz, newFacing } = resolveMove(direction, facing);
        const absDir = vectorToDirection(dx, dy, dz);
        if (absDir && !connections.includes(absDir)) {
            return NextResponse.json({ error: "No hatch in that direction." }, { status: 400 });
        }

        const x = player.MapNode.x + dx;
        const y = player.MapNode.y + dy;
        const z = player.MapNode.z + dz;

        // TIMER INIT LOGIC (On First Move)
        if (!gameState.deadline) {
            // Difficulty: Easy=20, Normal=15, Hard=10
            const diff = gameState.GameLobby?.difficulty || "NORMAL";
            const minutes = diff === "HARD" ? 10 : diff === "EASY" ? 20 : 15;

            await (prisma as any).gameState.update({
                where: { id: gameId },
                data: {
                    deadline: new Date(Date.now() + minutes * 60000),
                    phase: gameState.phase === "AIRLOCK" ? "ACTION" : gameState.phase
                }
            });
        }

        // MOVEMENT EXECUTION
        // 3. Find Target Node
        const targetNode = await (prisma as any).mapNode.findFirst({
            where: { gameId, x, y, z }
        });

        if (!targetNode) {
            return NextResponse.json({ error: "Path Blocked / Hull Breach" }, { status: 400 });
        }

        // 4. Explore Node & Trigger Encounter
        const isNewEncounter = !targetNode.isExplored && (targetNode.type === "ENEMY" || targetNode.type === "BOSS");

        await (prisma as any).mapNode.update({
            where: { id: targetNode.id },
            data: { isExplored: true }
        });

        // 5. Update Player position (no card draw here; draw happens in draw phase)
        await (prisma as any).gamePlayer.update({
            where: { id: player.id },
            data: {
                nodeId: targetNode.id,
                updatedAt: new Date(),
                facing: newFacing
            }
        });

        if (isNewEncounter) {
            await (prisma as any).gameState.update({ where: { id: gameId }, data: { phase: "COMBAT" } });
        }

        return NextResponse.json({ success: true, message: "Movement Successful", facing: newFacing });

    } catch (e: any) {
        console.error("Move Error:", e);
        return NextResponse.json({ error: e.message || "Movement Failed" }, { status: 500 });
    }
}
