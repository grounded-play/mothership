"use client";

import { useEffect, useState, type ReactNode } from "react";

const ROTATE_MAX_WIDTH = 900;

export default function ResponsiveShell({ children }: { children: ReactNode }) {
    const [isMobilePortrait, setIsMobilePortrait] = useState(false);

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

            <div className="absolute inset-0 overflow-hidden bg-space-void">
                {children}
            </div>
        </div>
    );
}
