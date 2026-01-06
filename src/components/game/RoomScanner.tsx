import React, { useEffect, useRef } from 'react';

interface RoomScannerProps {
    type: string;
    isExplored: boolean; // Just visited/visible
    integrity: number;
    suit?: string; // "COMMAND" | "BIOTECH" | "XX"
    suitColor?: string;
    connections?: string[]; // Relative: FORWARD, LEFT, etc.
    windows?: string[]; // Relative: FORWARD, LEFT, etc.
    scanned?: boolean; // Fully Scanned (reveals suit/color)
    relativeNorth?: string; // "FORWARD", "LEFT", "RIGHT", "BACK"
    facing?: string; // "NORTH", "WEST" (For Debug)
}

export default function RoomScanner({ type, isExplored, integrity, suit, suitColor, connections = [], windows = [], scanned = false, relativeNorth = "FORWARD", facing }: RoomScannerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!containerRef.current) return;

        const updateDimensions = () => {
            if (containerRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                setDimensions({ width: clientWidth, height: clientHeight });
            }
        };

        const resizeObserver = new ResizeObserver(updateDimensions);
        resizeObserver.observe(containerRef.current);
        updateDimensions(); // Initial

        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Handle High DPI
        const dpr = window.devicePixelRatio || 1;
        canvas.width = dimensions.width * dpr;
        canvas.height = dimensions.height * dpr;

        // Scale context to match logical size
        ctx.scale(dpr, dpr);

        let animationFrameId: number;
        let scanLine = 0;

        const draw = () => {
            // Use logical dimensions for drawing logic
            const w = dimensions.width;
            const h = dimensions.height;
            const cx = w / 2;
            const cy = h / 2;
            const scale = Math.min(w, h) / 300; // Base scale reference (Dynamic Size)

            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, w, h); // Clear

            const isRevealed = scanned || isExplored; // Basic wireframe if explored
            const showDetails = scanned; // Full details only if scanned

            // Color Logic
            let color = '#0ff'; // Default Cyan
            let shadowColor = color;

            if (showDetails) {
                if (suitColor) {
                    if (suitColor.includes("red")) color = "#ef4444";
                    else if (suitColor.includes("orange")) color = "#f97316";
                    else if (suitColor.includes("green")) color = "#22c55e";
                    else if (suitColor.includes("purple")) color = "#a855f7";
                    else if (suitColor.includes("yellow")) color = "#eab308";
                    else if (suitColor.includes("white")) color = "#ffffff";
                } else {
                    if (type === 'ENEMY' || type === 'BOSS') color = '#f00';
                    if (type === 'EMPTY') color = '#555';
                    if (type === 'START') color = '#0f0';
                    if (type === 'LOOT') color = '#ffd700';
                }
                shadowColor = color;
            } else {
                color = '#333'; // Unscanned dim
                shadowColor = '#000';
            }

            ctx.strokeStyle = color;
            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = showDetails ? 10 * scale : 0;
            ctx.lineWidth = 2 * scale;

            // Draw Wireframe Box (Perspective)
            ctx.beginPath();
            const b = 50 * scale;
            const f = 100 * scale;

            // Draw Box
            ctx.strokeRect(cx - b, cy - b, b * 2, b * 2); // Back
            ctx.strokeRect(cx - f, cy - f, f * 2, f * 2); // Front
            ctx.moveTo(cx - b, cy - b); ctx.lineTo(cx - f, cy - f); // Top Left
            ctx.moveTo(cx + b, cy - b); ctx.lineTo(cx + f, cy - f); // Top Right
            ctx.moveTo(cx - b, cy + b); ctx.lineTo(cx - f, cy + f); // Bottom Left
            ctx.moveTo(cx + b, cy + b); ctx.lineTo(cx + f, cy + f); // Bottom Right
            ctx.stroke();

            // Draw Compass on Floor (Visual Orientation)
            if (scanned || isExplored) {
                const floorColor = color;
                ctx.font = `bold ${10 * scale}px monospace`;
                ctx.fillStyle = floorColor;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.globalAlpha = 0.7;

                const relNorthIdx = ["FORWARD", "RIGHT", "BACK", "LEFT"].indexOf(relativeNorth || "FORWARD");
                const labels = ["N", "E", "S", "W"]; // North, East, South, West

                // Layout Update: Forward on Wall Center. Sides Centered. Back near Front.
                const pos = [
                    { x: cx, y: cy, label: labels[(4 - relNorthIdx + 0) % 4] }, // FWD (Center of Back Wall)
                    { x: cx + b + (f - b) * 0.5, y: cy + b + (f - b) * 0.5, label: labels[(4 - relNorthIdx + 1) % 4] }, // RIGHT (Mid Floor)
                    { x: cx, y: cy + f - 30 * scale, label: labels[(4 - relNorthIdx + 2) % 4] }, // BACK (Floor near Front)
                    { x: cx - b - (f - b) * 0.5, y: cy + b + (f - b) * 0.5, label: labels[(4 - relNorthIdx + 3) % 4] }, // LEFT (Mid Floor)
                ];

                pos.forEach(p => {
                    ctx.fillText(p.label, p.x, p.y);
                });
                ctx.globalAlpha = 1;

                // Debug Facing Info
                if (facing) {
                    ctx.font = `${8 * scale}px monospace`;
                    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
                    ctx.fillText(facing, cx, cy + f + 10 * scale);
                }
            }

            // DRAW FEATURES (Doors/Windows/Hatches)
            // Only show if SCANNED (per user request: "seeing room color before scanning and doors too")
            if (showDetails) {
                ctx.shadowBlur = 0;
                ctx.fillStyle = (color + "44");

                // DOORS (Filled) vs WINDOWS (Outlined/Distinct)

                // FORWARD (Back Wall)
                if (connections.includes("FORWARD")) {
                    const dw = b * 0.6;
                    const dh = b * 1.2;
                    ctx.fillRect(cx - dw / 2, cy - dh / 4, dw, dh);
                } else if (windows.includes("FORWARD")) {
                    // Window on Back Wall
                    const dw = b * 0.8;
                    const dh = b * 0.8;
                    ctx.save();
                    ctx.strokeStyle = "#fff";
                    ctx.setLineDash([5, 5]);
                    ctx.strokeRect(cx - dw / 2, cy - dh / 2, dw, dh);
                    ctx.restore();
                }

                // LEFT (Left Wall)
                if (connections.includes("LEFT")) {
                    ctx.beginPath();
                    // Perspective Correct Coords (Door - Grounded)
                    const xFront = f * 0.8;
                    const xBack = b * 1.2;
                    const yCeilFront = cy - xFront * 0.6;
                    const yCeilBack = cy - xBack * 0.6;
                    const yFloorFront = cy + xFront;
                    const yFloorBack = cy + xBack;

                    ctx.moveTo(cx - xFront, yCeilFront);
                    ctx.lineTo(cx - xBack, yCeilBack);
                    ctx.lineTo(cx - xBack, yFloorBack);
                    ctx.lineTo(cx - xFront, yFloorFront);

                    ctx.fillStyle = color + "88";
                    ctx.fill();
                } else if (windows.includes("LEFT")) {
                    // Window - Floating (Legacy Style)
                    const topY = cy - b * 0.5;
                    const botY = cy + b * 0.5;
                    ctx.save();
                    ctx.strokeStyle = "#fff";
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    // Use simple perspective scaling but keep it floating
                    ctx.moveTo(cx - f * 0.8, topY - 10 * scale);
                    ctx.lineTo(cx - b * 1.2, topY);
                    ctx.lineTo(cx - b * 1.2, botY);
                    ctx.lineTo(cx - f * 0.8, botY + 10 * scale);
                    ctx.stroke();
                    ctx.restore();
                }

                // RIGHT (Right Wall)
                if (connections.includes("RIGHT")) {
                    ctx.beginPath();
                    const xFront = f * 0.8;
                    const xBack = b * 1.2;
                    const yCeilFront = cy - xFront * 0.6;
                    const yCeilBack = cy - xBack * 0.6;
                    const yFloorFront = cy + xFront;
                    const yFloorBack = cy + xBack;

                    ctx.moveTo(cx + xFront, yCeilFront);
                    ctx.lineTo(cx + xBack, yCeilBack);
                    ctx.lineTo(cx + xBack, yFloorBack);
                    ctx.lineTo(cx + xFront, yFloorFront);

                    ctx.fillStyle = color + "88";
                    ctx.fill();
                } else if (windows.includes("RIGHT")) {
                    // Window - Floating
                    const topY = cy - b * 0.5;
                    const botY = cy + b * 0.5;
                    ctx.save();
                    ctx.strokeStyle = "#fff";
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(cx + f * 0.8, topY - 10 * scale);
                    ctx.lineTo(cx + b * 1.2, topY);
                    ctx.lineTo(cx + b * 1.2, botY);
                    ctx.lineTo(cx + f * 0.8, botY + 10 * scale);
                    ctx.stroke();
                    ctx.restore();
                }

                // BACK (Front Frame)
                if (connections.includes("BACK")) {
                    ctx.lineWidth = 4 * scale;
                    ctx.strokeStyle = color;
                    ctx.strokeRect(cx - f * 1.1, cy - f * 1.1, f * 2.2, f * 2.2);
                    ctx.lineWidth = 1 * scale;
                }

                // HATCHES (Up/Down)
                if (connections.includes("UP")) {
                    // Ceiling Hatch - Move higher (0.85) to appear on the ceiling plane better
                    ctx.beginPath();
                    ctx.arc(cx, cy - f * 0.85, 20 * scale, 0, Math.PI * 2);
                    ctx.stroke();
                    // Ladder rungs
                    for (let i = 0; i < 3; i++) {
                        ctx.moveTo(cx - 10 * scale, cy - f * 0.85 - 10 * scale + i * 10 * scale);
                        ctx.lineTo(cx + 10 * scale, cy - f * 0.85 - 10 * scale + i * 10 * scale);
                        ctx.stroke();
                    }
                }
                if (connections.includes("DOWN")) {
                    // Floor Hatch
                    ctx.beginPath();
                    ctx.arc(cx, cy + f * 0.6, 20 * scale, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }

            // TEXT OVERLAYS
            if (!showDetails) {
                ctx.font = `bold ${16 * scale}px monospace`;
                ctx.fillStyle = "#ef4444";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("UNSCANNED", cx, cy);

                // Static Noise
                if (Math.random() > 0.8) {
                    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.1})`;
                    ctx.fillRect(cx - b, cy - b, b * 2, b * 2);
                }
            } else {
                // Scan Line
                scanLine = (scanLine + 2 * scale) % h;
                ctx.beginPath();
                ctx.moveTo(0, scanLine);
                ctx.lineTo(w, scanLine);
                ctx.strokeStyle = `rgba(255, 255, 255, 0.1)`;
                ctx.stroke();

                // Info
                ctx.fillStyle = color;
                ctx.textAlign = "left";
                ctx.textBaseline = "top";
                ctx.font = `bold ${12 * scale}px monospace`;
                ctx.fillText(`SECTOR: ${type}`, 10, 10);
                if (suit) ctx.fillText(`TS: ${suit}`, 10, 10 + (15 * scale));
            }

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animationFrameId);
    }, [dimensions, type, isExplored, suitColor, connections, suit, windows, scanned]);

    return (
        <div ref={containerRef} className="w-full h-full relative border border-gray-800 rounded bg-black shadow-inner overflow-hidden">
            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%' }}
                className="block"
            />
        </div>
    );
}
