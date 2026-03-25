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

type DirectionName = "FORWARD" | "BACK" | "LEFT" | "RIGHT" | "UP" | "DOWN";
type Coord = { x: number; y: number; z: number };
type LogicalCell = { lx: number; ly: number; z: number };
type RoomRole = "ENTRY" | "BOSS";

const CARDINAL_DELTAS: Array<Coord & { direction: DirectionName }> = [
    { x: 0, y: 1, z: 0, direction: "FORWARD" },
    { x: 0, y: -1, z: 0, direction: "BACK" },
    { x: -1, y: 0, z: 0, direction: "LEFT" },
    { x: 1, y: 0, z: 0, direction: "RIGHT" }
];

export class SpaceDerelictGenerator {
    private static readonly SUITS: RoomSuit[] = ["COMMAND", "VOID", "BIOTECH", "PLASMA"];
    private static readonly OPPOSITE_DIRECTION: Record<DirectionName, DirectionName> = {
        FORWARD: "BACK",
        BACK: "FORWARD",
        LEFT: "RIGHT",
        RIGHT: "LEFT",
        UP: "DOWN",
        DOWN: "UP"
    };
    private static readonly VECTOR_TO_DIRECTION: Record<string, DirectionName> = {
        "0,1,0": "FORWARD",
        "0,-1,0": "BACK",
        "-1,0,0": "LEFT",
        "1,0,0": "RIGHT",
        "0,0,1": "UP",
        "0,0,-1": "DOWN"
    };
    private static readonly LOGICAL_WIDTH = 5;
    private static readonly LOGICAL_HEIGHT = 5;
    private static readonly LEVELS = 3;
    private static readonly LOOP_CARVES_PER_DECK = 2;
    private static readonly VERTICAL_LINKS_PER_PAIR = 4;
    private static readonly ENTRY_CELL: LogicalCell = { lx: 2, ly: 0, z: 0 };

    static generate(gameId: string, depth: number = 4): NodeData[] {
        const openNodes = new Set<string>();
        const graph = new Map<string, Set<string>>();

        for (let z = 0; z < this.LEVELS; z++) {
            this.carveDeckMaze(openNodes, graph, z);
        }

        this.addVerticalLinks(openNodes, graph, Math.max(1, depth));

        const entryCoord = this.logicalToCoord(this.ENTRY_CELL);
        this.ensureOpen(openNodes, graph, entryCoord);

        const startNodeCoord = { x: 0, y: -5, z: 0 };
        this.ensureOpen(openNodes, graph, startNodeCoord);
        this.linkCoords(graph, startNodeCoord, entryCoord);

        const roomRoles = new Map<string, RoomRole>();
        roomRoles.set(this.key(entryCoord), "ENTRY");

        const bossKey = this.pickBossNode(this.key(entryCoord), graph);
        if (bossKey) roomRoles.set(bossKey, "BOSS");

        return this.buildNodes(graph, roomRoles, startNodeCoord, this.key(entryCoord));
    }

    private static carveDeckMaze(openNodes: Set<string>, graph: Map<string, Set<string>>, z: number) {
        const visited = new Set<string>();
        const stack: LogicalCell[] = [{ lx: this.ENTRY_CELL.lx, ly: this.ENTRY_CELL.ly, z }];

        visited.add(this.logicalKey(stack[0]));
        this.ensureOpen(openNodes, graph, this.logicalToCoord(stack[0]));

        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const neighbors = this.getLogicalNeighbors(current)
                .filter((candidate) => !visited.has(this.logicalKey(candidate)))
                .sort(() => Math.random() - 0.5);

            const next = neighbors[0];
            if (!next) {
                stack.pop();
                continue;
            }

            this.carveBetween(openNodes, graph, current, next);
            visited.add(this.logicalKey(next));
            stack.push(next);
        }

