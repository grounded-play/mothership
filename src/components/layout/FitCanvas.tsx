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
    minScale = 0.55,
    padding = 16,
    children,
}: FitCanvasProps) {
    const frameRef = useRef<HTMLDivElement | null>(null);
    const [view, setView] = useState({ scale: 1, clamped: false });

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
            const clamped = resolvedScale > fitScale;
            setView((current) => {
                if (Math.abs(current.scale - resolvedScale) < 0.0001 && current.clamped === clamped) {
                    return current;
                }
                return { scale: resolvedScale, clamped };
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
        <div ref={frameRef} className="relative h-full w-full overflow-auto custom-scrollbar">
            <div
                className={`flex min-h-full min-w-full justify-center ${view.clamped ? "items-start" : "items-center"}`}
                style={{ padding: `${padding}px` }}
            >
                <div
                    className="relative shrink-0"
                    style={{
                        width: `${width * view.scale}px`,
                        height: `${height * view.scale}px`,
                    }}
                >
                    <div
                        className="absolute left-0 top-0"
                        style={{
                            width: `${width}px`,
                            height: `${height}px`,
                            transform: `scale(${view.scale})`,
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
