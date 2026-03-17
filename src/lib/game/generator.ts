
export type RoomType = "START" | "ENTRY" | "EMPTY" | "LOOT" | "ENEMY" | "TRAP" | "BOSS" | "CORRIDOR" | "HUB";
export type RoomSuit = "COMMAND" | "VOID" | "BIOTECH" | "PLASMA";

export interface NodeData {
    id: string;
    x: number;
    y: number;
    z: number;
    type: RoomType;
    roomSuit: RoomSuit;
    roomPower: number;
    connections: string[];
    isExplored: boolean;
    scanned: boolean;
    enemies: string;
    loot: string;
}

export class SpaceDerelictGenerator {
    private static SUITS: RoomSuit[] = ["COMMAND", "VOID", "BIOTECH", "PLASMA"];

    static generate(gameId: string, depth: number = 3): NodeData[] {
        const nodes: Map<string, NodeData> = new Map();

        // 1. Initial State: Start at 1,-1,0
        const startNode: NodeData = {
            id: crypto.randomUUID(),
            x: 1, y: -1, z: 0,
            type: "START",
            roomSuit: "COMMAND",
            roomPower: 1,
            connections: ["FORWARD"],
            isExplored: true,
            scanned: true,
            enemies: "[]",
            loot: "[]"
        };
        nodes.set("1,-1,0", startNode);

        // 2. Growth Phase (Markov-ish)
        // We start from 1,0,0 and expand.
        this.grow(nodes, 1, 0, 0, depth);

        // 3. Ensure Boss Placement
        // Place Boss at the furthest point from start
        let furthestNode: NodeData = startNode;
        let maxDist = -1;

        nodes.forEach(node => {
            if (node.type === "START") return;
            const d = Math.abs(node.x - 1) + Math.abs(node.y - (-1)) + Math.abs(node.z - 0);
            if (d > maxDist) {
                maxDist = d;
                furthestNode = node;
            }
        });

        if (furthestNode) {
            furthestNode.type = "BOSS";
            furthestNode.roomPower = 9;
        }

        // 4. WFC-like connection balancing
        // Ensure all connections are bidirectional
        this.balanceConnections(nodes);

        return Array.from(nodes.values());
    }

    private static grow(nodes: Map<string, NodeData>, x: number, y: number, z: number, remainingDepth: number) {
        if (remainingDepth < 0) return;

        const key = `${x},${y},${z}`;
        if (nodes.has(key)) return;

        // Generate current node
        const typeRand = Math.random();
        let type: RoomType = "EMPTY";
        if (typeRand > 0.85) type = "LOOT";
        else if (typeRand > 0.65) type = "ENEMY";
        else if (typeRand > 0.45) type = "HUB";
        else if (typeRand > 0.25) type = "CORRIDOR";
        else if (typeRand > 0.15) type = "TRAP";

        const node: NodeData = {
            id: crypto.randomUUID(),
            x, y, z,
            type,
            roomSuit: this.SUITS[Math.floor(Math.random() * this.SUITS.length)],
            roomPower: Math.min(9, Math.max(1, 4 - remainingDepth + Math.floor(Math.random() * 3))),
            connections: [],
            isExplored: false,
            scanned: false,
            enemies: type === "ENEMY" ? "[{\"id\":\"e1\",\"name\":\"Stalker\",\"hp\":5}]" : "[]",
            loot: type === "LOOT" ? "[{\"id\":\"l1\",\"name\":\"Scrap\",\"qty\":1}]" : "[]"
        };

        nodes.set(key, node);

        // Determine potential paths (Markov part: rules based on room type)
        const directions = [
            { dx: 0, dy: 1, dz: 0, name: "FORWARD" },
            { dx: 0, dy: -1, dz: 0, name: "BACK" },
            { dx: 1, dy: 0, dz: 0, name: "RIGHT" },
            { dx: -1, dy: 0, dz: 0, name: "LEFT" },
            { dx: 0, dy: 0, dz: 1, name: "UP" },
            { dx: 0, dy: 0, dz: -1, name: "DOWN" }
        ];

        let connectionCount = type === "HUB" ? 5 : type === "CORRIDOR" ? 2 : 1;
        
        // Boost branching for more maze-like structure
        if (Math.random() > 0.5) connectionCount++; 

        const shuffled = directions.sort(() => Math.random() - 0.5);

        for (let i = 0; i < shuffled.length && node.connections.length < connectionCount; i++) {
            const dir = shuffled[i];
            const nx = x + dir.dx;
            const ny = y + dir.dy;
            const nz = z + dir.dz;

            // Limit bounds to stay somewhat sane
            if (Math.abs(nx) > 7 || Math.abs(ny) > 7 || Math.abs(nz) > 3) continue;

            node.connections.push(dir.name);
            this.grow(nodes, nx, ny, nz, remainingDepth - 1);
        }
    }

    private static balanceConnections(nodes: Map<string, NodeData>) {
        const dirMap: Record<string, string> = {
            "FORWARD": "BACK",
            "BACK": "FORWARD",
            "LEFT": "RIGHT",
            "RIGHT": "LEFT",
            "UP": "DOWN",
            "DOWN": "UP"
        };

        const vecMap: Record<string, { dx: number, dy: number, dz: number }> = {
            "FORWARD": { dx: 0, dy: 1, dz: 0 },
            "BACK": { dx: 0, dy: -1, dz: 0 },
            "LEFT": { dx: -1, dy: 0, dz: 0 },
            "RIGHT": { dx: 1, dy: 0, dz: 0 },
            "UP": { dx: 0, dy: 0, dz: 1 },
            "DOWN": { dx: 0, dy: 0, dz: -1 }
        };

        nodes.forEach(node => {
            node.connections.forEach(conn => {
                const vec = vecMap[conn];
                if (!vec) return;
                const targetKey = `${node.x + vec.dx},${node.y + vec.dy},${node.z + vec.dz}`;
                const targetNode = nodes.get(targetKey);
                if (targetNode) {
                    const backConn = dirMap[conn];
                    if (!targetNode.connections.includes(backConn)) {
                        targetNode.connections.push(backConn);
                    }
                }
            });
        });
    }
}
