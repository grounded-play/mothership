"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type FitCanvasProps = {
    width: number;
    height: number;
    maxScale?: number;
    minScale?: number;
    padding?: number;
    children: ReactNode;
};

export default function FitCanvas({
    width,
    height,
    maxScale = 1.2,
    minScale = 0,
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
            const fitScale = Math.min(frameWidth / width, frameHeight / height, maxScale);
            const resolvedScale = Number.isFinite(fitScale) && fitScale > 0
                ? Math.min(maxScale, Math.max(minScale, fitScale))
                : 1;
            setScale((current) => {
                if (Math.abs(current - resolvedScale) < 0.0001) {
                    return current;
                }
                return resolvedScale;
            });
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
    }, [height, maxScale, minScale, padding, width]);

    return (
        <div ref={frameRef} className="relative h-full w-full overflow-hidden">
            <div
                className="absolute left-1/2 top-1/2"
                style={{
                    width: `${width * scale + padding * 2}px`,
                    height: `${height * scale + padding * 2}px`,
                    transform: "translate(-50%, -50%)",
                }}
            >
                <div
                    className="relative shrink-0"
                    style={{
                        width: `${width * scale + padding * 2}px`,
                        height: `${height * scale + padding * 2}px`,
                    }}
                >
                    <div
                        className="absolute left-0 top-0"
                        style={{
                            left: `${padding}px`,
                            top: `${padding}px`,
                            width: `${width}px`,
                            height: `${height}px`,
                            transform: `scale(${scale})`,
                            transformOrigin: "top left",
                            willChange: "transform",
                        }}
                    >
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
