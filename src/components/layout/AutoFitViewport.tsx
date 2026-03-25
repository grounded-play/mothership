"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function AutoFitViewport({ children, contentKey }: { children: ReactNode; contentKey?: string }) {
    const pathname = usePathname();
    const frameRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);

    useLayoutEffect(() => {
        const frame = frameRef.current;
        const content = contentRef.current;
        if (!frame || !content) return;

        let raf = 0;
        const timeouts: number[] = [];

        const updateScale = () => {
            raf = 0;
            const frameWidth = frame.clientWidth;
            const frameHeight = frame.clientHeight;
            const contentWidth = Math.max(content.scrollWidth, content.offsetWidth, 1);
            const contentHeight = Math.max(content.scrollHeight, content.offsetHeight, 1);
            const nextScale = Math.min(1, frameWidth / contentWidth, frameHeight / contentHeight);
            setScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
        };

        const scheduleUpdate = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(updateScale);
        };

        const queueBurst = () => {
            scheduleUpdate();
            [0, 32, 96, 180, 320, 640, 1000].forEach((delay) => {
                timeouts.push(window.setTimeout(scheduleUpdate, delay));
            });
        };

        const resizeObserver = new ResizeObserver(scheduleUpdate);
        resizeObserver.observe(frame);
        resizeObserver.observe(content);

        const mutationObserver = new MutationObserver(scheduleUpdate);
        mutationObserver.observe(content, { childList: true, subtree: true, attributes: true, characterData: true });

        window.addEventListener("resize", scheduleUpdate);
        window.visualViewport?.addEventListener("resize", scheduleUpdate);
        window.addEventListener("load", scheduleUpdate);
        document.fonts?.ready?.then(() => scheduleUpdate()).catch(() => {});
        queueBurst();

        return () => {
            if (raf) cancelAnimationFrame(raf);
            timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener("resize", scheduleUpdate);
            window.visualViewport?.removeEventListener("resize", scheduleUpdate);
            window.removeEventListener("load", scheduleUpdate);
        };
    }, [pathname, contentKey]);

    return (
        <div ref={frameRef} className="relative h-full w-full overflow-hidden">
            <div
                ref={contentRef}
                className="h-full w-full origin-top"
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top center",
                    willChange: "transform"
                }}
            >
                {children}
            </div>
        </div>
    );
}
