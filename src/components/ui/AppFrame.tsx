"use client";

import { useEffect } from "react";

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

export default function AppFrame({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const updateScale = () => {
            const scale = Math.min(window.innerWidth / BASE_WIDTH, window.innerHeight / BASE_HEIGHT);
            document.documentElement.style.setProperty("--app-scale", scale.toString());
        };
        updateScale();
        window.addEventListener("resize", updateScale);
        return () => window.removeEventListener("resize", updateScale);
    }, []);

    return (
        <div className="app-frame">
            <div className="rotate-overlay">
                <div className="rotate-card">
                    <div className="rotate-title">Rotate Device</div>
                    <div className="rotate-copy">This game requires a landscape display.</div>
                </div>
            </div>
            <div className="app-scale">
                <div className="app-canvas">
                    <div className="app-content">{children}</div>
                </div>
            </div>
        </div>
    );
}
