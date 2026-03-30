import React from 'react';

interface SectorGridProps {
    nodes: any[];
    currentPlayerNodeId: string;
    activeZ?: number;
    rotation?: number;
    facing?: string;
    fullMap?: boolean;
    fullMapFocusZ?: number;
    selectedNodeId?: string | null;
    onNodeHover?: (nodeId: string | null) => void;
    onNodeSelect?: (nodeId: string) => void;
    recentMovement?: {
        from: { x: number; y: number; z: number };
        to: { x: number; y: number; z: number };
        direction?: string | null;
        durationMs?: number;
        ts: number;
    } | null;
    playerMarkers?: {
        id: string;
        x: number;
        y: number;
        z: number;
        isCurrent?: boolean;
    }[];
}

type PlayerMarker = {
    id: string;
    x: number;
    y: number;
    z: number;
    isCurrent?: boolean;
};

function parseJSON(raw: any, fallback: any) {
    try { return JSON.parse(raw); } catch { return fallback; }
}

function normalizeConnections(raw: any) {
    if (Array.isArray(raw)) return raw;
    return parseJSON(raw || "[]", []);
}

function getBounds(nodes: any[], markers: PlayerMarker[], centerX: number, centerY: number, fullMap: boolean) {
    if (!fullMap) {
        return {
            minX: centerX - 3,
            maxX: centerX + 3,
            minY: centerY - 3,
            maxY: centerY + 3,
            width: 7,
            height: 7
        };
    }

    const xs = [...nodes.map((node) => Number(node.x)), ...markers.map((marker) => Number(marker.x)), 1];
    const ys = [...nodes.map((node) => Number(node.y)), ...markers.map((marker) => Number(marker.y)), -1];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
    };
}

function getCellSize(fullMap: boolean, width: number, height: number) {
    if (!fullMap) return 40;

    const longestSide = Math.max(width, height);
    if (longestSide >= 11) return 16;
    if (longestSide >= 9) return 19;
    if (longestSide >= 7) return 23;
    return 27;
}

const DIRECTION_VECTORS: Record<string, { x: number; y: number; z: number }> = {
    FORWARD: { x: 0, y: 1, z: 0 },
    BACK: { x: 0, y: -1, z: 0 },
    LEFT: { x: -1, y: 0, z: 0 },
    RIGHT: { x: 1, y: 0, z: 0 },
    UP: { x: 0, y: 0, z: 1 },
    DOWN: { x: 0, y: 0, z: -1 }
};

function getMarkerTravelAnimation(direction?: string | null) {
    switch (direction) {
        case "FORWARD": return "markerTravelForward";
        case "BACK": return "markerTravelBack";
        case "LEFT": return "markerTravelLeft";
        case "RIGHT": return "markerTravelRight";
        case "UP": return "markerTravelUp";
        case "DOWN": return "markerTravelDown";
        default: return "markerHop";
    }
}

function isNodeScanComplete(node: any) {
    return Boolean(node && (node.type === "START" || node.scanned));
}

function isNodeSecureComplete(node: any) {
    return Boolean(node && (node.type === "START" || Number(node.security ?? 0) >= 2));
}

function getGridCellPosition(x: number, y: number, bounds: { minX: number; maxY: number }, cellSize: number, gap: number) {
    return {
        left: 8 + (x - bounds.minX) * (cellSize + gap),
        top: 8 + (bounds.maxY - y) * (cellSize + gap)
    };
}