        for (let i = 0; i < this.LOOP_CARVES_PER_DECK; i++) {
            const source = this.randomLogicalCell(z);
            const candidates = this.getLogicalNeighbors(source).filter((neighbor) => {
                const sourceCoord = this.logicalToCoord(source);
                const targetCoord = this.logicalToCoord(neighbor);
                const sourceNeighbors = graph.get(this.key(sourceCoord)) || new Set<string>();
                return !sourceNeighbors.has(this.key(targetCoord));
            });
            const target = candidates[Math.floor(Math.random() * candidates.length)];
            if (!target) continue;
            this.carveBetween(openNodes, graph, source, target);
        }
    }

    private static addVerticalLinks(openNodes: Set<string>, graph: Map<string, Set<string>>, depth: number) {
        for (let z = 0; z < this.LEVELS - 1; z++) {
            const candidates: LogicalCell[] = [];
            for (let lx = 0; lx < this.LOGICAL_WIDTH; lx++) {
                for (let ly = 0; ly < this.LOGICAL_HEIGHT; ly++) {
                    candidates.push({ lx, ly, z });
                }
            }

            candidates.sort((a, b) => this.logicalScore(b, depth) - this.logicalScore(a, depth));

            let placed = 0;
            const usedColumns = new Set<string>();
            for (const candidate of candidates) {
                const from = this.logicalToCoord(candidate);
                const to = this.logicalToCoord({ ...candidate, z: z + 1 });
                const columnKey = `${candidate.lx},${candidate.ly}`;
                if (!openNodes.has(this.key(from)) || !openNodes.has(this.key(to))) continue;
                if (usedColumns.has(columnKey)) continue;

                const fromNeighbors = graph.get(this.key(from)) || new Set<string>();
                if (fromNeighbors.has(this.key(to))) continue;

                this.linkCoords(graph, from, to);
                usedColumns.add(columnKey);
                placed += 1;
                if (placed >= this.VERTICAL_LINKS_PER_PAIR) break;
            }
        }
    }

    private static buildNodes(
        graph: Map<string, Set<string>>,
        roomRoles: Map<string, RoomRole>,
        startNodeCoord: Coord,
        entryKey: string
    ) {
        const distances = this.getGraphDistances(entryKey, graph);
        const nodes = new Map<string, NodeData>();

        for (const nodeKey of graph.keys()) {
            const coord = this.coordFromKey(nodeKey);
            const role = roomRoles.get(nodeKey);
            const degree = graph.get(nodeKey)?.size || 0;
            const distance = distances.get(nodeKey) || 0;
            const hasVerticalLink = Array.from(graph.get(nodeKey) || []).some((neighborKey) => this.coordFromKey(neighborKey).z !== coord.z);

            let type: RoomType = "CORRIDOR";
            if (nodeKey === this.key(startNodeCoord)) {
                type = "START";
            } else if (role === "ENTRY") {
                type = "ENTRY";
            } else if (role === "BOSS") {
                type = "BOSS";
            } else if (this.isLogicalCoord(coord)) {
                type = this.resolveLogicalNodeType(coord, degree, distance);
            } else if (degree >= 3) {
                type = "HUB";
            }

            if (hasVerticalLink && type === "CORRIDOR") {
                type = "HUB";
            }

            const roomSuit = type === "START" || type === "ENTRY"
                ? "COMMAND"
                : type === "BOSS"
                    ? "VOID"
                    : type === "CORRIDOR"
                        ? this.corridorSuitFromNeighbors(nodeKey, graph, roomRoles)
                        : this.pickSuit(coord, distance);

            const roomPower = type === "START" || type === "ENTRY"
                ? 1
                : type === "BOSS"
                    ? 9
                    : type === "CORRIDOR"
                        ? Math.max(1, 1 + Math.floor(distance / 6))
                        : Math.min(8, Math.max(2, 2 + Math.floor(distance / 3)));

            const node = this.makeNode({
                ...coord,
                type,
                roomSuit,
                roomPower,
                isExplored: type === "START",
                scanned: type === "START"
            });

            if (type === "ENEMY") {
                node.enemies = JSON.stringify([{ id: `enemy-${nodeKey}`, name: "Stalker", hp: 4 + roomPower }]);
            } else if (type === "BOSS") {
                node.enemies = JSON.stringify([{ id: `boss-${nodeKey}`, name: "Core Horror", hp: 18 }]);
            } else if (type === "LOOT") {
                node.loot = JSON.stringify([{ id: `loot-${nodeKey}`, name: "Scrap", qty: 1 + Math.floor(distance / 4) }]);
            }

            nodes.set(nodeKey, node);
        }

        graph.forEach((neighbors, nodeKey) => {
            const source = nodes.get(nodeKey);
            if (!source) return;
            neighbors.forEach((neighborKey) => {
                const target = nodes.get(neighborKey);
                if (!target) return;
                this.connectNodePair(source, target);
            });
        });

        return Array.from(nodes.values());
    }

    private static resolveLogicalNodeType(coord: Coord, degree: number, distance: number): RoomType {
        if (degree >= 4) return "HUB";
        if (degree === 1) {
            const roll = Math.random();
            if (roll > 0.72) return "LOOT";
            if (roll > 0.38) return "TRAP";
            return "ENEMY";
        }
        if (degree === 3) {
            if (Math.random() > 0.55) return "HUB";
            return "ENEMY";
        }
        if (degree === 2 && (distance < 3 || Math.random() > 0.58)) {
            const roll = Math.random();
            if (roll > 0.82) return "LOOT";
            if (roll > 0.54) return "ENEMY";
            if (roll > 0.32) return "TRAP";
            return "EMPTY";
        }
        return "CORRIDOR";
    }

    private static corridorSuitFromNeighbors(nodeKey: string, graph: Map<string, Set<string>>, roomRoles: Map<string, RoomRole>): RoomSuit {
        const neighbors = Array.from(graph.get(nodeKey) || []);
        const scored = neighbors.find((neighborKey) => roomRoles.get(neighborKey) === "BOSS");
        if (scored) return "VOID";

        const hash = neighbors.join("|").length;
        return this.SUITS[hash % this.SUITS.length];
    }

    private static pickBossNode(entryKey: string, graph: Map<string, Set<string>>) {
        const distances = this.getGraphDistances(entryKey, graph);
        const candidates = Array.from(graph.keys())
            .map((nodeKey) => ({ nodeKey, coord: this.coordFromKey(nodeKey), distance: distances.get(nodeKey) || 0, degree: graph.get(nodeKey)?.size || 0 }))
            .filter(({ coord }) => this.isLogicalCoord(coord))
            .sort((a, b) => {
                const scoreA = a.distance + a.coord.z * 4 - Math.abs(a.coord.x) * 0.15;
                const scoreB = b.distance + b.coord.z * 4 - Math.abs(b.coord.x) * 0.15;
                return scoreB - scoreA;
            });

        return candidates.find((candidate) => candidate.degree <= 2)?.nodeKey || candidates[0]?.nodeKey || entryKey;
    }

    private static getGraphDistances(entryKey: string, graph: Map<string, Set<string>>) {
        const distances = new Map<string, number>();
        const queue: string[] = [entryKey];
        distances.set(entryKey, 0);

        while (queue.length > 0) {
            const current = queue.shift()!;
            const currentDistance = distances.get(current) || 0;
            (graph.get(current) || new Set<string>()).forEach((neighbor) => {
                if (distances.has(neighbor)) return;
                distances.set(neighbor, currentDistance + 1);
                queue.push(neighbor);
            });
        }

        return distances;
    }

    private static carveBetween(openNodes: Set<string>, graph: Map<string, Set<string>>, from: LogicalCell, to: LogicalCell) {
        const fromCoord = this.logicalToCoord(from);
        const toCoord = this.logicalToCoord(to);
        const corridorCoord = {
            x: fromCoord.x + Math.sign(toCoord.x - fromCoord.x),
            y: fromCoord.y + Math.sign(toCoord.y - fromCoord.y),
            z: fromCoord.z
        };

        this.ensureOpen(openNodes, graph, fromCoord);
        this.ensureOpen(openNodes, graph, corridorCoord);
        this.ensureOpen(openNodes, graph, toCoord);

        this.linkCoords(graph, fromCoord, corridorCoord);
        this.linkCoords(graph, corridorCoord, toCoord);
    }

    private static ensureOpen(openNodes: Set<string>, graph: Map<string, Set<string>>, coord: Coord) {
        const nodeKey = this.key(coord);
        openNodes.add(nodeKey);
        if (!graph.has(nodeKey)) graph.set(nodeKey, new Set<string>());
    }

    private static linkCoords(graph: Map<string, Set<string>>, from: Coord, to: Coord) {
        const fromKey = this.key(from);
        const toKey = this.key(to);
        if (!graph.has(fromKey)) graph.set(fromKey, new Set<string>());
        if (!graph.has(toKey)) graph.set(toKey, new Set<string>());
        graph.get(fromKey)!.add(toKey);
        graph.get(toKey)!.add(fromKey);
    }

    private static connectNodePair(from: NodeData, to: NodeData) {
        const direction = this.directionBetween(from, to);
        if (!direction) return;
        if (!from.connections.includes(direction)) from.connections.push(direction);
        const opposite = this.OPPOSITE_DIRECTION[direction];
        if (!to.connections.includes(opposite)) to.connections.push(opposite);
    }

    private static directionBetween(from: Coord, to: Coord) {
        const dx = Math.sign(to.x - from.x);
        const dy = Math.sign(to.y - from.y);
        const dz = Math.sign(to.z - from.z);
        return this.VECTOR_TO_DIRECTION[`${dx},${dy},${dz}`] || null;
    }

    private static makeNode(partial: Partial<NodeData> & Coord & { type: RoomType; roomSuit: RoomSuit; roomPower: number }) {
        return {
            id: crypto.randomUUID(),
            x: partial.x,
            y: partial.y,
            z: partial.z,
            type: partial.type,
            roomSuit: partial.roomSuit,
            roomPower: partial.roomPower,
            connections: partial.connections || [],
            isExplored: partial.isExplored || false,
            scanned: partial.scanned || false,
            enemies: partial.enemies || "[]",
            loot: partial.loot || "[]"
        } satisfies NodeData;
    }

    private static logicalToCoord(cell: LogicalCell): Coord {
        return {
            x: -4 + cell.lx * 2,
            y: -4 + cell.ly * 2,
            z: cell.z
        };
    }

    private static coordFromKey(nodeKey: string): Coord {
        const [x, y, z] = nodeKey.split(",").map(Number);
        return { x, y, z };
    }

    private static key(coord: Coord) {
        return `${coord.x},${coord.y},${coord.z}`;
    }

    private static logicalKey(cell: LogicalCell) {
        return `${cell.lx},${cell.ly},${cell.z}`;
    }

    private static isLogicalCoord(coord: Coord) {
        return coord.x % 2 === 0 && coord.y % 2 === 0 && coord.x >= -4 && coord.x <= 4 && coord.y >= -4 && coord.y <= 4;
    }

    private static getLogicalNeighbors(cell: LogicalCell) {
        return [
            { lx: cell.lx, ly: cell.ly + 1, z: cell.z },
            { lx: cell.lx, ly: cell.ly - 1, z: cell.z },
            { lx: cell.lx - 1, ly: cell.ly, z: cell.z },
            { lx: cell.lx + 1, ly: cell.ly, z: cell.z }
        ].filter((candidate) =>
            candidate.lx >= 0 &&
            candidate.lx < this.LOGICAL_WIDTH &&
            candidate.ly >= 0 &&
            candidate.ly < this.LOGICAL_HEIGHT
        );
    }

    private static randomLogicalCell(z: number): LogicalCell {
        return {
            lx: Math.floor(Math.random() * this.LOGICAL_WIDTH),
            ly: Math.floor(Math.random() * this.LOGICAL_HEIGHT),
            z
        };
    }

    private static pickSuit(coord: Coord, distance: number): RoomSuit {
        const hash = Math.abs(coord.x * 31 + coord.y * 17 + coord.z * 13 + distance);
        return this.SUITS[hash % this.SUITS.length];
    }

    private static logicalScore(cell: LogicalCell, depth: number) {
        const dx = Math.abs(cell.lx - this.ENTRY_CELL.lx);
        const dy = Math.abs(cell.ly - this.ENTRY_CELL.ly);
        return cell.z * 12 + dy * 4 + dx * 2 + depth;
    }
}
