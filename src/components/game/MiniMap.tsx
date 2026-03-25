"use strict";
import { motion } from "framer-motion";

interface Node {
    id: string;
    x: number;
    y: number;
    z: number;
    type: string;
    isExplored: boolean;
}

interface MiniMapProps {
    nodes: Node[];
    currentPlayerNodeId: string;
}

export default function MiniMap({ nodes, currentPlayerNodeId }: MiniMapProps) {
    // Center Map on Current Player
    const origin = nodes.find(n => n.id === currentPlayerNodeId) || { x: 0, y: 0, z: 0, type: "UNKNOWN", id: "", isExplored: true };
    const visibleNodes = nodes.filter(n => n.isExplored);

    const SCALE = 20;
    const CENTER_X = 100;
    const CENTER_Y = 120; // Slightly lower center to see "Forward" better? Or stick to 100.

    // Projection: ISO-ish
    // Invert Y-axis influence so +Coord moves UP screen
    const project = (n: { x: number, y: number, z: number }) => {
        const dx = n.x - origin.x;
        const dy = n.y - origin.y;
        const dz = n.z - origin.z;

        return {
            left: (dx - dy) * SCALE + CENTER_X,
            top: -(dx + dy) * (SCALE * 0.6) - (dz * SCALE) + CENTER_Y
        };
    };

    return (
        <div className="relative w-[200px] h-[200px] bg-black/50 border border-white/10 rounded-lg overflow-hidden shrink-0">
            <div className="absolute top-2 left-2 text-[10px] text-neon-cyan/50 font-mono">TACTICAL MAP</div>

            {visibleNodes.map(node => {
                const pos = project(node);
                const isCurrent = node.id === currentPlayerNodeId;

                return (
                    <div
                        key={node.id}
                        className={`absolute w-3 h-3 rounded-full border transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500
                            ${isCurrent ? 'bg-neon-cyan border-white z-10 shadow-[0_0_10px_#0ff]' :
                                node.type === 'START' ? 'bg-green-900 border-green-500' :
                                    node.type === 'BOSS' ? 'bg-red-900 border-red-500' :
                                        'bg-gray-800 border-gray-600'}
                        `}
                        style={{ left: pos.left, top: pos.top }}
                        title={`[${node.x}, ${node.y}, ${node.z}] ${node.type}`}
                    />
                );
            })}
        </div>
    );
}
