import React from 'react';

interface SectorGridProps {
    nodes: any[];
    currentPlayerNodeId: string;
    activeZ?: number;
    rotation?: number;
    facing?: string; // "NORTH", "EAST", "SOUTH", "WEST"
    playerMarkers?: {
        id: string;
        x: number;
        y: number;
        z: number;
        isCurrent?: boolean;
    }[];
}

function parseJSON(raw: any, fallback: any) {
    try { return JSON.parse(raw); } catch { return fallback; }
}

export default function SectorGrid({ nodes, currentPlayerNodeId, activeZ, rotation = 0, facing = "NORTH", playerMarkers }: SectorGridProps) {
    const SIZE = 7;
    const layers = typeof activeZ === "number" ? [activeZ] : [2, 1, 0];
    const suitColors: Record<string, { text: string; border: string }> = {
        COMMAND: { text: "text-green-400", border: "border-green-500/40" },
        BIOTECH: { text: "text-red-400", border: "border-red-500/40" },
        PLASMA: { text: "text-orange-400", border: "border-orange-500/40" },
        VOID: { text: "text-purple-400", border: "border-purple-500/40" }
    };

    // ... (lines 28-58 unchanged)

    // Helper to find node at (x,y,z)
    const getNode = (x: number, y: number, z: number) => nodes.find(n => n.x === x && n.y === y && n.z === z);
    const markersByKey = new Map<string, { id: string; x: number; y: number; z: number; isCurrent?: boolean; }[]>();

    // Find current player position for centering
    // If no markers, default to 1,1 (center of a 0-2 grid)
    const currentPlayerMarker = (playerMarkers || []).find(m => m.isCurrent);
    const centerX = currentPlayerMarker?.x ?? 1;
    const centerY = currentPlayerMarker?.y ?? 1;

    // Calculate Grid Bounds (7x7 centered on player)
    // Grid Viewport: [centerX-3, centerX+3] x [centerY-3, centerY+3]
    const startX = centerX - 3;
    const startY = centerY - 3;

    (playerMarkers || []).forEach(marker => {
        const key = `${marker.x}-${marker.y}-${marker.z}`;
        const existing = markersByKey.get(key) || [];
        existing.push(marker);
        markersByKey.set(key, existing);
    });
    const getMarkers = (x: number, y: number, z: number) => markersByKey.get(`${x}-${y}-${z}`) || [];

    // Starfield Parallax / Rotation Style
    // ... (lines 80-141 unchanged)

    return (
        <div className="flex flex-col items-center justify-center gap-4 perspective-1000 w-full h-full overflow-hidden relative bg-black">
            {/* Star Sphere Background (CSS Procedural V13) */}
            {/* ... (lines 115-141 unchanged) */}


            {layers.map(z => (
                <div key={z} className="relative group z-10">
                    {/* Grid Plane */}
                    <div
                        className="grid grid-cols-7 gap-2 p-2 bg-black/10 border border-white/5 transform transition-all duration-500 hover:rotate-x-0 group-hover:scale-105 backdrop-blur-sm"
                        style={{
                            transform: `rotateX(60deg) rotateZ(45deg) translateZ(${z * 20}px)`,
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                        }}
                    >
                        {Array.from({ length: SIZE }).map((_, row) => {
                            // Row 0 corresponds to max Y (North), Row 6 to min Y (South) in the 7x7 viewport
                            // Viewport Y range: startY (bottom) to startY + SIZE - 1 (top)
                            const y = startY + (SIZE - 1 - row);

                            return Array.from({ length: SIZE }).map((_, col) => {
                                const x = startX + col;

                                const node = getNode(x, y, z);
                                const markers = getMarkers(x, y, z);
                                const isCurrent = node?.id === currentPlayerNodeId; // Should match if centered correctly
                                const isBoss = node?.type === 'BOSS';

                                const scanned = Boolean(node?.scanned);
                                const isExplored = Boolean(node?.isExplored);

                                const security = node?.security ?? 0;
                                const scanFailed = scanned && security <= 0;
                                const secured = scanned && security >= 2;
                                const suit = node?.roomSuit || "";
                                const suitStyle = suitColors[suit] || { text: "text-gray-400", border: "border-gray-700" };
                                const suitAbbr = suit ? suit.slice(0, 3).toUpperCase() : "";

                                let statusColor = "bg-gray-800/20 border-gray-800";
                                if (isCurrent) statusColor = "bg-neon-cyan/20 border-neon-cyan shadow-[0_0_15px_rgba(0,255,255,0.3)] z-50";
                                else if (isBoss) statusColor = "bg-red-900/40 border-red-500/50";
                                else if (scanned && scanFailed) statusColor = "bg-gray-900/60 border-gray-700";
                                else if (scanned && secured) statusColor = `bg-black/80 ${suitStyle.border}`;
                                else if (scanned) statusColor = "bg-gray-800/60 border-gray-500";
                                else if (node?.isExplored) statusColor = "bg-gray-900/40 border-gray-700 border-dashed";

                                // Fog of War: Check if visible OR if it's a neighbor (Door/Hatch)
                                // Neighbor distance (Manhattan) = 1 (across X, Y, Z)
                                const zDiff = Math.abs(z - (currentPlayerMarker?.z ?? 0));
                                const dist = Math.abs(x - centerX) + Math.abs(y - centerY) + zDiff;
                                const isNeighbor = dist === 1;

                                const hasDoor = node && isNeighbor && !isExplored;
                                const isHatch = isNeighbor && zDiff === 1 && !isExplored && node; // Specifically a vertical non-explored neighbor

                                // Render empty cell if no node (void space in parallax) OR if it is the Airlock
                                // Airlock is at (1, -1, 0).
                                const isAirlock = x === 1 && y === -1 && z === 0;

                                // Fog Logic: Hide if not explored AND not a revealed door AND not current AND not Airlock
                                if ((!node && !isCurrent) || isAirlock || (!isExplored && !hasDoor && !isCurrent)) {
                                    if (hasDoor) {
                                        // Render "Door" or "Hatch" marker for unexplored neighbor
                                        return (
                                            <div key={`${x}-${y}-${z}`} className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center border border-dashed border-gray-700 bg-gray-900/20 opacity-50">
                                                {isHatch ? (
                                                    <div className="w-6 h-6 rounded-full border border-gray-500/50 flex items-center justify-center">
                                                        <div className="w-2 h-2 bg-gray-600 rounded-full" />
                                                    </div>
                                                ) : (
                                                    <div className="w-4 h-4 border border-gray-600/50" />
                                                )}
                                            </div>
                                        );
                                    }
                                    return <div key={`${x}-${y}-${z}`} className="w-9 h-9 md:w-10 md:h-10 opacity-5 border border-white/5" />
                                }

                                return (
                                    <div
                                        key={`${x}-${y}-${z}`}
                                        className={`
                                            w-9 h-9 md:w-10 md:h-10 flex items-center justify-center border transition-all duration-300 relative
                                            ${statusColor}
                                            ${isCurrent ? 'scale-110 translate-z-4' : ''}
                                        `}
                                    >
                                        {markers.length > 0 && (
                                            <div className="flex items-center justify-center w-full h-full">
                                                {markers.slice(0, 3).map((marker, idx) => {
                                                    if (marker.isCurrent) {
                                                        const rotClass = {
                                                            "NORTH": "rotate-0",
                                                            "EAST": "rotate-90",
                                                            "SOUTH": "rotate-180",
                                                            "WEST": "-rotate-90"
                                                        }[facing] || "rotate-0";

                                                        return (
                                                            <div key={`${marker.id}-${idx}`} className={`relative w-8 h-8 flex items-center justify-center transition-transform duration-300 ${rotClass}`}>
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]">
                                                                    <path d="M12 2L2 22L12 18L22 22L12 2Z" />
                                                                </svg>
                                                            </div>
                                                        );
                                                    }
                                                    return (
                                                        <div key={`${marker.id}-${idx}`} className="w-3 h-3 rounded-full bg-yellow-400 border border-black shadow-sm mx-[1px]" title="Squadmate" />
                                                    );
                                                })}
                                            </div>
                                        )}
                                        
                                        {/* LED Status Indicators */}
                                        {node && isExplored && ( // Only show LEDs if explored
                                            <div className="absolute top-0 left-0 w-full h-1 flex gap-[2px] opacity-80 px-[1px]">
                                                {/* Blue LED: Scanned */}
                                                <div className={`h-full flex-1 rounded-full text-[4px] flex items-center justify-center transition-colors ${scanned ? "bg-neon-cyan shadow-[0_0_4px_#0ff]" : "bg-gray-800"}`} />
                                                {/* Green LED: Secured */}
                                                <div className={`h-full flex-1 rounded-full transition-colors ${secured ? "bg-green-500 shadow-[0_0_4px_#0f0]" : "bg-gray-800"}`} />
                                                {/* Red LED: Enemies */}
                                                {parseJSON(node.enemies || "[]", []).length > 0 && (
                                                    <div className="h-full flex-1 rounded-full bg-red-500 animate-pulse shadow-[0_0_4px_#f00]" />
                                                )}
                                            </div>
                                        )}

                                        {!isCurrent && isBoss && isExplored && <div className="text-[6px] text-red-500 font-bold">BOSS</div>} {/* Only show BOSS if explored */}
                                        {scanned && isExplored && ( // Only show roomPower if explored
                                            <div className="absolute bottom-0.5 right-0.5 text-[8px] font-bold text-gray-400">
                                                {node?.roomPower ?? "?"}
                                            </div>
                                        )}
                                        {scanned && suitAbbr && (
                                            <div className={`absolute top-1.5 left-0.5 text-[8px] font-bold ${suitStyle.text}`}>
                                                {suitAbbr}
                                            </div>
                                        )}
                                    </div>
                                );
                            });
                        })}

                        {/* AIRLOCK (Dynamic Placement V7) */}
                        {z === 0 && (() => {
                            const entryNode = getNode(1, -1, 0);
                            const entryMarkers = getMarkers(1, -1, 0);
                            const isCurrent = entryMarkers.some(m => m.isCurrent);

                            // Calculate position relative to the viewport center (centerX, centerY)
                            const deltaX = 1 - centerX;
                            const deltaRows = centerY - (-1);

                            // Fog of War (V10): Hide if too far
                            if (deltaRows > 2) return null;

                            // Position Fix: ~34% per cell (1/3 of container) so it moves 1:1 with grid
                            const CELL_OFFSET_PCT = 34;

                            return (
                                <div
                                    className="absolute w-10 h-10 flex items-center justify-center transition-all duration-500 z-0"
                                    style={{
                                        left: `calc(50% + ${deltaX * CELL_OFFSET_PCT}%)`,
                                        top: `calc(50% + ${deltaRows * CELL_OFFSET_PCT}%)`,
                                    }}
                                >
                                    <div className={`
                                        w-9 h-9 md:w-10 md:h-10 flex items-center justify-center border 
                                        transition-all duration-300 bg-green-900/40 border-green-500/50 relative
                                        ${isCurrent ? "shadow-[0_0_15px_#0f0] border-green-400 scale-110" : ""}
                                    `}>
                                        <div className="text-[6px] text-green-500 font-bold">AIRLOCK</div>

                                        {/* Umbilical Cord to Grid Entry */}
                                        <div className="absolute bottom-[100%] left-1/2 -translate-x-1/2 w-1 h-[20%] bg-green-500/30" />

                                        {/* Markers */}
                                        {entryMarkers.length > 0 && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                {entryMarkers.slice(0, 3).map((marker, idx) => (
                                                    <div key={idx} className="relative w-8 h-8 flex items-center justify-center">
                                                        {marker.isCurrent ? (
                                                            (() => {
                                                                const rotClass = { "NORTH": "rotate-0", "EAST": "rotate-90", "SOUTH": "rotate-180", "WEST": "-rotate-90" }[facing] || "rotate-0";
                                                                return (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-6 h-6 text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)] transition-transform duration-300 ${rotClass}`}>
                                                                        <path d="M12 2L2 22L12 18L22 22L12 2Z" />
                                                                    </svg>
                                                                );
                                                            })()
                                                        ) : (
                                                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            ))}

            {/* V17: Static Deck Indicator (Bottom Left) */}
            <div className="absolute bottom-4 left-4 text-2xl font-black font-mono text-neon-cyan tracking-widest pointer-events-none z-50 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
                DECK {currentPlayerMarker?.z ?? 0}
            </div>

            <style jsx>{`
                .perspective-1000 { perspective: 1000px; }
                .rotate-x-60 { transform: rotateX(60deg) rotateZ(-45deg); }
            `}</style>
        </div>
    );
}