export default function SectorGrid({
    nodes,
    currentPlayerNodeId,
    activeZ,
    rotation = 0,
    facing = "NORTH",
    fullMap = false,
    fullMapFocusZ,
    selectedNodeId,
    onNodeHover,
    onNodeSelect,
    recentMovement,
    playerMarkers
}: SectorGridProps) {
    const suitColors: Record<string, { text: string; border: string }> = {
        COMMAND: { text: "text-green-400", border: "border-green-500/40" },
        BIOTECH: { text: "text-red-400", border: "border-red-500/40" },
        PLASMA: { text: "text-orange-400", border: "border-orange-500/40" },
        VOID: { text: "text-purple-400", border: "border-purple-500/40" }
    };
    const suitLineColors: Record<string, string> = {
        COMMAND: "rgba(74, 222, 128, 0.72)",
        BIOTECH: "rgba(248, 113, 113, 0.72)",
        PLASMA: "rgba(251, 146, 60, 0.75)",
        VOID: "rgba(192, 132, 252, 0.75)"
    };

    const markers = playerMarkers || [];
    const markersByKey = new Map<string, PlayerMarker[]>();
    markers.forEach((marker) => {
        const key = `${marker.x}-${marker.y}-${marker.z}`;
        const existing = markersByKey.get(key) || [];
        existing.push(marker);
        markersByKey.set(key, existing);
    });

    const getMarkers = (x: number, y: number, z: number) => markersByKey.get(`${x}-${y}-${z}`) || [];
    const getNode = (x: number, y: number, z: number) => nodes.find((node) => node.x === x && node.y === y && node.z === z);

    const currentPlayerMarker = markers.find((marker) => marker.isCurrent);
    const centerX = currentPlayerMarker?.x ?? 1;
    const centerY = currentPlayerMarker?.y ?? 1;
    const bounds = getBounds(nodes, markers, centerX, centerY, fullMap);
    const cellSize = getCellSize(fullMap, bounds.width, bounds.height);
    const gap = fullMap ? Math.max(2, Math.round(cellSize * 0.12)) : 8;
    const layers = fullMap
        ? Array.from(new Set(nodes.map((node) => Number(node.z ?? 0)))).sort((a, b) => b - a)
        : typeof activeZ === "number"
            ? [activeZ]
            : Array.from(new Set(nodes.map((node) => Number(node.z ?? 0)))).sort((a, b) => b - a);
    const markerSize = fullMap ? Math.max(12, Math.round(cellSize * 0.7)) : 24;
    const squadDotSize = fullMap ? Math.max(4, Math.round(cellSize * 0.22)) : 12;
    const roomLabelSize = fullMap ? Math.max(5, Math.round(cellSize * 0.22)) : 6;
    const statSize = fullMap ? Math.max(5, Math.round(cellSize * 0.22)) : 8;
    const viewLabel = fullMap ? "" : `DECK ${typeof activeZ === "number" ? activeZ : currentPlayerMarker?.z ?? 0}`;
    const fullMapCenterDeck = fullMap && typeof fullMapFocusZ === "number" && layers.includes(fullMapFocusZ)
        ? fullMapFocusZ
        : layers[Math.floor(layers.length / 2)] ?? 0;
    const focusIndex = layers.indexOf(fullMapCenterDeck);
    const middleIndex = Math.floor(layers.length / 2);
    const layerGridHeight = bounds.height * cellSize + Math.max(0, bounds.height - 1) * gap;
    const layerPaddingY = fullMap ? 12 : 16;
    const layerGapY = fullMap ? 10 : 16;
    const deckStride = Math.max(fullMap ? 92 : 112, layerGridHeight + layerPaddingY + layerGapY);
    const fullMapYOffset = fullMap ? (middleIndex - focusIndex) * deckStride : 0;
    const tacticalRotation = fullMap ? 0 : rotation;
    const uprightStyle = tacticalRotation ? { transform: `rotate(${-tacticalRotation}deg)` } : undefined;
    const currentMarkerRotation = fullMap
        ? ({
            NORTH: 0,
            EAST: 90,
            SOUTH: 180,
            WEST: -90
        }[facing] || 0)
        : -tacticalRotation;
    const markerTravelAnimation = getMarkerTravelAnimation(recentMovement?.direction);
    const markerTravelDurationMs = Math.max(520, Math.round(Number(recentMovement?.durationMs ?? 560) * 0.94));

    return (
        <div className={`flex h-full w-full flex-col items-center justify-center overflow-hidden relative bg-black ${fullMap ? "gap-2" : "gap-4"}`}>
            <style jsx global>{`
                @keyframes markerHop {
                    0% { transform: translateY(32%) scale(0.82); }
                    42% { transform: translateY(-24%) scale(1.14); }
                    100% { transform: translateY(0) scale(1); }
                }
                @keyframes markerTravelForward {
                    0% { transform: translateY(88%) scale(0.76); opacity: 0.28; }
                    52% { transform: translateY(-22%) scale(1.12); opacity: 1; }
                    100% { transform: translateY(0) scale(1); opacity: 1; }
                }
                @keyframes markerTravelBack {
                    0% { transform: translateY(-88%) scale(0.76); opacity: 0.28; }
                    52% { transform: translateY(22%) scale(1.12); opacity: 1; }
                    100% { transform: translateY(0) scale(1); opacity: 1; }
                }
                @keyframes markerTravelLeft {
                    0% { transform: translateX(86%) translateY(10%) scale(0.76); opacity: 0.28; }
                    52% { transform: translateX(-18%) translateY(-12%) scale(1.12); opacity: 1; }
                    100% { transform: translateX(0) scale(1); opacity: 1; }
                }
                @keyframes markerTravelRight {
                    0% { transform: translateX(-86%) translateY(10%) scale(0.76); opacity: 0.28; }
                    52% { transform: translateX(18%) translateY(-12%) scale(1.12); opacity: 1; }
                    100% { transform: translateX(0) scale(1); opacity: 1; }
                }
                @keyframes markerTravelUp {
                    0% { transform: translateY(62%) scale(0.66); opacity: 0.26; }
                    55% { transform: translateY(-26%) scale(1.16); opacity: 1; }
                    100% { transform: translateY(0) scale(1); opacity: 1; }
                }
                @keyframes markerTravelDown {
                    0% { transform: translateY(-62%) scale(1.12); opacity: 0.26; }
                    55% { transform: translateY(22%) scale(0.78); opacity: 1; }
                    100% { transform: translateY(0) scale(1); opacity: 1; }
                }
                @keyframes markerTraverse {
                    0% {
                        transform: translate(var(--from-x), var(--from-y)) scale(0.78);
                        opacity: 0.35;
                    }
                    52% {
                        transform: translate(calc((var(--from-x) + var(--to-x)) / 2), calc(((var(--from-y) + var(--to-y)) / 2) - 10px)) scale(1.14);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(var(--to-x), var(--to-y)) scale(1);
                        opacity: 1;
                    }
                }
            `}</style>
            <div
                className={`flex flex-col items-center justify-center transition-transform duration-500 ease-out ${fullMap ? "gap-2" : "gap-4"}`}
                style={fullMap ? { transform: `translateY(${fullMapYOffset}px)` } : undefined}
            >
                {layers.map((z) => {
                    const transitOverlay = !fullMap && recentMovement?.ts && recentMovement.from.z === z && recentMovement.to.z === z
                        ? (() => {
                            const markerOffset = (cellSize - markerSize) / 2;
                            const fromCell = getGridCellPosition(recentMovement.from.x, recentMovement.from.y, bounds, cellSize, gap);
                            const toCell = getGridCellPosition(recentMovement.to.x, recentMovement.to.y, bounds, cellSize, gap);
                            return {
                                fromLeft: fromCell.left + markerOffset,
                                fromTop: fromCell.top + markerOffset,
                                toLeft: toCell.left + markerOffset,
                                toTop: toCell.top + markerOffset
                            };
                        })()
                        : null;

                    return (
                <div key={z} className="relative group z-10">
                    {fullMap && (
                        <div className="absolute -left-10 top-2 z-20 rounded-full border border-white/10 bg-black/70 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.25em] text-gray-300">
                            Deck {z}
                        </div>
                    )}
                    <div
                        className="relative grid p-2 bg-black/10 border border-white/5 transform transition-all duration-500 backdrop-blur-sm"
                        style={{
                            gridTemplateColumns: `repeat(${bounds.width}, ${cellSize}px)`,
                            gridAutoRows: `${cellSize}px`,
                            gap: `${gap}px`,
                            transform: tacticalRotation ? `rotate(${tacticalRotation}deg)` : undefined,
                            boxShadow: fullMap ? "0 8px 24px rgba(0,0,0,0.35)" : "0 10px 24px rgba(0,0,0,0.45)"
                        }}
                    >
                        {Array.from({ length: bounds.height }).map((_, row) => {
                            const y = bounds.maxY - row;

                            return Array.from({ length: bounds.width }).map((__, col) => {
                                const x = bounds.minX + col;
                                const node = getNode(x, y, z);
                                const cellMarkers = getMarkers(x, y, z);
                                const hasCurrentMarker = cellMarkers.some((marker) => marker.isCurrent);
                                const isCurrent = !transitOverlay && Boolean(node?.id === currentPlayerNodeId || hasCurrentMarker);
                                const isSelected = Boolean(node?.id && selectedNodeId && node.id === selectedNodeId);
                                const isMoveFrom = Boolean(node && recentMovement &&
                                    x === recentMovement.from.x &&
                                    y === recentMovement.from.y &&
                                    z === recentMovement.from.z
                                );
                                const isMoveTo = Boolean(node && recentMovement &&
                                    x === recentMovement.to.x &&
                                    y === recentMovement.to.y &&
                                    z === recentMovement.to.z
                                );
                                const isBoss = node?.type === 'BOSS';
                                const isStart = node?.type === 'START';
                                const isCorridor = node?.type === "CORRIDOR";
                                const isRoomNode = Boolean(node && !isCorridor);
                                const scanned = isNodeScanComplete(node);
                                const isExplored = Boolean(node?.isExplored);
                                const security = node?.security ?? 0;
                                const hasEnemies = Boolean(node?.enemies && parseJSON(node.enemies || "[]", []).length > 0);
                                const scanFailed = scanned && !isStart && security <= 0;
                                const secured = isNodeSecureComplete(node);
                                const suit = node?.roomSuit || "";
                                const suitStyle = suitColors[suit] || { text: "text-gray-400", border: "border-gray-700" };
                                const suitAbbr = suit ? (fullMap ? suit.slice(0, 1).toUpperCase() : suit.slice(0, 3).toUpperCase()) : "";
                                const connectionDirections = normalizeConnections(node?.connections);
                                const validConnectionDirections = connectionDirections.filter((direction: string) => {
                                    const delta = DIRECTION_VECTORS[direction];
                                    if (!delta) return false;
                                    return Boolean(getNode(x + delta.x, y + delta.y, z + delta.z));
                                });
                                const zDiff = Math.abs(z - (currentPlayerMarker?.z ?? 0));
                                const dist = Math.abs(x - centerX) + Math.abs(y - centerY) + zDiff;
                                const isNeighbor = dist === 1;
                                const hasDoor = Boolean(node && isNeighbor && !isExplored);
                                const isHatch = Boolean(isNeighbor && zDiff === 1 && !isExplored && node);
                                const connectorLength = Math.max(6, Math.round(cellSize * 0.36));
                                const connectorThickness = Math.max(2, Math.round(cellSize * 0.12));
                                const wallThickness = Math.max(1, Math.round(cellSize * 0.08));
                                const wallInset = Math.max(2, Math.round(cellSize * 0.18));
                                const connectorColor = isCurrent
                                    ? "rgba(34, 211, 238, 0.95)"
                                    : hasEnemies
                                        ? "rgba(248, 113, 113, 0.82)"
                                        : suitLineColors[suit] || "rgba(226, 232, 240, 0.55)";
                                const wallColor = fullMap ? "rgba(71, 85, 105, 0.7)" : "rgba(30, 41, 59, 0.88)";
                                const showsStructuralOverlay = Boolean(node && (fullMap || isExplored || scanned || isCurrent));
                                const hasUp = validConnectionDirections.includes("UP");
                                const hasDown = validConnectionDirections.includes("DOWN");

                                let statusColor = fullMap ? `bg-black/80 ${suitStyle.border}` : "bg-gray-800/20 border-gray-800";
                                let dangerGlow = null;
                                let dangerBadge = null;

                                if (isCurrent) {
                                    statusColor = "bg-neon-cyan/20 border-neon-cyan shadow-[0_0_15px_rgba(0,255,255,0.3)] z-50";
                                } else if (isCorridor) {
                                    statusColor = "bg-transparent border-transparent";
                                } else if (isStart) {
                                    statusColor = "bg-green-900/40 border-green-500/50";
                                } else if (isBoss) {
                                    statusColor = "bg-red-900/40 border-red-500/50";
                                    dangerGlow = "shadow-[0_0_12px_rgba(239,68,68,0.4)]";
                                } else if (hasEnemies) {
                                    statusColor = "bg-red-950/30 border-red-600/50";
                                    dangerGlow = "shadow-[0_0_8px_rgba(220,38,38,0.3)]";
                                    dangerBadge = <span className="absolute -top-1 -right-1 text-[6px] font-bold text-red-500">!</span>;
                                } else if (security >= 2) {
                                    statusColor = "bg-orange-950/30 border-orange-600/50";
                                    dangerBadge = <span className="absolute -top-1 -right-1 text-[6px] font-bold text-orange-500">⚠</span>;
                                } else if (scanned && scanFailed) {
                                    statusColor = "bg-gray-900/60 border-gray-700";
                                } else if (scanned && secured) {
                                    statusColor = `bg-black/80 ${suitStyle.border}`;
                                } else if (scanned) {
                                    statusColor = "bg-gray-800/60 border-gray-500";
                                } else if (isExplored) {
                                    statusColor = "bg-gray-900/40 border-gray-700 border-dashed";
                                    dangerBadge = <span className="absolute -bottom-1 -left-1 text-[6px] font-bold text-yellow-500 opacity-70">?</span>;
                                }

                                if (!fullMap && (((!node && !isCurrent) || (!isExplored && !hasDoor && !isCurrent)))) {
                                    if (hasDoor) {
                                        return (
                                            <div
                                                key={`${x}-${y}-${z}`}
                                                className="flex items-center justify-center border border-dashed border-gray-700 bg-gray-900/20 opacity-50"
                                                style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                                            >
                                                {isHatch ? (
                                                    <div className="rounded-full border border-gray-500/50 flex items-center justify-center" style={{ width: `${Math.max(10, cellSize * 0.6)}px`, height: `${Math.max(10, cellSize * 0.6)}px` }}>
                                                        <div className="bg-gray-600 rounded-full" style={{ width: `${Math.max(4, cellSize * 0.2)}px`, height: `${Math.max(4, cellSize * 0.2)}px` }} />
                                                    </div>
                                                ) : (
                                                    <div className="border border-gray-600/50" style={{ width: `${Math.max(8, cellSize * 0.4)}px`, height: `${Math.max(8, cellSize * 0.4)}px` }} />
                                                )}
                                            </div>
                                        );
                                    }

                                    return (
                                        <div
                                            key={`${x}-${y}-${z}`}
                                            className="opacity-5 border border-white/5"
                                            style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                                        />
                                    );
                                }

                                if (!node && !isCurrent) {
                                    return (
                                        <div
                                            key={`${x}-${y}-${z}`}
                                            className={`${fullMap ? "opacity-20 border border-white/5 bg-white/[0.02]" : "opacity-5 border border-white/5"}`}
                                            style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                                        />
                                    );
                                }

                                return (
                                    <div
                                        key={`${x}-${y}-${z}`}
                                        className={`
                                            flex items-center justify-center border transition-all duration-300 relative
                                            ${statusColor}
                                            ${isCurrent ? 'scale-110 translate-z-4' : ''}
                                            ${node ? 'cursor-pointer' : ''}
                                            ${dangerGlow || ''}
                                        `}
                                        style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                                        onMouseEnter={() => node && onNodeHover?.(node.id)}
                                        onMouseLeave={() => node && onNodeHover?.(null)}
                                        onClick={() => node && onNodeSelect?.(node.id)}
                                        title={node ? `[${node.x}, ${node.y}, ${node.z}] ${node.type}` : undefined}
                                    >
                                        {isSelected && (
                                            <div
                                                className="pointer-events-none absolute border border-white/80 shadow-[inset_0_0_12px_rgba(255,255,255,0.16)]"
                                                style={{
                                                    inset: `${Math.max(2, Math.round(cellSize * 0.12))}px`,
                                                    borderRadius: `${Math.max(4, Math.round(cellSize * 0.18))}px`
                                                }}
                                            />
                                        )}
                                        {isMoveTo && (
                                            <div
                                                className="pointer-events-none absolute animate-pulse rounded-full border border-cyan-300/80 shadow-[0_0_16px_rgba(34,211,238,0.7)]"
                                                style={{
                                                    inset: `${Math.max(1, Math.round(cellSize * 0.08))}px`
                                                }}
                                            />
                                        )}
                                        {node && !isCurrent && (
                                            <div
                                                className={`pointer-events-none absolute ${
                                                    isCorridor
                                                        ? "border border-slate-600/80 bg-slate-950/95"
                                                        : "border border-white/10 bg-black/45"
                                                }`}
                                                style={{
                                                    inset: isCorridor
                                                        ? `${Math.max(8, Math.round(cellSize * 0.26))}px`
                                                        : `${Math.max(2, Math.round(cellSize * 0.12))}px`,
                                                    borderRadius: isCorridor
                                                        ? `${Math.max(8, Math.round(cellSize * 0.28))}px`
                                                        : `${Math.max(4, Math.round(cellSize * 0.18))}px`
                                                }}
                                            />
                                        )}
                                        {showsStructuralOverlay && (
                                            <>
                                                {(["FORWARD", "BACK", "LEFT", "RIGHT"] as const).map((direction) => {
                                                    const hasConnection = validConnectionDirections.includes(direction);
                                                    if (hasConnection) {
                                                        const lineStyle = direction === "FORWARD"
                                                            ? { top: 0, left: "50%", width: `${connectorThickness}px`, height: `${connectorLength}px`, transform: "translateX(-50%)" }
                                                            : direction === "BACK"
                                                                ? { bottom: 0, left: "50%", width: `${connectorThickness}px`, height: `${connectorLength}px`, transform: "translateX(-50%)" }
                                                                : direction === "LEFT"
                                                                    ? { left: 0, top: "50%", width: `${connectorLength}px`, height: `${connectorThickness}px`, transform: "translateY(-50%)" }
                                                                    : { right: 0, top: "50%", width: `${connectorLength}px`, height: `${connectorThickness}px`, transform: "translateY(-50%)" };

                                                        return (
                                                            <div
                                                                key={`${direction}-connector`}
                                                                className={`absolute rounded-full opacity-90 ${isMoveFrom && recentMovement?.direction === direction ? "animate-pulse" : ""}`}
                                                                style={{
                                                                    ...lineStyle,
                                                                    backgroundColor: isMoveFrom && recentMovement?.direction === direction ? "rgba(34, 211, 238, 0.98)" : connectorColor,
                                                                    boxShadow: `0 0 ${Math.max(4, connectorThickness * 2)}px ${isMoveFrom && recentMovement?.direction === direction ? "rgba(34, 211, 238, 0.98)" : connectorColor}`
                                                                }}
                                                            />
                                                        );
                                                    }

                                                    const wallStyle = direction === "FORWARD"
                                                        ? { top: 1, left: `${wallInset}px`, width: `calc(100% - ${wallInset * 2}px)`, height: `${wallThickness}px` }
                                                        : direction === "BACK"
                                                            ? { bottom: 1, left: `${wallInset}px`, width: `calc(100% - ${wallInset * 2}px)`, height: `${wallThickness}px` }
                                                            : direction === "LEFT"
                                                                ? { left: 1, top: `${wallInset}px`, width: `${wallThickness}px`, height: `calc(100% - ${wallInset * 2}px)` }
                                                                : { right: 1, top: `${wallInset}px`, width: `${wallThickness}px`, height: `calc(100% - ${wallInset * 2}px)` };

                                                    return (
                                                        <div
                                                            key={`${direction}-wall`}
                                                            className="absolute rounded-full opacity-95"
                                                            style={{
                                                                ...wallStyle,
                                                                backgroundColor: wallColor
                                                            }}
                                                        />
                                                    );
                                                })}
                                                {(hasUp || hasDown) && (
                                                    <div
                                                        className={`absolute font-black tracking-tight ${hasUp && hasDown ? "text-neon-cyan" : "text-gray-200"}`}
                                                        style={{
                                                            top: fullMap ? "38%" : "34%",
                                                            right: fullMap ? "18%" : "12%",
                                                            fontSize: `${Math.max(7, roomLabelSize + (fullMap ? 2 : 1))}px`,
                                                            textShadow: "0 0 8px rgba(34,211,238,0.45)"
                                                        }}
                                                    >
                                                        {hasUp && hasDown ? "⇅" : hasUp ? "↑" : "↓"}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {cellMarkers.length > 0 && (
                                            <div className="flex items-center justify-center w-full h-full">
                                                {cellMarkers.slice(0, 3).map((marker, idx) => {
                                                    if (marker.isCurrent) {
                                                        if (transitOverlay) return null;
                                                        return (
                                                            <div
                                                                key={`${marker.id}-${idx}`}
                                                                className="relative flex items-center justify-center"
                                                                style={{
                                                                    width: `${markerSize}px`,
                                                                    height: `${markerSize}px`,
                                                                    animation: isMoveTo && recentMovement?.ts
                                                                        ? `${markerTravelAnimation} ${markerTravelDurationMs}ms cubic-bezier(0.22, 0.9, 0.26, 1) 1`
                                                                        : undefined
                                                                }}
                                                            >
                                                                <div
                                                                    className="flex items-center justify-center transition-transform duration-300 ease-out"
                                                                    style={{ transform: `rotate(${currentMarkerRotation}deg)` }}
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]" style={{ width: `${markerSize}px`, height: `${markerSize}px` }}>
                                                                        <path d="M12 2L2 22L12 18L22 22L12 2Z" />
                                                                    </svg>
                                                                </div>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div
                                                            key={`${marker.id}-${idx}`}
                                                            className="rounded-full bg-yellow-400 border border-black shadow-sm"
                                                            title="Squadmate"
                                                            style={{ width: `${squadDotSize}px`, height: `${squadDotSize}px`, margin: fullMap ? "1px" : "0 1px" }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {!fullMap && node && isExplored && !isCorridor && (
                                            <div className="absolute bottom-0.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/80 px-1.5 py-[2px]">
                                                <div className={`h-1.5 w-1.5 rounded-full ${scanned ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.95)]" : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.95)]"}`} title={scanned ? "Scanned" : "Unscanned"} />
                                                <div className={`h-1.5 w-1.5 rounded-full ${secured ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.95)]" : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.95)]"}`} title={secured ? "Secured" : "Unsecured"} />
                                                {parseJSON(node.enemies || "[]", []).length > 0 && (
                                                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.95)]" title="Enemies present" />
                                                )}
                                            </div>
                                        )}

                                        {fullMap && isStart && (
                                            <>
                                                {!isCurrent && (
                                                    <div className="absolute inset-0 flex items-center justify-center text-green-400 font-bold" style={{ fontSize: `${roomLabelSize}px`, ...(uprightStyle || {}) }}>
                                                        A
                                                    </div>
                                                )}
                                                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded border border-green-400/40 bg-black/80 px-1 text-[5px] font-black uppercase tracking-[0.18em] text-green-300" style={uprightStyle}>
                                                    AIR
                                                </div>
                                            </>
                                        )}
                                        {!fullMap && isStart && !isCurrent && (
                                            <div className="absolute inset-0 flex items-center justify-center text-green-400 font-bold tracking-[0.18em]" style={{ fontSize: `${Math.max(5, roomLabelSize - 1)}px`, ...(uprightStyle || {}) }}>
                                                AIR
                                            </div>
                                        )}
                                        {fullMap && node?.type === "ENTRY" && !isCurrent && (
                                            <div className="absolute inset-0 flex items-center justify-center text-neon-cyan font-bold" style={{ fontSize: `${roomLabelSize}px`, ...(uprightStyle || {}) }}>
                                                E
                                            </div>
                                        )}
                                        {((fullMap && isBoss) || (!fullMap && !isCurrent && isBoss && isExplored)) && (
                                            <div className="absolute inset-0 flex items-center justify-center text-red-500 font-bold" style={{ fontSize: `${roomLabelSize}px`, ...(uprightStyle || {}) }}>
                                                {fullMap ? "B" : "BOSS"}
                                            </div>
                                        )}
                                        {isRoomNode && (fullMap || (scanned && isExplored)) && (
                                            <div className="absolute bottom-0.5 right-0.5 font-bold text-gray-300" style={{ fontSize: `${statSize}px`, ...(uprightStyle || {}) }}>
                                                {node?.roomPower ?? "?"}
                                            </div>
                                        )}
                                        {isRoomNode && (fullMap || scanned) && suitAbbr && (
                                            <div className={`absolute top-0.5 left-0.5 font-bold ${suitStyle.text}`} style={{ fontSize: `${statSize}px`, ...(uprightStyle || {}) }}>
                                                {suitAbbr}
                                            </div>
                                        )}
                                        {isCorridor && !fullMap && !isCurrent && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="rounded border border-slate-700 bg-black/80 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.22em] text-slate-300" style={uprightStyle}>
                                                    Hall
                                                </span>
                                            </div>
                                        )}
                                        {!fullMap && !isCorridor && !scanned && isExplored && !isCurrent && !hasDoor && (
                                            <div className={`
                                                absolute bottom-0.5 left-0.5 font-bold opacity-70
                                                ${dist === 1 ? 'text-yellow-500' : ''}
                                                ${dist === 2 ? 'text-orange-500' : ''}
                                                ${dist >= 3 ? 'text-red-500' : ''}
                                            `}
                                                style={{ fontSize: `${Math.max(7, statSize - 1)}px`, ...(uprightStyle || {}) }}
                                            >
                                                {dist}
                                            </div>
                                        )}
                                        {dangerBadge}
                                    </div>
                                );
                            });
                        })}
                        {transitOverlay && (
                            <div className="pointer-events-none absolute inset-0 z-[70]">
                                <div
                                    className="absolute"
                                    style={{
                                        width: `${markerSize}px`,
                                        height: `${markerSize}px`,
                                        animation: `markerTraverse ${markerTravelDurationMs}ms cubic-bezier(0.24, 0.94, 0.3, 1) 1`,
                                        ["--from-x" as any]: `${transitOverlay.fromLeft}px`,
                                        ["--from-y" as any]: `${transitOverlay.fromTop}px`,
                                        ["--to-x" as any]: `${transitOverlay.toLeft}px`,
                                        ["--to-y" as any]: `${transitOverlay.toTop}px`
                                    } as React.CSSProperties}
                                >
                                    <div className="absolute inset-0 rounded-full bg-cyan-400/10 blur-[2px] shadow-[0_0_18px_rgba(34,211,238,0.55)]" />
                                    <div
                                        className="relative flex h-full w-full items-center justify-center"
                                        style={{ transform: `rotate(${currentMarkerRotation}deg)` }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="text-orange-400 drop-shadow-[0_0_10px_rgba(249,115,22,0.9)]" style={{ width: `${markerSize}px`, height: `${markerSize}px` }}>
                                            <path d="M12 2L2 22L12 18L22 22L12 2Z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            )})}
            </div>

            {viewLabel && (
                <div className="absolute bottom-4 left-4 text-2xl font-black font-mono text-neon-cyan tracking-widest pointer-events-none z-50 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
                    {viewLabel}
                </div>
            )}
        </div>
    );
}
