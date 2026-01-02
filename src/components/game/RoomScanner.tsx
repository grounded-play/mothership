import React, { useEffect, useRef } from 'react';

interface RoomScannerProps {
    type: string;
    isExplored: boolean;
    integrity: number;
}

export default function RoomScanner({ type, isExplored, integrity }: RoomScannerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let scanLine = 0;

        const draw = () => {
            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, canvas.width, canvas.height); // Clear

            const w = canvas.width;
            const h = canvas.height;
            const cx = w / 2;
            const cy = h / 2;

            // Wireframe Color based on Type
            let color = '#0ff'; // Default Cyan
            if (type === 'ENEMY' || type === 'BOSS') color = '#f00';
            if (type === 'EMPTY') color = '#555';
            if (type === 'START') color = '#0f0';
            if (type === 'LOOT') color = '#ffd700';

            ctx.strokeStyle = color;
            ctx.lineWidth = 1;

            // Draw Wireframe Box (Perspective)
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

            // Text Info
            ctx.fillStyle = color;
            ctx.font = '10px monospace';
            ctx.fillText(`SECTOR: ${type}`, 10, 20);
            ctx.fillText(`INTEGRITY: ${integrity}%`, 10, h - 10);

            if (!isExplored) {
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#fff';
                ctx.font = '12px monospace';
                ctx.fillText("SCANNING...", cx - 30, cy);
            }

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animationFrameId);
    }, [type, isExplored, integrity]);

    return (
        <canvas
            ref={canvasRef}
            width={300}
            height={200}
            className="block w-full h-full border border-gray-800 rounded bg-black shadow-inner"
        />
    );
}
