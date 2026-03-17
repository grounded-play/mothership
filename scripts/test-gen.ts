
import { SpaceDerelictGenerator } from "../src/lib/game/generator";

function testGeneration() {
    console.log("Starting Generation Test...");
    const nodes = SpaceDerelictGenerator.generate("test-game", 4);

    console.log(`Generated ${nodes.length} nodes.`);

    // 1. Verify BOSS exists
    const boss = nodes.find(n => n.type === "BOSS");
    if (!boss) throw new Error("TEST FAILED: No BOSS node generated");
    console.log("Check: BOSS exists.");

    // 2. Verify Symmetry
    const nodeMap = new Map(nodes.map(n => [`${n.x},${n.y},${n.z}`, n]));
    const dirMap: Record<string, string> = {
        "FORWARD": "BACK", "BACK": "FORWARD", "LEFT": "RIGHT", "RIGHT": "LEFT", "UP": "DOWN", "DOWN": "UP"
    };
    const vecMap: Record<string, { dx: number, dy: number, dz: number }> = {
        "FORWARD": { dx: 0, dy: 1, dz: 0 }, "BACK": { dx: 0, dy: -1, dz: 0 },
        "LEFT": { dx: -1, dy: 0, dz: 0 }, "RIGHT": { dx: 1, dy: 0, dz: 0 },
        "UP": { dx: 0, dy: 0, dz: 1 }, "DOWN": { dx: 0, dy: 0, dz: -1 }
    };

    nodes.forEach(node => {
        node.connections.forEach(conn => {
            const vec = vecMap[conn];
            const targetKey = `${node.x + vec.dx},${node.y + vec.dy},${node.z + vec.dz}`;
            const target = nodeMap.get(targetKey);
            if (!target) throw new Error(`TEST FAILED: Connection to missing node at ${targetKey}`);
            if (!target.connections.includes(dirMap[conn])) {
                throw new Error(`TEST FAILED: Asymmetric connection between ${node.x},${node.y},${node.z} and ${targetKey}`);
            }
        });
    });
    console.log("Check: Connections are symmetric.");

    // 3. Verify Reachability from START to BOSS
    const start = nodes.find(n => n.type === "START")!;
    const visited = new Set<string>();
    const queue = [start];

    while (queue.length > 0) {
        const curr = queue.shift()!;
        const key = `${curr.x},${curr.y},${curr.z}`;
        if (visited.has(key)) continue;
        visited.add(key);

        curr.connections.forEach(conn => {
            const vec = vecMap[conn];
            const nextKey = `${curr.x + vec.dx},${curr.y + vec.dy},${curr.z + vec.dz}`;
            const nextNode = nodeMap.get(nextKey);
            if (nextNode) queue.push(nextNode);
        });
    }

    if (!visited.has(`${boss.x},${boss.y},${boss.z}`)) {
        throw new Error("TEST FAILED: BOSS is unreachable from START");
    }
    console.log("Check: BOSS is reachable from START.");

    console.log("ALL TESTS PASSED.");
}

try {
    testGeneration();
} catch (e) {
    console.error(e);
    process.exit(1);
}
