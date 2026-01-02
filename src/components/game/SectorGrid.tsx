import React from 'react';

interface SectorGridProps {
    nodes: any[];
    currentPlayerNodeId: string;
    activeZ?: number;
    playerMarkers?: {
        id: string;
        x: number;
        y: number;
        z: number;
        isCurrent?: boolean;
    }[];
}

export default function SectorGrid({ nodes, currentPlayerNodeId, activeZ, playerMarkers }: SectorGridProps) {
    const SIZE = 3;
    const layers = typeof activeZ === "number" ? [activeZ] : [2, 1, 0];

    // Helper to find node at (x,y,z)
    const getNode = (x: number, y: number, z: number) => nodes.find(n => n.x === x && n.y === y && n.z === z);
    const markersByKey = new Map<string, { id: string; x: number; y: number; z: number; isCurrent?: boolean; }[]>();
    (playerMarkers || []).forEach(marker => {
        const key = `${marker.x}-${marker.y}-${marker.z}`;
        const existing = markersByKey.get(key) || [];
        existing.push(marker);
        markersByKey.set(key, existing);
    });
    const getMarkers = (x: number, y: number, z: number) => markersByKey.get(`${x}-${y}-${z}`) || [];

    return (
        <div className="flex flex-col items-center justify-center gap-8 perspective-1000 pt-6 pb-6 w-full overflow-x-auto">
            {layers.map(z => (
                <div key={z} className="relative group">
                    {/* Layer Label */}
                    <div className="absolute -left-12 top-1/2 -translate-y-1/2 text-xs font-mono text-neon-cyan/50 -rotate-90">
                        DECK {z}
                    </div>

                    {/* Grid Plane */}
                    <div
                        className="grid grid-cols-3 gap-2 p-2 bg-black/40 border border-white/10 transform transition-all duration-500 hover:rotate-x-0 group-hover:scale-105"
                        style={{
                            transform: `rotateX(60deg) rotateZ(45deg) translateZ(${z * 20}px)`,
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                        }}
                    >
                        {Array.from({ length: SIZE }).map((_, row) => {
                            // Map logic: y is usually South->North (0->2).
                            // But grid renders row 0 at top. So row 0 is y=2 (North), row 2 is y=0 (South).
                            const y = SIZE - 1 - row;

                            return Array.from({ length: SIZE }).map((_, col) => {
                                const x = col;
                                const node = getNode(x, y, z);
                                const markers = getMarkers(x, y, z);
                                const isCurrent = node?.id === currentPlayerNodeId;
                                const isBoss = x === 1 && y === 2 && z === 2;

                                let statusColor = "bg-gray-800/20 border-gray-800";
                                if (isCurrent) statusColor = "bg-neon-cyan border-neon-cyan shadow-[0_0_15px_#0ff] z-50";
                                else if (isBoss) statusColor = "bg-red-900/40 border-red-500/50";
                                else if (node?.isExplored) statusColor = "bg-gray-700/40 border-gray-500";

                                return (
                                    <div
                                        key={`${x}-${y}-${z}`}
                                        className={`
                                            w-8 h-8 flex items-center justify-center border transition-all duration-300
                                            ${statusColor}
                                            ${isCurrent ? 'scale-125 translate-z-4' : ''}
                                        `}
                                    >
                                        {markers.length > 0 && (
                                            <div className="flex items-center gap-0.5">
                                                {markers.slice(0, 3).map((marker, idx) => (
                                                    <div key={`${marker.id}-${idx}`} className="relative">
                                                        {marker.isCurrent && (
                                                            <div className="absolute inset-0 rounded-full bg-neon-cyan/60 animate-ping" />
                                                        )}
                                                        <div className={`w-2 h-2 rounded-full ${marker.isCurrent ? "bg-neon-cyan shadow-[0_0_6px_rgba(0,255,255,0.8)]" : "bg-white/70"}`} />
                                                    </div>
                                                ))}
                                                {markers.length > 3 && (
                                                    <div className="text-[6px] text-gray-200">+{markers.length - 3}</div>
                                                )}
                                            </div>
                                        )}
                                        {!isCurrent && isBoss && <div className="text-[6px] text-red-500">BOSS</div>}
                                    </div>
                                );
                            });
                        })}

                        {/* Airlock Entry Node (Outside the Cube: 1, -1, 0) */}
                        {z === 0 && (() => {
                            const node = getNode(1, -1, 0);
                            const entryMarkers = getMarkers(1, -1, 0);
                            const isCurrent = node?.id === currentPlayerNodeId;

                            return (
                                <div
                                    className={`
                                        absolute -bottom-12 left-1/2 -translate-x-1/2 
                                        w-8 h-8 flex items-center justify-center border 
                                        transition-all duration-300
                                        ${isCurrent ? "bg-neon-cyan border-neon-cyan shadow-[0_0_15px_#0ff] scale-125 z-50" : "bg-green-900/40 border-green-500/50"}
                                    `}
                                >
                                    {entryMarkers.length > 0 && (
                                        <div className="flex items-center gap-0.5">
                                            {entryMarkers.slice(0, 3).map((marker, idx) => (
                                                <div key={`${marker.id}-${idx}`} className="relative">
                                                    {marker.isCurrent && (
                                                        <div className="absolute inset-0 rounded-full bg-neon-cyan/60 animate-ping" />
                                                    )}
                                                    <div className={`w-2 h-2 rounded-full ${marker.isCurrent ? "bg-neon-cyan shadow-[0_0_6px_rgba(0,255,255,0.8)]" : "bg-white/70"}`} />
                                                </div>
                                            ))}
                                            {entryMarkers.length > 3 && (
                                                <div className="text-[6px] text-gray-200">+{entryMarkers.length - 3}</div>
                                            )}
                                        </div>
                                    )}
                                    {!isCurrent && <div className="text-[6px] text-green-500">ENTRY</div>}

                                    {/* Connection Line */}
                                    <div className="absolute -top-4 w-0.5 h-4 bg-green-500/20" />
                                </div>
                            );
                        })()}
                    </div>
                </div>
            ))}

            <style jsx>{`
                .perspective-1000 { perspective: 1000px; }
                .rotate-x-60 { transform: rotateX(60deg) rotateZ(-45deg); }
            `}</style>
        </div>
    );
}
