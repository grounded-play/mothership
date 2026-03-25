"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
const ROTATE_MAX_WIDTH = 900;

export default function ResponsiveShell({ children }: { children: ReactNode }) {
    const [isMobilePortrait, setIsMobilePortrait] = useState(false);
    const [viewportScale, setViewportScale] = useState(1);
    const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
    const [scaledSize, setScaledSize] = useState({ width: BASE_WIDTH, height: BASE_HEIGHT });
    const [isMeasured, setIsMeasured] = useState(false);

    useEffect(() => {
        const updateOrientation = () => {
            if (typeof window === "undefined") return;
            const portrait = window.matchMedia("(orientation: portrait)");
            const mobile = window.matchMedia(`(max-width: ${ROTATE_MAX_WIDTH}px)`);
            setIsMobilePortrait(mobile.matches && portrait.matches);
        };

        updateOrientation();
        const portraitQuery = window.matchMedia("(orientation: portrait)");
        const mobileQuery = window.matchMedia(`(max-width: ${ROTATE_MAX_WIDTH}px)`);
        const handler = () => updateOrientation();

        if (portraitQuery.addEventListener) {
            portraitQuery.addEventListener("change", handler);
            mobileQuery.addEventListener("change", handler);
        } else {
            portraitQuery.addListener(handler);
            mobileQuery.addListener(handler);
        }
        window.addEventListener("resize", handler);

        return () => {
            if (portraitQuery.removeEventListener) {
                portraitQuery.removeEventListener("change", handler);
                mobileQuery.removeEventListener("change", handler);
            } else {
                portraitQuery.removeListener(handler);
                mobileQuery.removeListener(handler);
            }
            window.removeEventListener("resize", handler);
        };
    }, []);

    useLayoutEffect(() => {
        const updateScale = () => {
            if (typeof window === "undefined") return;
            const width = window.visualViewport?.width ?? window.innerWidth;
            const height = window.visualViewport?.height ?? window.innerHeight;
            const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
            const scaledWidth = BASE_WIDTH * scale;
            const scaledHeight = BASE_HEIGHT * scale;
            const offsetX = Math.max(0, (width - scaledWidth) / 2);
            const offsetY = Math.max(0, (height - scaledHeight) / 2);
            setViewportScale(scale);
            setViewportOffset({ x: offsetX, y: offsetY });
            setScaledSize({ width: scaledWidth, height: scaledHeight });
            setIsMeasured(true);
        };

        updateScale();
        window.addEventListener("resize", updateScale);
        window.visualViewport?.addEventListener("resize", updateScale);
        window.visualViewport?.addEventListener("scroll", updateScale);
        return () => {
            window.removeEventListener("resize", updateScale);
            window.visualViewport?.removeEventListener("resize", updateScale);
            window.visualViewport?.removeEventListener("scroll", updateScale);
        };
    }, []);

    return (
        <div className="fixed inset-0 overflow-hidden bg-black text-white">
            {isMobilePortrait && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm px-6">
                    <div className="glass-panel border border-white/10 rounded-xl p-6 text-center max-w-xs">
                        <div className="text-xs uppercase tracking-widest text-neon-cyan mb-2">Rotate Device</div>
                        <div className="text-sm text-white">This interface is built for landscape. Turn your phone sideways to continue.</div>
                    </div>
                </div>
            )}

            <div
                className="absolute top-0 left-0 overflow-hidden"
                style={{
                    width: `${scaledSize.width}px`,
                    height: `${scaledSize.height}px`,
                    transform: `translate(${viewportOffset.x}px, ${viewportOffset.y}px)`,
                    transformOrigin: "top left",
                    opacity: isMeasured ? 1 : 0
                }}
            >
                <div
                    className="absolute top-0 left-0"
                    style={{
                        width: `${BASE_WIDTH}px`,
                        height: `${BASE_HEIGHT}px`,
                        transform: `scale(${viewportScale})`,
                        transformOrigin: "top left",
                        willChange: "transform"
                    }}
                >
                    <div className="w-full h-full overflow-hidden bg-space-void">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
