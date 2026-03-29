"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type FitCanvasProps = {
    width: number;
    height: number;
    maxScale?: number;
    padding?: number;
    children: ReactNode;
};

export default function FitCanvas({
    width,
    height,
    maxScale = 1.2,
    padding = 16,
    children,
}: FitCanvasProps) {
    const frameRef = useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);

    useLayoutEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;

        let raf = 0;

        const updateScale = () => {
            raf = 0;
            const frameWidth = Math.max(frame.clientWidth - padding * 2, 1);
            const frameHeight = Math.max(frame.clientHeight - padding * 2, 1);
            const nextScale = Math.min(frameWidth / width, frameHeight / height, maxScale);
            setScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
        };

        const schedule = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(updateScale);
        };

        const resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(frame);
        window.addEventListener("resize", schedule);
        window.visualViewport?.addEventListener("resize", schedule);
        schedule();

        return () => {
            if (raf) cancelAnimationFrame(raf);
            resizeObserver.disconnect();
            window.removeEventListener("resize", schedule);
            window.visualViewport?.removeEventListener("resize", schedule);
        };
    }, [height, maxScale, padding, width]);

    return (
        <div ref={frameRef} className="relative h-full w-full overflow-hidden">
            <div
                className="absolute left-1/2 top-1/2"
                style={{
                    width: `${width}px`,
                    height: `${height}px`,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    transformOrigin: "center center",
                    willChange: "transform",
                }}
            >
                {children}
            </div>
        </div>
    );
}
