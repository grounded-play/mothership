import React, { useEffect, useRef } from 'react';

interface RoomScannerProps {
    type: string;
    isExplored: boolean;
    integrity: number;
}

export default function RoomScanner({ type, isExplored, integrity }: RoomScannerProps) {
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

            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, w, h); // Clear


            // Wireframe Color based on Type
            let color = '#0ff'; // Default Cyan
            if (type === 'ENEMY' || type === 'BOSS') color = '#f00';
            if (type === 'EMPTY') color = '#555';
            if (type === 'START') color = '#0f0';
            if (type === 'LOOT') color = '#ffd700';

            ctx.strokeStyle = color;
            ctx.lineWidth = 1;

            // Draw Wireframe Box (Perspective) - Scale box relative to canvas size? Or keep fixed?
            // Let's keep fixed size but centered, maybe scale slightly if canvas is huge?
            // Actually, let's keep it fixed but ensure it fits.
            ctx.beginPath();

            // Back Wall
            ctx.strokeRect(cx - 30, cy - 30, 60, 60);
            // Front Wall (Larger)
            const d = 60;
            ctx.strokeRect(cx - d, cy - d, d * 2, d * 2);
            // Connections
            ctx.moveTo(cx - 30, cy - 30); ctx.lineTo(cx - d, cy - d);
            ctx.moveTo(cx + 30, cy - 30); ctx.lineTo(cx + d, cy - d);
            ctx.moveTo(cx - 30, cy + 30); ctx.lineTo(cx - d, cy + d);
            ctx.moveTo(cx + 30, cy + 30); ctx.lineTo(cx + d, cy + d);
            ctx.stroke();

            // Scan Line Effect
            scanLine = (scanLine + 2) % h;
            ctx.fillStyle = `rgba(0, 255, 255, 0.1)`;
            ctx.fillRect(0, scanLine, w, 4);

            // Text Info - Scaling font?
            // Fixed font size is usually fine, but let's make it sharp.
            ctx.fillStyle = color;
            ctx.font = '12px monospace'; // Increased size slightly and dpr handles sharpness
            ctx.fillText(`SECTOR: ${type}`, 10, 20);
            ctx.fillText(`INTEGRITY: ${integrity}%`, 10, h - 10);

            if (!isExplored) {
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#fff';
                ctx.font = '14px monospace';
                const text = "SCANNING...";
                const textMetrics = ctx.measureText(text);
                ctx.fillText(text, cx - (textMetrics.width / 2), cy);
            }

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animationFrameId);
    }, [type, isExplored, integrity, dimensions]);

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
